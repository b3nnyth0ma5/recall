
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
  best_similarity: number;
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
 * Calculate cosine similarity between two embeddings - SIMPLIFIED
 */
function calculateCosineSimilarity(embedding1: number[], embedding2: any): number {
  if (!embedding2 || !Array.isArray(embedding1) || embedding1.length === 0) return 0;

  let embedding2Array = embedding2;

  // Convert string to array if needed
  if (typeof embedding2 === 'string') {
    try {
      const cleanStr = embedding2.replace(/[\[\]]/g, '');
      embedding2Array = cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
    } catch (e) {
      return 0;
    }
  }

  if (!Array.isArray(embedding2Array) || embedding2Array.length === 0) return 0;
  if (embedding2Array.length !== embedding1.length) return 0;

  // Cosine similarity calculation - single pass
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
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Extract keywords from query using OpenAI NER - OPTIMIZED
 */
async function extractKeywords(query: string, openaiApiKey: string): Promise<string[]> {
  console.log('Extracting keywords using OpenAI NER...');
  
  // Optimized prompt for faster processing
  const nerPrompt = `Extract key search terms from: "${query}"\nReturn comma-separated list only:`;

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
      temperature: 0.1,
      max_tokens: 50 // Reduced for speed
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
    .slice(0, 5); // Limit to 5 keywords for speed
  
  console.log('Extracted keywords:', keywords);
  return keywords;
}

/**
 * Generate embeddings for multiple keywords - SIMPLIFIED to base64 only
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
  
  // Decode all embeddings from base64
  const embeddings: number[][] = embeddingData.data.map((item: any) => {
    const embeddingBase64 = item.embedding;
    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    return Array.from(float32Array);
  });
  
  console.log(`Generated ${embeddings.length} embeddings`);
  return embeddings;
}

/**
 * Calculate multi-keyword match score - OPTIMIZED
 * Returns the best similarity score and count of matching keywords
 */
function calculateMultiKeywordMatch(
  keywordEmbeddings: number[][],
  targetEmbedding: any
): { matchCount: number; bestSimilarity: number } {
  let matchCount = 0;
  let bestSimilarity = 0;
  
  for (const keywordEmb of keywordEmbeddings) {
    const sim = calculateCosineSimilarity(keywordEmb, targetEmbedding);
    if (sim >= SIMILARITY_THRESHOLDS.LOW) matchCount++;
    if (sim > bestSimilarity) bestSimilarity = sim;
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

    // Parse request body
    const { query, priorityRecallIds } = await req.json();

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Search query:', query);

    // Clean the query
    const cleanedQuery = cleanRecallsFromQuery(query);

    // Convert priority IDs to Set for efficient lookup
    const priorityRecallIdsSet = new Set<string>(priorityRecallIds || []);

    // If query is blank after cleaning and we have priority recalls, return them all
    if (!cleanedQuery.trim() && priorityRecallIdsSet.size > 0) {
      const priorityIds = Array.from(priorityRecallIdsSet);
      const results = priorityIds.map((id: string) => ({
        recall_id: id,
        matchPercentage: 100,
        tier: 'HIGH',
        keywordMatches: 0,
        totalKeywords: 0
      }));

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

    // OPTIMIZATION: Run keyword extraction and database queries in parallel
    const [keywords, recallsResult, imagesResult] = await Promise.all([
      extractKeywords(cleanedQuery, openaiApiKey),
      // Fetch recalls
      (async () => {
        let recallsQuery = supabase
          .from('recalls')
          .select('id, text, location, location_primary_type, recall_embedding')
          .eq('user_id', user.id)
          .not('recall_embedding', 'is', null);

        if (priorityRecallIdsSet.size > 0) {
          recallsQuery = recallsQuery.in('id', Array.from(priorityRecallIdsSet));
        }

        return recallsQuery;
      })(),
      // Fetch images
      (async () => {
        let imagesQuery = supabase
          .from('recall_images')
          .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
          .eq('user_id', user.id)
          .not('recall_image_embedding', 'is', null);

        if (priorityRecallIdsSet.size > 0) {
          imagesQuery = imagesQuery.in('recall_id', Array.from(priorityRecallIdsSet));
        }

        return imagesQuery;
      })()
    ]);

    // Generate embeddings for keywords
    const keywordEmbeddings = await generateKeywordEmbeddings(keywords, openaiApiKey);

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

    console.log(`Found ${allRecalls.length} recalls and ${allImages.length} images`);

    // OPTIMIZATION: Group images by recall_id using Map for O(1) lookups
    const imagesByRecall = new Map<string, typeof allImages>();
    for (const image of allImages) {
      if (!imagesByRecall.has(image.recall_id)) {
        imagesByRecall.set(image.recall_id, []);
      }
      imagesByRecall.get(image.recall_id)!.push(image);
    }

    // OPTIMIZATION: Calculate matches in single pass
    const recallMatches: RecallMatch[] = [];
    
    for (const recall of allRecalls) {
      // Calculate text similarity
      const textMatch = calculateMultiKeywordMatch(keywordEmbeddings, recall.recall_embedding);
      
      // Calculate image similarities
      const recallImages = imagesByRecall.get(recall.id) || [];
      const imageSimilarities: number[] = [];
      const imagesData: RecallMatch['images_data'] = [];
      let bestImageSimilarity = 0;
      
      for (const image of recallImages) {
        const imageMatch = calculateMultiKeywordMatch(keywordEmbeddings, image.recall_image_embedding);
        imageSimilarities.push(imageMatch.bestSimilarity);
        
        if (imageMatch.bestSimilarity > bestImageSimilarity) {
          bestImageSimilarity = imageMatch.bestSimilarity;
        }
        
        imagesData.push({
          id: image.id,
          ocr_text: image.ocr_text || '',
          image_explanation: image.image_explanation || '',
          similarity: imageMatch.bestSimilarity
        });
      }
      
      // Total keyword matches (text + images)
      const totalKeywordMatches = textMatch.matchCount + 
        recallImages.reduce((sum, image) => {
          const imageMatch = calculateMultiKeywordMatch(keywordEmbeddings, image.recall_image_embedding);
          return sum + imageMatch.matchCount;
        }, 0);
      
      // Use the best similarity score across text and images as the overall match score
      // This is a simple, non-weighted approach
      const bestSimilarity = Math.max(textMatch.bestSimilarity, bestImageSimilarity);
      
      const tier = getSimilarityTier(bestSimilarity);
      
      // Only include recalls that meet LOW threshold or higher
      if (tier !== 'NONE') {
        recallMatches.push({
          recall_id: recall.id,
          text_similarity: textMatch.bestSimilarity,
          image_similarities: imageSimilarities,
          keyword_matches: totalKeywordMatches,
          best_similarity: bestSimilarity,
          tier,
          isPriority: priorityRecallIdsSet.has(recall.id),
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

    // Sort by priority, then tier, then best similarity
    const tierOrder = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
    recallMatches.sort((a, b) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      if (tierOrder[a.tier] !== tierOrder[b.tier]) {
        return tierOrder[b.tier] - tierOrder[a.tier];
      }
      return b.best_similarity - a.best_similarity;
    });

    // Convert to result format
    const results = recallMatches.map(match => ({
      recall_id: match.recall_id,
      matchPercentage: Math.round(match.best_similarity * 100),
      tier: match.tier,
      keywordMatches: match.keyword_matches,
      totalKeywords: keywords.length,
      recall_data: match.recall_data,
      images_data: match.images_data
    }));

    const processingTime = Date.now() - startTime;
    console.log('=== Search completed in', processingTime, 'ms ===');

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
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');

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
