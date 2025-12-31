
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Single threshold configuration
const SIMILARITY_THRESHOLD = 0.40;

interface RecallMatch {
  recall_id: string;
  text_similarity: number;
  image_similarities: number[];
  keyword_matches: number;
  recall_data: {
    text: string;
    location: string;
    location_primary_type: string;
  };
  images_data: Array<{
    id: string;
    ocr_text: string;
    image_explanation: string;
    similarity: number;
  }>;
}

/**
 * Clean the word "recalls" from the search query
 */
function cleanRecallsFromQuery(query: string): string {
  const cleaned = query
    .replace(/\brecalls?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log(`Cleaned query: "${query}" -> "${cleaned}"`);
  return cleaned;
}

/**
 * Calculate cosine similarity between two embeddings - INDUSTRY STANDARD
 * 
 * Cosine similarity formula:
 * similarity = (A · B) / (||A|| * ||B||)
 * 
 * Where:
 * - A · B is the dot product of vectors A and B
 * - ||A|| is the magnitude (Euclidean norm) of vector A
 * - ||B|| is the magnitude (Euclidean norm) of vector B
 * 
 * The result is a value between -1 and 1:
 * - 1 means vectors are identical in direction
 * - 0 means vectors are orthogonal (perpendicular)
 * - -1 means vectors are opposite in direction
 */
function calculateCosineSimilarity(embedding1: number[], embedding2: any): number {
  // Validate inputs
  if (!embedding1 || !Array.isArray(embedding1) || embedding1.length === 0) {
    console.warn('Invalid embedding1: not an array or empty');
    return 0;
  }

  if (!embedding2) {
    console.warn('Invalid embedding2: null or undefined');
    return 0;
  }

  let embedding2Array = embedding2;

  // Convert string to array if needed (for database stored embeddings)
  if (typeof embedding2 === 'string') {
    try {
      const cleanStr = embedding2.replace(/[\[\]]/g, '');
      embedding2Array = cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
    } catch (e) {
      console.error('Failed to parse embedding2 string:', e);
      return 0;
    }
  }

  // Validate embedding2Array
  if (!Array.isArray(embedding2Array) || embedding2Array.length === 0) {
    console.warn('Invalid embedding2Array: not an array or empty');
    return 0;
  }

  // Check dimensions match
  if (embedding2Array.length !== embedding1.length) {
    console.warn(`Dimension mismatch: embedding1=${embedding1.length}, embedding2=${embedding2Array.length}`);
    return 0;
  }

  // Calculate dot product and magnitudes in a single pass for efficiency
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < embedding1.length; i++) {
    const a = embedding1[i];
    const b = embedding2Array[i];
    
    // Accumulate dot product
    dotProduct += a * b;
    
    // Accumulate squared magnitudes
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  // Calculate the magnitudes (Euclidean norms)
  const normA = Math.sqrt(magnitudeA);
  const normB = Math.sqrt(magnitudeB);

  // Avoid division by zero
  if (normA === 0 || normB === 0) {
    console.warn('Zero magnitude detected in one or both embeddings');
    return 0;
  }

  // Calculate cosine similarity
  const similarity = dotProduct / (normA * normB);

  // Clamp result to [-1, 1] range to handle floating point precision issues
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Extract keywords from query using OpenAI NER
 */
async function extractKeywords(query: string, openaiApiKey: string): Promise<string[]> {
  console.log('Extracting keywords using OpenAI NER...');
  
  const nerPrompt = `Extract keywords from: "${query}". 
  Don't include verbs, proper nouns, names of people, venues, suburbs or locations. Return comma-separated list only:`;

  const nerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Extract keywords as comma-separated list. No explanation.'
        },
        {
          role: 'user',
          content: nerPrompt
        }
      ],
      temperature: 0.2,
      max_tokens: 50
    })
  });

  if (!nerResponse.ok) {
    const errorText = await nerResponse.text();
    console.error('OpenAI NER API error:', errorText);
    throw new Error(`Failed to extract keywords: ${errorText}`);
  }

  const nerData = await nerResponse.json();
  const extractedKeywords = nerData.choices?.[0]?.message?.content?.trim() || query;
  
  // Split keywords by comma and clean them
  const keywords = extractedKeywords
    .split(',')
    .map((k: string) => k.trim())
    .filter((k: string) => k.length > 0)
    .slice(0, 10); // Limit to 10 keywords for performance
  
  console.log('Extracted keywords:', keywords);
  return keywords;
}

