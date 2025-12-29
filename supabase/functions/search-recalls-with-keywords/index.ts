
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Three-tier threshold configuration
const SIMILARITY_THRESHOLDS = {
  HIGH: 0.60,    // 60% similarity - High confidence matches
  MEDIUM: 0.40,  // 40% similarity - Medium confidence matches
  LOW: 0.25      // 25% similarity - Low confidence matches
};

interface RecallMatch {
  recall_id: string;
  text_similarity: number;
  image_similarities: number[];
  keyword_matches: number;
  aggregated_match: number;
  tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  isPriority: boolean;
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
 * Determine the tier based on similarity score
 */
function getSimilarityTier(similarity: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' {
  if (similarity >= SIMILARITY_THRESHOLDS.HIGH) return 'HIGH';
  if (similarity >= SIMILARITY_THRESHOLDS.MEDIUM) return 'MEDIUM';
  if (similarity >= SIMILARITY_THRESHOLDS.LOW) return 'LOW';
  return 'NONE';
}

/**
 * Calculate cosine similarity between two embeddings
 */
function calculateCosineSimilarity(embedding1: number[], embedding2: any): number {
  if (!embedding2) return 0;

  let embedding2Array = embedding2;

  // Handle different embedding formats
  if (typeof embedding2 === 'string') {
    try {
      const cleanStr = embedding2.replace(/[\[\]]/g, '');
      embedding2Array = cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
    } catch (e) {
      console.error('Failed to parse embedding string:', e);
      return 0;
    }
  }

  if (!Array.isArray(embedding2Array) || embedding2Array.length === 0) return 0;
  if (!Array.isArray(embedding1) || embedding1.length === 0) return 0;
  if (embedding2Array.length !== embedding1.length) return 0;

  // Cosine similarity calculation
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < embedding1.length; i++) {
    const val1 = embedding1[i];
    const val2 = embedding2Array[i];
    dotProduct += val1 * val2;
    normA += val1 * val1;
    normB += val2 * val2;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  const similarity = dotProduct / denominator;
  const clampedSimilarity = Math.max(-1, Math.min(1, similarity));

  return isNaN(clampedSimilarity) ? 0 : clampedSimilarity;
}

/**
 * Extract keywords from query using OpenAI NER
 */
async function extractKeywords(query: string, openaiApiKey: string): Promise<string[]> {
  console.log('Extracting keywords using OpenAI NER...');
  
  const nerPrompt = `You are a keyword extraction specialist. Extract keywords and named entities from the following query. Focus on:
- Named entities (people, places, organizations, dates, times)
- Important nouns and noun phrases
- Key concepts and topics

Return ONLY the extracted keywords as a comma-separated list, without any explanation or additional text.

Query: ${query}

Keywords:`;

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
          content: 'You are a keyword extraction assistant. Extract only the most important keywords and named entities from user queries. Return them as a comma-separated list without any explanation.'
        },
        {
          role: 'user',
          content: nerPrompt
        }
      ],
      temperature: 0.2,
      max_tokens: 100
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
    .filter((k: string) => k.length > 0);
  
  console.log('Extracted keywords:', keywords);
  return keywords;
}

/**
 * Generate embeddings for multiple keywords
 */
async function generateKeywordEmbeddings(keywords: string[], openaiApiKey: string): Promise<number[][]> {
  console.log(`Generating embeddings for ${keywords.length} keywords...`);
  
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
  
  // Decode all embeddings
  const embeddings: number[][] = [];
  for (const item of embeddingData.data) {
    const embeddingBase64 = item.embedding;
    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    embeddings.push(Array.from(float32Array));
  }
  
  console.log(`Generated ${embeddings.length} embeddings`);
  return embeddings;
}

/**
 * Calculate multi-keyword match score
 * Returns the number of keywords that match above threshold and the best similarity
 */
