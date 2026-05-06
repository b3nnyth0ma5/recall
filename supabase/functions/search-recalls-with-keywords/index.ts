import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const TEXT_SIMILARITY_THRESHOLD = 0.4;
const IMAGE_SIMILARITY_THRESHOLD = 0.25;

interface RecallMatch {
  recall_id: string;
  text_similarity: number;
  image_similarities: number[];
  keyword_matches: number;
  recall_data: { text: string; location: string; location_primary_type: string };
  images_data: Array<{ id: string; ocr_text: string; image_explanation: string; similarity: number }>;
}

function cleanRecallsFromQuery(query: string): string {
  return query.replace(/\brecalls?\b/gi, '').replace(/\s+/g, ' ').trim();
}

function decodeBase64Embedding(base64: string): number[] {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return Array.from(new Float32Array(bytes.buffer));
}

function calculateCosineSimilarity(e1: number[], e2: any): number {
  if (!e1?.length) return 0;
  if (!e2) return 0;

  let arr = e2;
  if (typeof e2 === 'string') {
    try {
      arr = e2.replace(/[\[\]]/g, '').split(',').map((s: string) => parseFloat(s.trim()));
    } catch { return 0; }
  }
  if (!Array.isArray(arr) || arr.length !== e1.length) return 0;

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < e1.length; i++) {
    dot += e1[i] * arr[i];
    magA += e1[i] * e1[i];
    magB += arr[i] * arr[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : Math.max(-1, Math.min(1, dot / denom));
}

function calculateMultiKeywordMatch(
  keywordEmbeddings: number[][],
  targetEmbedding: any,
  threshold: number
): { matchCount: number; bestSimilarity: number } {
  let matchCount = 0;
  let bestSimilarity = 0;
  for (const kEmb of keywordEmbeddings) {
    const sim = calculateCosineSimilarity(kEmb, targetEmbedding);
    if (sim >= threshold) matchCount++;
    if (sim > bestSimilarity) bestSimilarity = sim;
  }
  return { matchCount, bestSimilarity };
}

async function extractKeywords(query: string, claudeApiKey: string): Promise<string[]> {
  console.log('Extracting keywords (claude-haiku-4-5)...');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': claudeApiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 50,
      system: 'Extract keywords as comma-separated list. No verbs, proper nouns, names, venues, suburbs or locations. No explanation.',
      messages: [{ role: 'user', content: `Keywords from: "${query}"` }]
    })
  });
  if (!res.ok) throw new Error(`Claude NER error: ${await res.text()}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text?.trim() || query;
  return raw.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0).slice(0, 10);
}

async function generateKeywordEmbeddings(keywords: string[], openaiApiKey: string): Promise<number[][]> {
  console.log(`Generating embeddings for ${keywords.length} keywords...`);
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: keywords, encoding_format: 'base64' })
  });
  if (!res.ok) throw new Error(`OpenAI embeddings error: ${await res.text()}`);
  const data = await res.json();
  if (!data.data?.length) throw new Error('No embeddings returned');
  console.log(`Received ${data.data.length} embeddings`);
  return data.data.map((item: any) => decodeBase64Embedding(item.embedding));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const startTime = Date.now();
  console.log('=== search-recalls-with-keywords started ===', new Date().toISOString());

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { query } = await req.json();
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const cleanedQuery = cleanRecallsFromQuery(query);
    if (!cleanedQuery) {
      return new Response(JSON.stringify({ results: [], keywords: [], processingTimeMs: Date.now() - startTime }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Query: "${cleanedQuery}"`);

    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!claudeApiKey || !openaiApiKey) {
      return new Response(JSON.stringify({ error: 'API keys not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Extract keywords + fetch DB records in parallel
    // DB fetch starts immediately while Claude extracts keywords
    console.log('Step 1: Extracting keywords + fetching DB in parallel...');
    const [keywords, recallsResult, imagesResult] = await Promise.all([
      extractKeywords(cleanedQuery, claudeApiKey),
      supabase
        .from('recalls')
        .select('id, text, location, location_primary_type, recall_embedding')
        .eq('user_id', user.id)
        .not('recall_embedding', 'is', null),
      supabase
        .from('recall_images')
        .select('id, recall_id, ocr_text, image_explanation, recall_image_embedding')
        .eq('user_id', user.id)
        .not('recall_image_embedding', 'is', null)
    ]);

    console.log(`Keywords: [${keywords.join(', ')}]`);

    if (recallsResult.error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (imagesResult.error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch images' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 2: Generate embeddings (needs keywords from step 1)
    console.log('Step 2: Generating keyword embeddings...');
    const keywordEmbeddings = await generateKeywordEmbeddings(keywords, openaiApiKey);

    const allRecalls = recallsResult.data ?? [];
    const allImages = imagesResult.data ?? [];
    console.log(`Processing ${allRecalls.length} recalls, ${allImages.length} images`);

    // Group images by recall_id
    const imagesByRecall = new Map<string, typeof allImages>();
    for (const img of allImages) {
      if (!imagesByRecall.has(img.recall_id)) imagesByRecall.set(img.recall_id, []);
      imagesByRecall.get(img.recall_id)!.push(img);
    }

    // Score recalls
    const recallMatches: RecallMatch[] = [];
    for (const recall of allRecalls) {
      const textMatch = calculateMultiKeywordMatch(keywordEmbeddings, recall.recall_embedding, TEXT_SIMILARITY_THRESHOLD);
      const recallImages = imagesByRecall.get(recall.id) ?? [];
      const imageSimilarities: number[] = [];
      const imagesData: RecallMatch['images_data'] = [];
      let totalImageKeywordMatches = 0;

      for (const img of recallImages) {
        const imgMatch = calculateMultiKeywordMatch(keywordEmbeddings, img.recall_image_embedding, IMAGE_SIMILARITY_THRESHOLD);
        imageSimilarities.push(imgMatch.bestSimilarity);
        totalImageKeywordMatches += imgMatch.matchCount;
        imagesData.push({ id: img.id, ocr_text: img.ocr_text || '', image_explanation: img.image_explanation || '', similarity: imgMatch.bestSimilarity });
      }

      const meetsThreshold = textMatch.bestSimilarity >= TEXT_SIMILARITY_THRESHOLD || imageSimilarities.some(s => s >= IMAGE_SIMILARITY_THRESHOLD);
      if (meetsThreshold) {
        recallMatches.push({
          recall_id: recall.id,
          text_similarity: textMatch.bestSimilarity,
          image_similarities: imageSimilarities,
          keyword_matches: textMatch.matchCount + totalImageKeywordMatches,
          recall_data: { text: recall.text || '', location: recall.location || '', location_primary_type: recall.location_primary_type || '' },
          images_data: imagesData
        });
      }
    }

    console.log(`Found ${recallMatches.length} matching recalls`);

    const results = recallMatches.map(m => ({
      recall_id: m.recall_id,
      matchPercentage: Math.round(m.text_similarity * 100),
      keywordMatches: m.keyword_matches,
      totalKeywords: keywords.length,
      recall_data: m.recall_data,
      images_data: m.images_data
    }));

    const processingTime = Date.now() - startTime;
    console.log(`=== search-recalls-with-keywords done in ${processingTime}ms ===`);

    return new Response(JSON.stringify({ results, keywords, processingTimeMs: processingTime }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Error in search-recalls-with-keywords:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: processingTime
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