/**
 * Generate embeddings for multiple keywords using OpenAI
 * 
 * This function generates embeddings the same way as embedding-recall and embedding-image:
 * 1. Uses text-embedding-3-small model
 * 2. Requests base64 encoding format
 * 3. Decodes base64 to Float32Array
 * 4. Converts to regular number array
 */
async function generateKeywordEmbeddings(keywords: string[], openaiApiKey: string): Promise<number[][]> {
  console.log(`Generating embeddings for ${keywords.length} keywords...`);
  console.log('Model: text-embedding-3-small');
  console.log('Encoding format: base64');
  
  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: keywords,
      encoding_format: 'base64'
    })
  });

  if (!embeddingResponse.ok) {
    const errorText = await embeddingResponse.text();
    console.error('OpenAI embedding API error:', errorText);
    throw new Error(`Failed to generate embeddings: ${errorText}`);
  }

  const embeddingData = await embeddingResponse.json();
  
  if (!embeddingData.data || embeddingData.data.length === 0) {
    console.error('No data in OpenAI embedding response');
    throw new Error('Invalid response from OpenAI API');
  }

  console.log(`Received ${embeddingData.data.length} embeddings from OpenAI`);
  
  // Decode all embeddings from base64 (same process as embedding-recall and embedding-image)
  const embeddings: number[][] = embeddingData.data.map((item: any, index: number) => {
    const embeddingBase64 = item.embedding;
    
    // Decode base64 to binary string
    const binaryString = atob(embeddingBase64);
    
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Interpret bytes as Float32Array
    const float32Array = new Float32Array(bytes.buffer);
    
    // Convert to regular array
    const embeddingArray = Array.from(float32Array);
    
    console.log(`Decoded embedding ${index + 1}/${embeddingData.data.length}: length=${embeddingArray.length}`);
    
    return embeddingArray;
  });
  
  console.log(`Successfully generated and decoded ${embeddings.length} embeddings`);
  
  if (embeddingData.usage) {
    console.log('Token usage:', JSON.stringify(embeddingData.usage));
  }
  
  return embeddings;
}

/**
 * Calculate multi-keyword match score
 * Returns the count of keywords that match above threshold and the best similarity score
 */
