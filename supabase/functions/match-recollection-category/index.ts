import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * Match Recollection Category Edge Function (Enhanced with Claude Analysis)
 * 
 * This function is triggered when a recall is created or updated.
 * It uses a two-step matching process similar to new-category-matching:
 * 1. Embedding-based similarity search (>= 0.20 threshold) to find candidate categories
 * 2. Claude API to identify which candidates are the closest matches
 * 
 * Process:
 * 1. Receives a recall ID (from database trigger or manual call)
 * 2. Fetches recall data including text, location, type, images (OCR + explanation), and persons
 * 3. Generates recall embedding if not exists
 * 4. Finds all categories with similarity >= 0.20 using embeddings (using category_name + category_search_description)
 * 5. Uses Claude to analyze and rank the candidate categories
 * 6. Updates recollections table with high-confidence matches (>= 60)
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

// Helper function to match a recall against all categories using embeddings + Claude
async function matchRecallAgainstCategories(
  recallId: string,
  supabaseUrl: string,
  supabaseServiceKey: string,
  openaiApiKey: string,
  corsHeaders: Record<string, string>,
  startTime: number
): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Step 1: Fetch recall data with embedding
  console.log('Step 1: Fetching recall data with embedding...');
  const { data: recallData, error: recallError } = await supabase
    .from('recalls')
    .select('id, text, recall_embedding, user_id, location, location_primary_type')
    .eq('id', recallId)
    .single();

  if (recallError || !recallData) {
    console.error('Error fetching recall:', recallError);
    return new Response(JSON.stringify({
      error: 'Failed to fetch recall data',
      details: recallError?.message
    }), {
      status: 404,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  console.log('Recall data fetched:', {
    id: recallData.id,
    hasEmbedding: !!recallData.recall_embedding,
    embeddingLength: recallData.recall_embedding?.length,
    userId: recallData.user_id,
    hasLocation: !!recallData.location,
    locationType: recallData.location_primary_type
  });

  // Step 2: Fetch recall images with embeddings, OCR, and explanations
  console.log('Step 2: Fetching recall images with embeddings, OCR, and explanations...');
  const { data: imagesData, error: imagesError } = await supabase
    .from('recall_images')
    .select('id, recall_image_embedding, ocr_text, image_explanation')
    .eq('recall_id', recallId);

  if (imagesError) {
    console.error('Error fetching images:', imagesError);
  }

  const images = imagesData || [];
  console.log(`Found ${images.length} images`);

  // Step 3: Fetch persons associated with this recall
  console.log('Step 3: Fetching persons associated with recall...');
  const { data: recallPeopleData, error: recallPeopleError } = await supabase
    .from('recall_people')
    .select('person_id')
    .eq('recall_id', recallId);

  if (recallPeopleError) {
    console.error('Error fetching recall people:', recallPeopleError);
  }

  let personNames: string[] = [];
  if (recallPeopleData && recallPeopleData.length > 0) {
    const personIds = recallPeopleData.map(rp => rp.person_id);
    const { data: personsData, error: personsError } = await supabase
      .from('persons')
      .select('person_name')
      .in('id', personIds);

    if (!personsError && personsData) {
      personNames = personsData.map(p => p.person_name).filter(name => name);
      console.log(`Found ${personNames.length} persons:`, personNames);
    }
  }

  // Step 4: Generate or fetch recall embedding
  let recallEmbedding: number[] | null = parseStoredEmbedding(recallData.recall_embedding);
  
  if (!recallEmbedding && recallData.text) {
    console.log('Generating recall embedding from text...');
    try {
      recallEmbedding = await generateEmbedding(recallData.text, openaiApiKey);
      
      // Update the recall with the new embedding
      const { error: updateError } = await supabase
        .from('recalls')
        .update({ recall_embedding: recallEmbedding })
        .eq('id', recallId);
      
      if (updateError) {
        console.error('Error updating recall embedding:', updateError);
      } else {
        console.log('Recall embedding generated and saved');
      }
    } catch (error) {
      console.error('Error generating recall embedding:', error);
    }
  }

  // Check if we have any embeddings to work with
  const imageEmbeddings = images
    .map(img => parseStoredEmbedding(img.recall_image_embedding))
    .filter(emb => emb !== null);

  if (!recallEmbedding && imageEmbeddings.length === 0) {
    console.log('No embeddings available for recall');
    return new Response(JSON.stringify({
      success: true,
      message: 'No embeddings available for recall',
      recallId
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Step 5: Fetch all categories for this user
  console.log('Step 5: Fetching categories for user:', recallData.user_id);
  const { data: categoriesData, error: categoriesError } = await supabase
    .from('recollection_categories')
    .select('id, category_name, category_search_description')
    .eq('user_id', recallData.user_id);

  if (categoriesError) {
    console.error('Error fetching categories:', categoriesError);
    return new Response(JSON.stringify({
      error: 'Failed to fetch categories',
      details: categoriesError.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  if (!categoriesData || categoriesData.length === 0) {
    console.log('No categories found for user');
    return new Response(JSON.stringify({
      success: true,
      message: 'No categories found for user',
      recallId
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const categories = categoriesData;
  console.log(`Found ${categories.length} categories to match against`);

  // Step 6: Generate embeddings for each category using category_name + category_search_description
  console.log('Step 6: Generating category embeddings from category_name + category_search_description...');
  const categoryEmbeddings = await Promise.all(
    categories.map(async (category) => {
      try {
        // Combine category_name and category_search_description for embedding
        const categoryName = category.category_name || '';
        const categoryDescription = category.category_search_description || '';
        const categoryText = `${categoryName}. ${categoryDescription}`.trim();
        
        if (!categoryText.trim()) {
          console.log(`Category ${category.id} has empty name and description, skipping`);
          return null;
        }
        console.log(`Generating embedding for category: ${category.category_name} with combined text`);
        const embedding = await generateEmbedding(categoryText, openaiApiKey);
        console.log(`Generated embedding for ${category.category_name}, length: ${embedding.length}`);
        return {
          categoryId: category.id,
          categoryName: category.category_name,
          categoryDescription: category.category_search_description,
          embedding
        };
      } catch (error) {
        console.error(`Error generating embedding for category ${category.id}:`, error);
        return null;
      }
    })
  );

  const validCategoryEmbeddings = categoryEmbeddings.filter(ce => ce !== null);
  console.log(`Generated ${validCategoryEmbeddings.length} category embeddings`);

  if (validCategoryEmbeddings.length === 0) {
    console.error('Failed to generate any category embeddings');
    return new Response(JSON.stringify({
      error: 'Failed to generate category embeddings'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  // Step 7: Calculate similarity scores
  console.log('Step 7: Calculating similarity scores...');
  const categoryScores = validCategoryEmbeddings.map((catEmbed) => {
    let maxSimilarity = 0;
    let matchSource = 'none';

    // Compare with recall text embedding
    if (recallEmbedding) {
      const textSimilarity = cosineSimilarity(recallEmbedding, catEmbed.embedding);
      console.log(`Text similarity for ${catEmbed.categoryName}: ${textSimilarity.toFixed(4)}`);
      if (textSimilarity > maxSimilarity) {
        maxSimilarity = textSimilarity;
        matchSource = 'text';
      }
    }

    // Compare with image embeddings
    for (let i = 0; i < imageEmbeddings.length; i++) {
      const imgEmbed = imageEmbeddings[i];
      if (imgEmbed) {
        const imgSimilarity = cosineSimilarity(imgEmbed, catEmbed.embedding);
        console.log(`Image ${i} similarity for ${catEmbed.categoryName}: ${imgSimilarity.toFixed(4)}`);
        if (imgSimilarity > maxSimilarity) {
          maxSimilarity = imgSimilarity;
          matchSource = `image_${i}`;
        }
      }
    }

    return {
      categoryId: catEmbed.categoryId,
      categoryName: catEmbed.categoryName,
      categoryDescription: catEmbed.categoryDescription,
      similarity: maxSimilarity,
      matchSource
    };
  });

  console.log('Category scores:', categoryScores);

  // Step 8: Filter categories with similarity >= 0.20
  const SIMILARITY_THRESHOLD = 0.20;
  const candidateCategories = categoryScores.filter((cat) => cat.similarity >= SIMILARITY_THRESHOLD);
  
  console.log(`Found ${candidateCategories.length} candidate categories with similarity >= ${SIMILARITY_THRESHOLD}`);

  if (candidateCategories.length === 0) {
    console.log('No categories matched with sufficient similarity (>= 0.20)');
    
    // Delete any existing recollections for this recall
    const { error: deleteError } = await supabase
      .from('recollections')
      .delete()
      .eq('recall_id', recallId)
      .eq('user_id', recallData.user_id);

    if (deleteError) {
      console.error('Error deleting existing recollections:', deleteError);
    }

    const processingTime = Date.now() - startTime;
    return new Response(JSON.stringify({
      success: true,
      recallId,
      matchCount: 0,
      message: 'No categories matched with sufficient similarity',
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
  candidateCategories.sort((a, b) => b.similarity - a.similarity);

  // Step 9: Use OpenAI to analyze and rank the candidate categories
  console.log('Step 9: Using OpenAI to analyze and rank candidate categories...');

  // Prepare recall context for Claude
  let recallContext = `Text: ${sanitizeText(recallData.text || 'No text', 300)}`;
  
  if (recallData.location) {
    recallContext += `\nLocation: ${sanitizeText(recallData.location, 100)}`;
  }
  
  if (recallData.location_primary_type) {
    recallContext += `\nLocation Type: ${recallData.location_primary_type}`;
  }
  
  if (images.length > 0) {
    const imageInfo = images
      .map((img: any, idx: number) => {
        const parts = [];
        if (img.ocr_text) parts.push(`OCR: ${sanitizeText(img.ocr_text, 150)}`);
        if (img.image_explanation) parts.push(`Description: ${sanitizeText(img.image_explanation, 150)}`);
        return parts.length > 0 ? `Image ${idx + 1}: ${parts.join(', ')}` : null;
      })
      .filter((info: string | null) => info !== null)
      .join('\n');
    
    if (imageInfo) {
      recallContext += `\n${imageInfo}`;
    }
  }
  
  if (personNames.length > 0) {
    recallContext += `\nPeople: ${personNames.join(', ')}`;
  }

  // Prepare category context for Claude
  const categoriesContext = candidateCategories.map((cat, idx) => {
    const categoryId = `CATEGORY_${idx + 1}`;
    const similarity = Math.round(cat.similarity * 100);
    
    let contextText = `${categoryId} (${similarity}% similarity):\nName: ${cat.categoryName}`;
    
    if (cat.categoryDescription) {
      contextText += `\nDescription: ${sanitizeText(cat.categoryDescription, 200)}`;
    }
    
    return {
      categoryId,
      actualId: cat.categoryId,
      similarity: cat.similarity,
      contextText
    };
  });

  const context = categoriesContext.map((c) => c.contextText).join('\n\n');

  const systemPrompt = `You are an expert at matching recalls to categories. You will be given a recall with its content (text, location, images, people) and a list of candidate categories that have already been filtered by embedding similarity.

Your task is to:
1. Analyze each category to determine if the recall truly belongs to it
2. Assign a confidence score (0-100) for each category

A recall should only match a category if it clearly relates to the category name and description (give more weight to the Category Description).

Respond with valid JSON only, no markdown.`;

  const userPrompt = `Recall:
${recallContext}

Candidate Categories:
${context}

Analyze each category and provide your response in JSON format:
{
  "matches": [
    {"categoryId": "CATEGORY_1", "confidence": 85, "reason": "brief explanation"},
    {"categoryId": "CATEGORY_2", "confidence": 70, "reason": "brief explanation"}
  ]
}

Only include categories with confidence >= 40. If no categories meet this threshold, return an empty matches array.`;

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    console.error('OpenAI API error:', errorText);
    
    // Fallback: use all candidates with similarity-based scores
    console.log('Using fallback matching based on similarity scores');
    const fallbackMatches = candidateCategories
      .map((cat) => ({
        categoryId: cat.categoryId,
        confidence: Math.round(cat.similarity * 100),
        similarity: cat.similarity
      }))
      .filter((m) => m.confidence >= 60);
    
    if (fallbackMatches.length > 0) {
      await updateRecollections(supabase, recallId, recallData.user_id, fallbackMatches);
    } else {
      await deleteRecollections(supabase, recallId, recallData.user_id);
    }
    
    const processingTime = Date.now() - startTime;
    return new Response(JSON.stringify({
      success: true,
      recallId,
      matchCount: fallbackMatches.length,
      matches: fallbackMatches,
      message: 'Used fallback matching due to Claude error',
      processingTimeMs: processingTime
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const openaiData = await openaiResponse.json();
  const openaiContent = openaiData.choices?.[0]?.message?.content;

  let matches: Array<{ categoryId: string; confidence: number; reason: string }> = [];

  if (openaiContent) {
    try {
      const parsed = JSON.parse(openaiContent);
      matches = parsed.matches || [];
      console.log(`OpenAI identified ${matches.length} high-confidence matches`);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
      console.error('OpenAI response content:', openaiContent);
      
      // Fallback: use all candidates with similarity-based scores
      matches = candidateCategories.map((cat, idx) => ({
        categoryId: `CATEGORY_${idx + 1}`,
        confidence: Math.round(cat.similarity * 100),
        reason: 'Fallback: based on embedding similarity'
      })).filter((m) => m.confidence >= 60);
      
      console.log(`Using fallback: ${matches.length} matches based on similarity`);
    }
  }

  // Map category IDs back to actual category IDs
  const finalMatches = matches
    .map((match) => {
      const categoryContext = categoriesContext.find((c) => c.categoryId === match.categoryId);
      if (!categoryContext) return null;
      
      return {
        categoryId: categoryContext.actualId,
        confidence: match.confidence,
        similarity: categoryContext.similarity,
        reason: match.reason
      };
    })
    .filter((m) => m !== null);

  console.log(`Final matches: ${finalMatches.length} categories`);

  // Step 10: Update recollections table
  if (finalMatches.length > 0) {
    await updateRecollections(supabase, recallId, recallData.user_id, finalMatches);
    console.log('Recollections updated successfully');
  } else {
    console.log('No high-confidence matches found');
    await deleteRecollections(supabase, recallId, recallData.user_id);
  }

  const processingTime = Date.now() - startTime;
  console.log('=== Category matching completed successfully ===');
  console.log('Total processing time:', processingTime, 'ms');

  return new Response(JSON.stringify({
    success: true,
    recallId,
    candidateCount: candidateCategories.length,
    matchCount: finalMatches.length,
    matches: finalMatches.map((m) => ({
      categoryId: m.categoryId,
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
}

// Helper function to update recollections
async function updateRecollections(
  supabase: any,
  recallId: string,
  userId: string,
  matches: Array<{ categoryId: string; confidence: number }>
): Promise<void> {
  // Delete existing recollections for this recall
  console.log('Deleting existing recollections for recall:', recallId);
  const { error: deleteError } = await supabase
    .from('recollections')
    .delete()
    .eq('recall_id', recallId)
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Error deleting existing recollections:', deleteError);
    throw new Error(`Failed to delete existing recollections: ${deleteError.message}`);
  }

  // Insert new recollections
  const recollectionsToInsert = matches.map((match) => ({
    recall_id: recallId,
    user_id: userId,
    category_id: match.categoryId,
    match_score: match.confidence
  }));

  console.log('Inserting new recollections:', recollectionsToInsert.length);
  const { error: insertError } = await supabase
    .from('recollections')
    .insert(recollectionsToInsert);

  if (insertError) {
    console.error('Error inserting recollections:', insertError);
    throw new Error(`Failed to create recollections: ${insertError.message}`);
  }
}

// Helper function to delete recollections
async function deleteRecollections(
  supabase: any,
  recallId: string,
  userId: string
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('recollections')
    .delete()
    .eq('recall_id', recallId)
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Error deleting existing recollections:', deleteError);
  }
}

Deno.serve(async (req) => {
  const startTime = Date.now();

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== Match Recollection Category Edge Function Started ===');
    console.log('Request method:', req.method);
    console.log('Timestamp:', new Date().toISOString());

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
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

    // Parse request body
    const body = await req.json();
    console.log('Request body:', body);

    const { recallId, type, table, record, old_record } = body;

    // Support both direct recallId and webhook payload formats
    let actualRecallId = recallId;
    
    // Handle webhook payload from database trigger
    if (!actualRecallId && record?.id) {
      actualRecallId = record.id;
      console.log('Extracted recallId from webhook record:', actualRecallId);
    }

    // Validate input
    if (!actualRecallId) {
      console.error('Missing required parameter: recallId');
      return new Response(JSON.stringify({
        error: 'recallId is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    console.log('Processing recall:', actualRecallId);
    console.log('Trigger type:', type || 'manual');

    // Create a separate supabase client for stamping (matchRecallAgainstCategories has its own internal client)
    const stampClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Stamp category_matching_at = now(), category_matched_at = null at the START
    try {
      await stampClient.from('recalls').update({
        category_matching_at: new Date().toISOString(),
        category_matched_at: null, // reset so pill shows on re-match
      }).eq('id', actualRecallId);
      console.log('[match-recollection-category] Stamped category_matching_at for', actualRecallId);
    } catch (err) {
      console.error('[match-recollection-category] Failed to stamp category_matching_at:', err);
      // Don't abort
    }

    try {
      const response = await matchRecallAgainstCategories(
        actualRecallId,
        supabaseUrl,
        supabaseServiceKey,
        openaiApiKey,
        corsHeaders,
        startTime
      );
      return response;
    } catch (err) {
      console.error('[match-recollection-category] Unhandled error:', err);
      return new Response(JSON.stringify({ error: 'Internal error', details: (err as any)?.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      // ALWAYS stamp category_matched_at, regardless of outcome
      try {
        await stampClient.from('recalls').update({
          category_matched_at: new Date().toISOString(),
        }).eq('id', actualRecallId);
        console.log('[match-recollection-category] Stamped category_matched_at for', actualRecallId);
      } catch (err) {
        console.error('[match-recollection-category] Failed to stamp category_matched_at:', err);
      }
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Match Recollection Category Edge Function ===');
    console.error('Error type:', (error as any)?.constructor?.name);
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
