
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * New Category Matching Edge Function
 * 
 * This function is triggered when a new category is created.
 * It uses a two-step matching process:
 * 1. Embedding-based similarity search (>= 0.20 threshold) to find candidate recalls
 * 2. Claude API to identify which candidates are the closest matches
 * 
 * Process:
 * 1. Receives a category ID
 * 2. Generates category embedding from category_name + category_search_description using base64 encoding
 * 3. Finds all recalls with similarity >= 0.20 using embeddings
 * 4. Uses Claude to analyze and rank the candidate recalls
 * 5. Updates recollections table with high-confidence matches
 */

// Helper function to generate embedding using OpenAI with base64 encoding
async function generateEmbedding(text: string, openaiApiKey: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.trim(),
      encoding_format: 'base64'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI embedding API error: ${errorText}`);
  }

  const data = await response.json();
  const embeddingBase64 = data.data[0].embedding;
  
  // Decode base64 to get the actual embedding array
  const binaryString = atob(embeddingBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const float32Array = new Float32Array(bytes.buffer);
  const embedding = Array.from(float32Array);
  
  console.log('Decoded embedding array length:', embedding.length);
  
  return embedding;
}

// Helper function to calculate cosine similarity between two vectors
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    console.log('Invalid vectors for cosine similarity:', {
      vecALength: vecA?.length,
      vecBLength: vecB?.length
    });
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    console.log('Zero norm detected in cosine similarity');
    return 0;
  }

  const similarity = dotProduct / (normA * normB);
  return similarity;
}

// Helper function to parse stored embeddings (handles both array and string formats)
function parseStoredEmbedding(storedEmbedding: any): number[] | null {
  if (!storedEmbedding) return null;

  // If already an array, return it
  if (Array.isArray(storedEmbedding)) {
    return storedEmbedding;
  }

  // If it's a string, try to parse it
  if (typeof storedEmbedding === 'string') {
    try {
      const cleanStr = storedEmbedding.replace(/[\[\]]/g, '');
      const embeddingArray = cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
      return embeddingArray;
    } catch (e) {
      console.error('Failed to parse embedding string:', e);
      return null;
    }
  }

  return null;
}

// Helper function to sanitize and truncate text for Claude
function sanitizeText(text: string, maxLength: number = 500): string {
  if (!text) return '';
  
  // Remove excessive whitespace and newlines
  let sanitized = text.replace(/\s+/g, ' ').trim();
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  
  return sanitized;
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== New Category Matching Edge Function Started ===');
    console.log('Request method:', req.method);
    console.log('Timestamp:', new Date().toISOString());

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey || !claudeApiKey) {
      console.error('Missing required environment variables');
      return new Response(JSON.stringify({
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Parse request body
    const body = await req.json();
    console.log('Request body:', body);

    const { categoryId } = body;

    // Validate input
    if (!categoryId) {
      console.error('Missing required parameter: categoryId');
      return new Response(JSON.stringify({
        error: 'categoryId is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Step 1: Fetch category data
    console.log('Step 1: Fetching category data...');
    const { data: categoryData, error: categoryError } = await supabase
      .from('recollection_categories')
      .select('id, category_name, category_search_description, user_id')
      .eq('id', categoryId)
      .single();

    if (categoryError || !categoryData) {
      console.error('Error fetching category:', categoryError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch category data',
        details: categoryError?.message
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log('Category data fetched:', {
      id: categoryData.id,
      name: categoryData.category_name,
      description: categoryData.category_search_description,
      userId: categoryData.user_id
    });

    // Step 2: Generate category embedding from category_name + category_search_description using base64
    console.log('Step 2: Generating category embedding from category_name + category_search_description with base64 encoding...');
    
    // Combine category_name and category_search_description for embedding
    const categoryName = categoryData.category_name || '';
    const categoryDescription = categoryData.category_search_description || '';
    const categoryText = `${categoryName}. ${categoryDescription}`.trim();
    
    if (!categoryText.trim()) {
      console.error('Category has empty name and description');
      return new Response(JSON.stringify({
        error: 'Category name and description are empty',
        details: 'Cannot generate embedding for empty category'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    let categoryEmbedding: number[];
    
    try {
      console.log(`Generating embedding for category using combined text: "${categoryText}"`);
      categoryEmbedding = await generateEmbedding(categoryText, openaiApiKey);
      console.log(`Generated category embedding, length: ${categoryEmbedding.length}`);
    } catch (error) {
      console.error('Error generating category embedding:', error);
      return new Response(JSON.stringify({
        error: 'Failed to generate category embedding',
        details: error.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Step 3: Fetch all recalls for this user with embeddings
    console.log('Step 3: Fetching recalls for user:', categoryData.user_id);
    const { data: recallsData, error: recallsError } = await supabase
      .from('recalls')
      .select('id, text, recall_embedding, user_id, location, location_primary_type')
      .eq('user_id', categoryData.user_id)
      .not('recall_embedding', 'is', null);

    if (recallsError) {
      console.error('Error fetching recalls:', recallsError);
      return new Response(JSON.stringify({
        error: 'Failed to fetch recalls',
        details: recallsError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    if (!recallsData || recallsData.length === 0) {
      console.log('No recalls found for user');
      return new Response(JSON.stringify({
        success: true,
        message: 'No recalls found for user',
        categoryId,
        matchCount: 0
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log(`Found ${recallsData.length} recalls with embeddings`);

    // Step 4: Calculate similarity scores for each recall (text + images)
    console.log('Step 4: Calculating similarity scores for each recall...');
    const recallScores = await Promise.all(
      recallsData.map(async (recall) => {
        let maxSimilarity = 0;
        let matchSource = 'none';

        // Compare with recall text embedding
        const recallEmbeddingArray = parseStoredEmbedding(recall.recall_embedding);
        if (recallEmbeddingArray && recallEmbeddingArray.length > 0) {
          const textSimilarity = cosineSimilarity(recallEmbeddingArray, categoryEmbedding);
          console.log(`Recall ${recall.id} text similarity: ${textSimilarity.toFixed(4)}`);
          if (textSimilarity > maxSimilarity) {
            maxSimilarity = textSimilarity;
            matchSource = 'text';
          }
        }

        // Fetch and compare with image embeddings
        const { data: imagesData, error: imagesError } = await supabase
          .from('recall_images')
          .select('id, recall_image_embedding, ocr_text, image_explanation')
          .eq('recall_id', recall.id)
          .not('recall_image_embedding', 'is', null);

        if (!imagesError && imagesData) {
          for (let i = 0; i < imagesData.length; i++) {
            const image = imagesData[i];
            const imageEmbeddingArray = parseStoredEmbedding(image.recall_image_embedding);
            if (imageEmbeddingArray && imageEmbeddingArray.length > 0) {
              const imgSimilarity = cosineSimilarity(imageEmbeddingArray, categoryEmbedding);
              console.log(`Recall ${recall.id} image ${i} similarity: ${imgSimilarity.toFixed(4)}`);
              if (imgSimilarity > maxSimilarity) {
                maxSimilarity = imgSimilarity;
                matchSource = `image_${i}`;
              }
            }
          }
        }

        return {
          recallId: recall.id,
          recallText: recall.text || '',
          location: recall.location || '',
          locationType: recall.location_primary_type || '',
          similarity: maxSimilarity,
          matchSource,
          images: imagesData || []
        };
      })
    );

    console.log('Calculated similarity scores for all recalls');

    // Step 5: Filter recalls with similarity >= 0.20
    const SIMILARITY_THRESHOLD = 0.20;
    const candidateRecalls = recallScores.filter((recall) => recall.similarity >= SIMILARITY_THRESHOLD);
    
    console.log(`Found ${candidateRecalls.length} candidate recalls with similarity >= ${SIMILARITY_THRESHOLD}`);

    if (candidateRecalls.length === 0) {
      console.log('No recalls matched with sufficient similarity (>= 0.20)');
      
      // Delete any existing recollections for this category
      const { error: deleteError } = await supabase
        .from('recollections')
        .delete()
        .eq('category_id', categoryId)
        .eq('user_id', categoryData.user_id);

      if (deleteError) {
        console.error('Error deleting existing recollections:', deleteError);
      }

      const processingTime = Date.now() - startTime;
      return new Response(JSON.stringify({
        success: true,
        categoryId,
        matchCount: 0,
        message: 'No recalls matched with sufficient similarity',
        processingTimeMs: processingTime
      }), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Sort by similarity (highest first)
    candidateRecalls.sort((a, b) => b.similarity - a.similarity);

    // Step 6: Use Claude claude-opus-4-5 to analyze and rank the candidate recalls
    console.log('Step 6: Using Claude claude-opus-4-5 to analyze and rank candidate recalls...');

    // Prepare context for Claude with recall information
    const recallsContext = candidateRecalls.map((recall, idx) => {
      const recallId = `RECALL_${idx + 1}`;
      const similarity = Math.round(recall.similarity * 100);
      
      let contextText = `${recallId} (${similarity}% similarity):\nText: ${sanitizeText(recall.recallText, 300)}`;
      
      // Add location information if available
      if (recall.location) {
        contextText += `\nLocation: ${sanitizeText(recall.location, 100)}`;
        if (recall.locationType) {
          contextText += ` (${recall.locationType})`;
        }
      }
      
      // Add image information if available
      if (recall.images && recall.images.length > 0) {
        const imageInfo = recall.images
          .map((img: any) => {
            const parts = [];
            if (img.ocr_text) parts.push(`OCR: ${sanitizeText(img.ocr_text, 250)}`);
            if (img.image_explanation) parts.push(`Description: ${sanitizeText(img.image_explanation, 100)}`);
            return parts.join(', ');
          })
          .filter((info: string) => info.length > 0)
          .join('; ');
        
        if (imageInfo) {
          contextText += `\nImages: ${imageInfo}`;
        }
      }
      
      return {
        recallId,
        actualId: recall.recallId,
        similarity: recall.similarity,
        contextText
      };
    });

    const context = recallsContext.map((r) => r.contextText).join('\n\n');

    const systemPrompt = `You are an expert at matching recalls to categories. You will be given a category description and a list of candidate recalls that have already been filtered by embedding similarity. Use the Category Description as a guide to understand what the user wants in the category.

Your task is to:
1. Analyze each recall to determine if it truly belongs to the category
2. Assign a confidence score (0-100) for each recall

A recall should only match if it clearly relates to the category description.

Respond with valid JSON only, no markdown.`;

    const userPrompt = `Category: ${categoryData.category_name}
Category Description: ${categoryText}

Candidate Recalls:
${context}

Analyze each recall and provide your response in JSON format:
{
  "matches": [
    {"recallId": "RECALL_1", "confidence": 85, "reason": "brief explanation"},
    {"recallId": "RECALL_2", "confidence": 70, "reason": "brief explanation"}
  ]
}

Only include recalls with confidence >= 55. If no recalls meet this threshold, return an empty matches array.`;

    console.log('Making request to Claude claude-opus-4-5...');
    const openaiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('Claude API error:', errorText);
      console.error('Response status:', openaiResponse.status);
      console.error('Response headers:', JSON.stringify(Object.fromEntries(openaiResponse.headers.entries())));
      return new Response(JSON.stringify({
        error: 'Failed to analyze recalls with Claude',
        details: errorText
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const openaiData = await openaiResponse.json();
    console.log('Claude response received:', JSON.stringify(openaiData, null, 2));
    const openaiContent = openaiData.content?.[0]?.text;

    let matches: Array<{ recallId: string; confidence: number; reason: string }> = [];

    if (openaiContent) {
      try {
        const parsed = JSON.parse(openaiContent);
        matches = parsed.matches || [];
        console.log(`Claude identified ${matches.length} high-confidence matches`);
      } catch (parseError) {
        console.error('Failed to parse Claude response:', parseError);
        console.error('Claude response content:', openaiContent);
        
        // Fallback: use all candidates with similarity-based scores
        matches = candidateRecalls.map((recall, idx) => ({
          recallId: `RECALL_${idx + 1}`,
          confidence: Math.round(recall.similarity * 100),
          reason: 'Fallback: based on embedding similarity'
        })).filter((m) => m.confidence >= 60);
        
        console.log(`Using fallback: ${matches.length} matches based on similarity`);
      }
    }

    // Map recall IDs back to actual recall IDs
    const finalMatches = matches
      .map((match) => {
        const recallContext = recallsContext.find((r) => r.recallId === match.recallId);
        if (!recallContext) return null;
        
        return {
          recallId: recallContext.actualId,
          confidence: match.confidence,
          similarity: recallContext.similarity,
          reason: match.reason
        };
      })
      .filter((m) => m !== null);

    console.log(`Final matches: ${finalMatches.length} recalls`);

    // Step 7: Update recollections table
    if (finalMatches.length > 0) {
      // Delete existing recollections for this category
      console.log('Deleting existing recollections for category:', categoryId);
      const { error: deleteError } = await supabase
        .from('recollections')
        .delete()
        .eq('category_id', categoryId)
        .eq('user_id', categoryData.user_id);

      if (deleteError) {
        console.error('Error deleting existing recollections:', deleteError);
        return new Response(JSON.stringify({
          error: 'Failed to delete existing recollections',
          details: deleteError.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      // Insert new recollections
      const recollectionsToInsert = finalMatches.map((match) => ({
        recall_id: match.recallId,
        user_id: categoryData.user_id,
        category_id: categoryId,
        match_score: match.confidence
      }));

      console.log('Inserting new recollections:', recollectionsToInsert.length);
      const { error: insertError } = await supabase
        .from('recollections')
        .insert(recollectionsToInsert);

      if (insertError) {
        console.error('Error inserting recollections:', insertError);
        return new Response(JSON.stringify({
          error: 'Failed to create recollections',
          details: insertError.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }

      console.log('Recollections created successfully');
    } else {
      console.log('No high-confidence matches found');
      
      // Delete existing recollections
      const { error: deleteError } = await supabase
        .from('recollections')
        .delete()
        .eq('category_id', categoryId)
        .eq('user_id', categoryData.user_id);

      if (deleteError) {
        console.error('Error deleting existing recollections:', deleteError);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log('=== New Category Matching completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    return new Response(JSON.stringify({
      success: true,
      categoryId,
      categoryName: categoryData.category_name,
      candidateCount: candidateRecalls.length,
      matchCount: finalMatches.length,
      matches: finalMatches.map((m) => ({
        recallId: m.recallId,
        confidence: m.confidence,
        similarity: Math.round(m.similarity * 100),
        reason: m.reason
      })),
      processingTimeMs: processingTime
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in New Category Matching Edge Function ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Processing time before error:', processingTime, 'ms');

    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: processingTime
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