function calculateMultiKeywordMatch(
  keywordEmbeddings: number[][],
  targetEmbedding: any
): { matchCount: number; bestSimilarity: number } {
  let matchCount = 0;
  let bestSimilarity = 0;
  
  for (const keywordEmb of keywordEmbeddings) {
    const sim = calculateCosineSimilarity(keywordEmb, targetEmbedding);
    
    // Count matches above threshold
    if (sim >= SIMILARITY_THRESHOLD) {
      matchCount++;
    }
    
    // Track best similarity
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
    }
  }
  
  return { matchCount, bestSimilarity };
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  const startTime = Date.now();
  console.log('=== Search Recalls With Keywords Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('User authenticated:', user.id);

    // Parse request body
    const { query } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Search query:', query);

    // Clean the query
    const cleanedQuery = cleanRecallsFromQuery(query);

    // If query is blank after cleaning, return empty results
    if (!cleanedQuery.trim()) {
      console.log('Empty query - returning empty results');
      return new Response(JSON.stringify({
        results: [],
        keywords: [],
        processingTimeMs: Date.now() - startTime,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Extract keywords first
    console.log('Step 1: Extracting keywords...');
    const keywords = await extractKeywords(cleanedQuery, openaiApiKey);
    
    // Step 2: Generate embeddings for each keyword
    console.log('Step 2: Generating embeddings for each keyword...');
    const keywordEmbeddings = await generateKeywordEmbeddings(keywords, openaiApiKey);
    
    // Step 3: Fetch recalls and images from database
    console.log('Step 3: Fetching recalls and images from database...');
    const recallsQuery = supabase
      .from('recalls')
      .select('id, text, location, location_primary_type, recall_embedding')
      .eq('user_id', user.id)
      .not('recall_embedding', 'is', null);

    const imagesQuery = supabase
      .from('recall_images')
      .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
      .eq('user_id', user.id)
      .not('recall_image_embedding', 'is', null);

    const [recallsResult, imagesResult] = await Promise.all([recallsQuery, imagesQuery]);

    if (recallsResult.error) {
      console.error('Error fetching recalls:', recallsResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (imagesResult.error) {
      console.error('Error fetching images:', imagesResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch images' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const allRecalls = recallsResult.data || [];
    const allImages = imagesResult.data || [];

    console.log(`Found ${allRecalls.length} recalls and ${allImages.length} images with embeddings`);

    // Group images by recall_id using Map for O(1) lookups
    const imagesByRecall = new Map<string, typeof allImages>();
    for (const image of allImages) {
      if (!imagesByRecall.has(image.recall_id)) {
        imagesByRecall.set(image.recall_id, []);
      }
      imagesByRecall.get(image.recall_id)!.push(image);
    }

    console.log('Processing recall matches...');

    // Calculate matches in single pass
    const recallMatches: RecallMatch[] = [];
    
    for (const recall of allRecalls) {
      // Calculate text similarity using cosine similarity for each keyword
      const textMatch = calculateMultiKeywordMatch(keywordEmbeddings, recall.recall_embedding);
      
      // Calculate image similarities for each keyword
      const recallImages = imagesByRecall.get(recall.id) || [];
      const imageSimilarities: number[] = [];
      const imagesData: RecallMatch['images_data'] = [];
      let totalImageKeywordMatches = 0;
      
      for (const image of recallImages) {
        const imageMatch = calculateMultiKeywordMatch(keywordEmbeddings, image.recall_image_embedding);
        imageSimilarities.push(imageMatch.bestSimilarity);
        totalImageKeywordMatches += imageMatch.matchCount;
        
        imagesData.push({
          id: image.id,
          ocr_text: image.ocr_text || '',
          image_explanation: image.image_explanation || '',
          similarity: imageMatch.bestSimilarity
        });
      }
      
      // Total keyword matches across text and images
      const totalKeywordMatches = textMatch.matchCount + totalImageKeywordMatches;
      
      // Only include recalls that meet threshold
      if (textMatch.bestSimilarity >= SIMILARITY_THRESHOLD || imageSimilarities.some(sim => sim >= SIMILARITY_THRESHOLD)) {
        recallMatches.push({
          recall_id: recall.id,
          text_similarity: textMatch.bestSimilarity,
          image_similarities: imageSimilarities,
          keyword_matches: totalKeywordMatches,
          recall_data: {
            text: recall.text || '',
            location: recall.location || '',
            location_primary_type: recall.location_primary_type || ''
          },
          images_data: imagesData
        });
      }
    }

    console.log(`Found ${recallMatches.length} recalls meeting threshold`);

    // Convert to result format
    const results = recallMatches.map(match => ({
      recall_id: match.recall_id,
      matchPercentage: Math.round(match.text_similarity * 100),
      keywordMatches: match.keyword_matches,
      totalKeywords: keywords.length,
      recall_data: match.recall_data,
      images_data: match.images_data
    }));

    const processingTime = Date.now() - startTime;
    console.log('=== Search completed successfully ===');
    console.log('Processing time:', processingTime, 'ms');
    console.log('Results count:', results.length);

    return new Response(JSON.stringify({
      results,
      keywords,
      processingTimeMs: processingTime,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Search Recalls With Keywords ===');
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