function calculateMultiKeywordMatch(
  keywordEmbeddings: number[][],
  targetEmbedding: any
): { matchCount: number; bestSimilarity: number; allSimilarities: number[] } {
  const similarities = keywordEmbeddings.map(keywordEmb => 
    calculateCosineSimilarity(keywordEmb, targetEmbedding)
  );
  
  // Count how many keywords match above LOW threshold
  const matchCount = similarities.filter(sim => sim >= SIMILARITY_THRESHOLDS.LOW).length;
  const bestSimilarity = Math.max(...similarities, 0);
  
  return { matchCount, bestSimilarity, allSimilarities: similarities };
}

/**
 * Calculate aggregated match percentage for a recall
 * Combines text similarity and all image similarities
 */
function calculateAggregatedMatch(
  textSimilarity: number,
  imageSimilarities: number[],
  keywordMatchCount: number,
  totalKeywords: number
): number {
  // Weight: 40% text, 40% images, 20% keyword coverage
  const textWeight = 0.4;
  const imageWeight = 0.4;
  const keywordWeight = 0.2;
  
  // Text component
  const textScore = textSimilarity * textWeight;
  
  // Image component (average of all image similarities)
  const avgImageSimilarity = imageSimilarities.length > 0
    ? imageSimilarities.reduce((sum, sim) => sum + sim, 0) / imageSimilarities.length
    : 0;
  const imageScore = avgImageSimilarity * imageWeight;
  
  // Keyword coverage component
  const keywordCoverage = totalKeywords > 0 ? keywordMatchCount / totalKeywords : 0;
  const keywordScore = keywordCoverage * keywordWeight;
  
  // Combine all components
  const aggregated = textScore + imageScore + keywordScore;
  
  return Math.max(0, Math.min(1, aggregated));
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
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

    console.log('Authenticated user:', user.id);

    // Parse request body
    const { query, priorityRecallIds } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Original search query:', query);
    console.log('Priority recall IDs:', priorityRecallIds ? `${priorityRecallIds.length} IDs` : 'None');

    // Clean the query
    const cleanedQuery = cleanRecallsFromQuery(query);
    console.log('Cleaned query:', cleanedQuery);

    // Convert priority IDs to Set for efficient lookup
    const priorityRecallIdsSet = new Set<string>(priorityRecallIds || []);

    // If query is blank after cleaning and we have priority recalls, return them all
    if (!cleanedQuery.trim() && priorityRecallIdsSet.size > 0) {
      console.log('Query is blank after cleaning - returning all priority results');
      
      const priorityIds = Array.from(priorityRecallIdsSet);
      const results = priorityIds.map((id: string) => ({
        recall_id: id,
        matchPercentage: 100,
        tier: 'HIGH',
        keywordMatches: 0,
        totalKeywords: 0
      }));

      console.log(`Returning ${results.length} priority recalls (query was blank after cleaning)`);

      return new Response(JSON.stringify({
        results,
        keywords: [],
        processingTimeMs: Date.now() - startTime,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // If query is blank and no priority recalls, return empty results
    if (!cleanedQuery.trim()) {
      console.log('Query is blank after cleaning and no priority recalls - returning empty results');
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

    // Step 1: Extract keywords and generate embeddings
    console.log('Step 1: Extracting keywords and generating embeddings...');
    const keywords = await extractKeywords(cleanedQuery, openaiApiKey);
    const keywordEmbeddings = await generateKeywordEmbeddings(keywords, openaiApiKey);

    // Step 2: Fetch recalls and images with embeddings
    console.log('Step 2: Fetching recalls and images...');
    
    // Build queries
    let recallsQuery = supabase
      .from('recalls')
      .select('id, text, location, location_primary_type, recall_embedding')
      .eq('user_id', user.id)
      .not('recall_embedding', 'is', null);

    let imagesQuery = supabase
      .from('recall_images')
      .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
      .eq('user_id', user.id)
      .not('recall_image_embedding', 'is', null);

    // Filter by priority recalls if they exist
    if (priorityRecallIdsSet.size > 0) {
      const priorityIds = Array.from(priorityRecallIdsSet);
      console.log(`Filtering to ${priorityIds.length} priority recalls`);
      recallsQuery = recallsQuery.in('id', priorityIds);
      imagesQuery = imagesQuery.in('recall_id', priorityIds);
    }

    // Fetch in parallel for speed
    const [recallsResult, imagesResult] = await Promise.all([
      recallsQuery,
      imagesQuery
    ]);

    if (recallsResult.error) {
      console.error('Error fetching recalls:', recallsResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls', details: recallsResult.error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (imagesResult.error) {
      console.error('Error fetching images:', imagesResult.error);
      return new Response(JSON.stringify({ error: 'Failed to fetch images', details: imagesResult.error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const allRecalls = recallsResult.data || [];
    const allImages = imagesResult.data || [];

    console.log(`Found ${allRecalls.length} recalls and ${allImages.length} images with embeddings`);

    // Step 3: Calculate multi-keyword matches and aggregate scores
    console.log('Step 3: Calculating multi-keyword matches and aggregated scores...');
    
    // Group images by recall_id for efficient lookup
    const imagesByRecall = new Map<string, typeof allImages>();
    for (const image of allImages) {
      if (!imagesByRecall.has(image.recall_id)) {
        imagesByRecall.set(image.recall_id, []);
      }
      imagesByRecall.get(image.recall_id)!.push(image);
    }

    // Calculate matches for each recall
    const recallMatches: RecallMatch[] = [];
    
    for (const recall of allRecalls) {
      // Calculate text similarity with multi-keyword matching
      const textMatch = calculateMultiKeywordMatch(keywordEmbeddings, recall.recall_embedding);
      
      // Calculate image similarities
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
      
      // Total keyword matches (text + images)
      const totalKeywordMatches = textMatch.matchCount + totalImageKeywordMatches;
      
      // Calculate aggregated match percentage
      const aggregatedMatch = calculateAggregatedMatch(
        textMatch.bestSimilarity,
        imageSimilarities,
        totalKeywordMatches,
        keywords.length
      );
      
      const tier = getSimilarityTier(aggregatedMatch);
      const isPriority = priorityRecallIdsSet.has(recall.id);
      
      // Only include recalls that meet LOW threshold or higher
      if (tier !== 'NONE') {
        recallMatches.push({
          recall_id: recall.id,
          text_similarity: textMatch.bestSimilarity,
          image_similarities: imageSimilarities,
          keyword_matches: totalKeywordMatches,
          aggregated_match: aggregatedMatch,
          tier,
          isPriority,
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

    // Sort by priority, then tier, then aggregated match
    const tierOrder = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
    recallMatches.sort((a, b) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      if (tierOrder[a.tier] !== tierOrder[b.tier]) {
        return tierOrder[b.tier] - tierOrder[a.tier];
      }
      return b.aggregated_match - a.aggregated_match;
    });

    // Convert to result format
    const results = recallMatches.map(match => ({
      recall_id: match.recall_id,
      matchPercentage: Math.round(match.aggregated_match * 100),
      tier: match.tier,
      keywordMatches: match.keyword_matches,
      totalKeywords: keywords.length,
      recall_data: match.recall_data,
      images_data: match.images_data
    }));

    // Calculate tier counts
    const tierCounts = {
      HIGH: recallMatches.filter(m => m.tier === 'HIGH').length,
      MEDIUM: recallMatches.filter(m => m.tier === 'MEDIUM').length,
      LOW: recallMatches.filter(m => m.tier === 'LOW').length
    };

    const processingTime = Date.now() - startTime;
    console.log('=== Search Recalls With Keywords completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');
    console.log(`Tier distribution - HIGH: ${tierCounts.HIGH}, MEDIUM: ${tierCounts.MEDIUM}, LOW: ${tierCounts.LOW}`);

    return new Response(JSON.stringify({
      results,
      keywords,
      tierCounts,
      processingTimeMs: processingTime,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Search Recalls With Keywords Edge Function ===');
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
