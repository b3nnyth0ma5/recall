
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

/**
 * New Category Matching Edge Function (v2 — high-coverage)
 *
 * Changes from v1:
 * - Bulk-fetches images, documents, and URLs upfront (no N+1)
 * - Scores against recall_embedding, recall_image_embedding,
 *   document_embedding, and url_embedding
 * - SIMILARITY_THRESHOLD lowered to 0.10
 * - GPT-4o-mini confidence threshold lowered to 40
 * - GPT-4o-mini max_tokens raised to 4096
 * - Candidates processed in batches of 100 through GPT-4o-mini
 */

// ── helpers ──────────────────────────────────────────────────────────────────

function sanitiseJson(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

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

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

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

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

function parseStoredEmbedding(storedEmbedding: any): number[] | null {
  if (!storedEmbedding) return null;
  if (Array.isArray(storedEmbedding)) return storedEmbedding;
  if (typeof storedEmbedding === 'string') {
    try {
      const cleanStr = storedEmbedding.replace(/[\[\]]/g, '');
      return cleanStr.split(',').map((s: string) => parseFloat(s.trim()));
    } catch {
      return null;
    }
  }
  return null;
}

function sanitizeText(text: string, maxLength = 500): string {
  if (!text) return '';
  let s = text.replace(/\s+/g, ' ').trim();
  if (s.length > maxLength) s = s.substring(0, maxLength) + '...';
  return s;
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

// ── main handler ─────────────────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.08;
const CONFIDENCE_THRESHOLD = 30;
const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== New Category Matching v2 Started ===');
    console.log('Timestamp:', new Date().toISOString());

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { categoryId } = body;

    if (!categoryId) {
      return new Response(JSON.stringify({ error: 'categoryId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Step 1: fetch category ────────────────────────────────────────────────
    console.log('Step 1: Fetching category data...');
    const { data: categoryData, error: categoryError } = await supabase
      .from('recollection_categories')
      .select('id, category_name, category_search_description, user_id')
      .eq('id', categoryId)
      .single();

    if (categoryError || !categoryData) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch category data',
        details: categoryError?.message
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Category:', categoryData.category_name, '| user:', categoryData.user_id);

    // ── Step 2: generate category embedding ──────────────────────────────────
    console.log('Step 2: Generating category embedding...');
    const categoryName = categoryData.category_name || '';
    const categoryDescription = categoryData.category_search_description || '';
    const categoryText = `${categoryName}. ${categoryDescription}`.trim();

    if (!categoryText.trim()) {
      return new Response(JSON.stringify({ error: 'Category name and description are empty' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let categoryEmbedding: number[];
    try {
      categoryEmbedding = await generateEmbedding(categoryText, openaiApiKey);
      console.log(`Category embedding length: ${categoryEmbedding.length}`);
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Failed to generate category embedding',
        details: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Step 3: fetch all recalls for user ───────────────────────────────────
    console.log('Step 3: Fetching recalls for user:', categoryData.user_id);
    const { data: recallsData, error: recallsError } = await supabase
      .from('recalls')
      .select('id, text, recall_embedding, user_id, location, location_primary_type')
      .eq('user_id', categoryData.user_id);

    if (recallsError) {
      return new Response(JSON.stringify({
        error: 'Failed to fetch recalls',
        details: recallsError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!recallsData || recallsData.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No recalls found for user',
        categoryId,
        matchCount: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${recallsData.length} recalls`);

    // ── Step 4: bulk-fetch images, documents, URLs ───────────────────────────
    console.log('Step 4: Bulk-fetching images, documents, and URLs...');
    const recallIds = recallsData.map((r) => r.id);

    const [imagesResult, docsResult, urlsResult] = await Promise.all([
      supabase
        .from('recall_images')
        .select('id, recall_id, recall_image_embedding, ocr_text, image_explanation')
        .in('recall_id', recallIds)
        .not('recall_image_embedding', 'is', null),
      supabase
        .from('recall_documents')
        .select('id, recall_id, document_embedding, extracted_text, doc_explanation')
        .in('recall_id', recallIds)
        .not('document_embedding', 'is', null),
      supabase
        .from('recall_urls')
        .select('id, recall_id, url_embedding, og_title, og_description')
        .in('recall_id', recallIds)
        .not('url_embedding', 'is', null),
    ]);

    const imagesByRecall = groupBy(imagesResult.data || [], 'recall_id');
    const docsByRecall   = groupBy(docsResult.data   || [], 'recall_id');
    const urlsByRecall   = groupBy(urlsResult.data   || [], 'recall_id');

    console.log(`Images: ${(imagesResult.data || []).length}, Docs: ${(docsResult.data || []).length}, URLs: ${(urlsResult.data || []).length}`);

    // ── Step 5: score every recall across all embedding types ─────────────────
    console.log('Step 5: Scoring recalls...');
    const recallScores = recallsData.map((recall) => {
      let maxSimilarity = 0;
      let matchSource = 'none';

      // Text embedding
      const textEmb = parseStoredEmbedding(recall.recall_embedding);
      if (textEmb) {
        const sim = cosineSimilarity(textEmb, categoryEmbedding);
        if (sim > maxSimilarity) { maxSimilarity = sim; matchSource = 'text'; }
      }

      // Image embeddings
      for (const img of (imagesByRecall[recall.id] || [])) {
        const emb = parseStoredEmbedding(img.recall_image_embedding);
        if (emb) {
          const sim = cosineSimilarity(emb, categoryEmbedding);
          if (sim > maxSimilarity) { maxSimilarity = sim; matchSource = 'image'; }
        }
      }

      // Document embeddings
      for (const doc of (docsByRecall[recall.id] || [])) {
        const emb = parseStoredEmbedding(doc.document_embedding);
        if (emb) {
          const sim = cosineSimilarity(emb, categoryEmbedding);
          if (sim > maxSimilarity) { maxSimilarity = sim; matchSource = 'document'; }
        }
      }

      // URL embeddings
      for (const url of (urlsByRecall[recall.id] || [])) {
        const emb = parseStoredEmbedding(url.url_embedding);
        if (emb) {
          const sim = cosineSimilarity(emb, categoryEmbedding);
          if (sim > maxSimilarity) { maxSimilarity = sim; matchSource = 'url'; }
        }
      }

      return {
        recallId: recall.id,
        recallText: recall.text || '',
        location: recall.location || '',
        locationType: recall.location_primary_type || '',
        similarity: maxSimilarity,
        matchSource,
        images: imagesByRecall[recall.id] || [],
        docs:   docsByRecall[recall.id]   || [],
        urls:   urlsByRecall[recall.id]   || [],
      };
    });

    // ── Step 6: filter by similarity threshold ────────────────────────────────
    const candidateRecalls = recallScores
      .filter((r) => r.similarity >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.similarity - a.similarity);

    console.log(`Candidates after threshold ${SIMILARITY_THRESHOLD}: ${candidateRecalls.length} / ${recallScores.length}`);

    if (candidateRecalls.length === 0) {
      await supabase
        .from('recollections')
        .delete()
        .eq('category_id', categoryId)
        .eq('user_id', categoryData.user_id);

      return new Response(JSON.stringify({
        success: true,
        categoryId,
        matchCount: 0,
        message: 'No recalls matched with sufficient similarity',
        processingTimeMs: Date.now() - startTime
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Step 7: GPT-4o-mini in batches of 100 ────────────────────────────────
    console.log(`Step 7: Running GPT-4o-mini in batches of ${BATCH_SIZE} over ${candidateRecalls.length} candidates...`);

    const systemPrompt = `You are an expert at matching recalls to categories. You will be given a category description and a list of candidate recalls that have already been filtered by embedding similarity. Use the Category Description as a guide to understand what the user wants in the category.

Your task is to:
1. Analyze each recall to determine if it could belong to the category
2. Assign a confidence score (0-100) for each recall
3. Ensure at least 5% of recalls are matched to each catgegory
A recall should match if it reasonably relates to the category description.

Respond with valid JSON only, no markdown.`;

    const allMatches: Array<{ recallId: string; confidence: number; reason: string }> = [];

    for (let batchStart = 0; batchStart < candidateRecalls.length; batchStart += BATCH_SIZE) {
      const batch = candidateRecalls.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`  Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: recalls ${batchStart + 1}–${batchStart + batch.length}`);

      // Build context for this batch
      const batchContext = batch.map((recall, idx) => {
        const globalIdx = batchStart + idx;
        const recallId = `RECALL_${globalIdx + 1}`;
        const similarity = Math.round(recall.similarity * 100);

        let contextText = `${recallId} (${similarity}% similarity):\nText: ${sanitizeText(recall.recallText, 300)}`;

        if (recall.location) {
          contextText += `\nLocation: ${sanitizeText(recall.location, 100)}`;
          if (recall.locationType) contextText += ` (${recall.locationType})`;
        }

        if (recall.images && recall.images.length > 0) {
          const imageInfo = recall.images
            .map((img: any) => {
              const parts = [];
              if (img.ocr_text) parts.push(`OCR: ${sanitizeText(img.ocr_text, 200)}`);
              if (img.image_explanation) parts.push(`Description: ${sanitizeText(img.image_explanation, 250)}`);
              return parts.join(', ');
            })
            .filter((info: string) => info.length > 0)
            .join('; ');
          if (imageInfo) contextText += `\nImages: ${imageInfo}`;
        }

        if (recall.docs && recall.docs.length > 0) {
          const docInfo = recall.docs
            .map((d: any) => {
              const parts = [];
              if (d.extracted_text) parts.push(`Text: ${sanitizeText(d.extracted_text, 200)}`);
              if (d.doc_explanation) parts.push(`Summary: ${sanitizeText(d.doc_explanation, 200)}`);
              return parts.join(', ');
            })
            .filter((info: string) => info.length > 0)
            .join('; ');
          if (docInfo) contextText += `\nDocuments: ${docInfo}`;
        }

        if (recall.urls && recall.urls.length > 0) {
          const urlInfo = recall.urls
            .map((u: any) => {
              const parts = [];
              if (u.og_title) parts.push(u.og_title);
              if (u.og_description) parts.push(sanitizeText(u.og_description, 100));
              return parts.join(' — ');
            })
            .filter((info: string) => info.length > 0)
            .join('; ');
          if (urlInfo) contextText += `\nURLs: ${urlInfo}`;
        }

        return { recallId, actualId: recall.recallId, similarity: recall.similarity, contextText };
      });

      const context = batchContext.map((r) => r.contextText).join('\n\n');

      const userPrompt = `Category: ${categoryData.category_name}
Category Description: ${categoryText}

Candidate Recalls:
${context}

Analyze each recall and provide your response in JSON format:
{
  "matches": [
    {"recallId": "RECALL_1", "confidence": 85},
    {"recallId": "RECALL_2", "confidence": 70}
  ]
}

Only include recalls with confidence >= ${CONFIDENCE_THRESHOLD}. If no recalls meet this threshold, return an empty matches array.`;

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error('OpenAI API error (batch):', errorText);
        // Fall back to similarity-based scores for this batch
        const fallback = batchContext
          .map((r) => ({
            recallId: r.recallId,
            confidence: Math.round(r.similarity * 100),
            reason: 'Fallback: embedding similarity'
          }))
          .filter((m) => m.confidence >= CONFIDENCE_THRESHOLD);
        allMatches.push(...fallback);
        continue;
      }

      const openaiData = await openaiResponse.json();
      const openaiContent = openaiData.choices?.[0]?.message?.content;

      if (openaiContent) {
        try {
          const parsed = JSON.parse(sanitiseJson(openaiContent));
          const batchMatches = (parsed.matches || []) as Array<{ recallId: string; confidence: number; reason: string }>;
          console.log(`  Batch matched: ${batchMatches.length}`);
          allMatches.push(...batchMatches);
        } catch (parseError) {
          console.error('Failed to parse OpenAI response for batch:', parseError);
          console.error('Raw content was:', openaiContent);
          // Fallback for this batch
          const fallback = batchContext
            .map((r) => ({
              recallId: r.recallId,
              confidence: Math.round(r.similarity * 100),
              reason: 'Fallback: embedding similarity'
            }))
            .filter((m) => m.confidence >= CONFIDENCE_THRESHOLD);
          allMatches.push(...fallback);
        }
      }

      // Build a lookup for this batch to resolve actualIds
      // We need to map RECALL_N -> actualId across all batches
      // Store batchContext globally for final resolution
      // (handled below via flat recallsContext)
    }

    // Build a flat lookup of all recallId labels -> actualId
    const allBatchContexts = candidateRecalls.map((recall, globalIdx) => ({
      recallId: `RECALL_${globalIdx + 1}`,
      actualId: recall.recallId,
      similarity: recall.similarity,
    }));

    // Map GPT-4o-mini labels back to actual recall IDs
    const finalMatches = allMatches
      .map((match) => {
        const ctx = allBatchContexts.find((r) => r.recallId === match.recallId);
        if (!ctx) return null;
        return {
          recallId: ctx.actualId,
          confidence: match.confidence,
          similarity: ctx.similarity,
          reason: match.reason
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    console.log(`Total final matches across all batches: ${finalMatches.length}`);

    // ── Step 8: upsert recollections ─────────────────────────────────────────
    console.log('Step 8: Updating recollections table...');

    // Always delete existing recollections for this category first
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (finalMatches.length > 0) {
      const recollectionsToInsert = finalMatches.map((match) => ({
        recall_id: match.recallId,
        user_id: categoryData.user_id,
        category_id: categoryId,
        match_score: match.confidence
      }));

      console.log('Inserting recollections:', recollectionsToInsert.length);
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
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log('Recollections inserted successfully');
    } else {
      console.log('No high-confidence matches found after GPT-4o-mini review');
    }

    const processingTime = Date.now() - startTime;
    console.log('=== New Category Matching v2 completed ===');
    console.log('Total processing time:', processingTime, 'ms');

    return new Response(JSON.stringify({
      success: true,
      categoryId,
      categoryName: categoryData.category_name,
      totalRecalls: recallsData.length,
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in New Category Matching v2 ===');
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');

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
