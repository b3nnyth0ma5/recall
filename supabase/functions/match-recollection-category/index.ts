// supabase/functions/match-recollection-category/index.ts
// deno-lint-ignore-file
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Strip markdown code fences from LLM responses before JSON.parse.
// Handles: ```json\n{...}\n```, ```\n{...}\n```, JSON embedded in prose, bare JSON.
function parseLlmJson(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('parseLlmJson: empty or non-string input');
  }

  let cleaned = raw.trim();

  // Try to detect and strip a fenced block (``` or ```json ... ```)
  if (cleaned.startsWith('```')) {
    // Drop the opening fence line: ``` or ```json or ```JSON etc.
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    } else {
      // single-line fenced — strip leading backticks at minimum
      cleaned = cleaned.replace(/^```[a-zA-Z0-9]*/, '');
    }
    // Drop the trailing fence
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence !== -1) {
      cleaned = cleaned.slice(0, lastFence);
    }
    cleaned = cleaned.trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Last-resort: extract from first { to last } (handles prose wrappers)
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = cleaned.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch (sliceErr) {
        throw new Error(
          `parseLlmJson: failed after slice (${(sliceErr as Error).message}). ` +
          `Raw (first 300 chars): ${raw.slice(0, 300)}`,
        );
      }
    }
    throw new Error(
      `parseLlmJson: ${(firstErr as Error).message}. ` +
      `Raw (first 300 chars): ${raw.slice(0, 300)}`,
    );
  }
}

interface RecallData {
  id: string;
  user_id: string;
  text: string | null;
  recall_embedding: number[] | null;
}

interface CategoryData {
  id: string;
  user_id: string;
  category_name: string;
  category_search_description: string | null;
  category_embedding: number[] | null;
}

interface MatchResult {
  category_id: string;
  match_score: number;
  reason: string;
}

const SIMILARITY_THRESHOLD = 0.20;
const CONFIDENCE_THRESHOLD = 40;
const MAX_ATTEMPTS = 5;
const IN_FLIGHT_LOCK_SECONDS = 30;

async function generateEmbedding(text: string, openaiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: 'text-embedding-3-small',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI embedding API failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function fireEmbedCategory(
  supabaseUrl: string,
  serviceKey: string,
  categoryId: string,
): Promise<void> {
  try {
    // @ts-ignore - EdgeRuntime is available in Supabase edge functions
    EdgeRuntime.waitUntil(
      fetch(`${supabaseUrl}/functions/v1/embed-category`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ category_id: categoryId }),
      }).catch(err => {
        console.error('[fireEmbedCategory] background fire failed:', err);
      }),
    );
  } catch (err) {
    console.error('[fireEmbedCategory] failed to register waitUntil:', err);
  }
}

async function matchRecallAgainstCategories(
  recall: RecallData,
  categories: CategoryData[],
  openaiKey: string,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ completed: boolean; matches: MatchResult[]; error?: string }> {
  const matches: MatchResult[] = [];

  // Step 1: ensure recall has an embedding
  let recallEmbedding = recall.recall_embedding;
  if (!recallEmbedding || !Array.isArray(recallEmbedding) || recallEmbedding.length === 0) {
    if (!recall.text || recall.text.trim().length === 0) {
      console.log('[matchRecallAgainstCategories] recall has no embedding and no text — skipping');
      return { completed: true, matches: [] };
    }
    try {
      console.log('[matchRecallAgainstCategories] generating embedding for recall on the fly');
      recallEmbedding = await generateEmbedding(recall.text, openaiKey);
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[matchRecallAgainstCategories] failed to generate recall embedding:', msg);
      return { completed: false, matches: [], error: `recall embedding failed: ${msg}` };
    }
  }

  // Step 2: compute cosine similarity vs each category. For categories without
  // a stored embedding, generate one inline AND fire embed-category to cache it.
  const candidates: { category: CategoryData; similarity: number }[] = [];
  for (const cat of categories) {
    let catEmbedding = cat.category_embedding;
    if (!catEmbedding || !Array.isArray(catEmbedding) || catEmbedding.length === 0) {
      const catText = `${cat.category_name}\n${cat.category_search_description ?? ''}`.trim();
      if (!catText) {
        console.log(`[matchRecallAgainstCategories] category ${cat.id} has no name/desc — skipping`);
        continue;
      }
      try {
        catEmbedding = await generateEmbedding(catText, openaiKey);
        // Cache it for next time
        fireEmbedCategory(supabaseUrl, serviceKey, cat.id);
      } catch (err) {
        console.error(
          `[matchRecallAgainstCategories] failed to embed category ${cat.id}:`,
          (err as Error).message,
        );
        continue;
      }
    }
    const sim = cosineSimilarity(recallEmbedding, catEmbedding);
    if (sim >= SIMILARITY_THRESHOLD) {
      candidates.push({ category: cat, similarity: sim });
    }
  }

  if (candidates.length === 0) {
    console.log('[matchRecallAgainstCategories] no categories above similarity threshold');
    return { completed: true, matches: [] };
  }

  // Sort by similarity descending, take top 8 to keep LLM prompt bounded
  candidates.sort((a, b) => b.similarity - a.similarity);
  const topCandidates = candidates.slice(0, 8);

  // Step 3: ask LLM to confidence-classify each candidate
  const candidateList = topCandidates
    .map((c, i) =>
      `${i + 1}. [id=${c.category.id}] "${c.category.category_name}" — ${c.category.category_search_description ?? '(no description)'} (cosine=${c.similarity.toFixed(3)})`,
    )
    .join('\n');

  const recallPreview = (recall.text ?? '').slice(0, 1000);

  const userPrompt = `You are categorising a personal "recall" (a short note or memory) into the user's existing categories.

RECALL TEXT:
"""
${recallPreview}
"""

CANDIDATE CATEGORIES (already pre-filtered by semantic similarity):
${candidateList}

For EACH candidate, decide whether the recall genuinely belongs in that category. Be strict — only assign categories where the recall content clearly fits the category's purpose.

Respond with ONLY valid JSON in this exact shape:
{
  "matches": [
    {
      "category_id": "<uuid>",
      "match_score": <integer 0-100, your confidence that this recall belongs in this category>,
      "reason": "<one short sentence explaining the match>"
    }
  ]
}

Include EVERY candidate in the array, with match_score reflecting your confidence. Scores below ${CONFIDENCE_THRESHOLD} will be discarded.`;

  let llmContent: string;
  try {
    const llmResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a strict categorisation assistant that returns only valid JSON.' },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!llmResp.ok) {
      const errText = await llmResp.text();
      throw new Error(`OpenAI chat API failed: ${llmResp.status} ${errText}`);
    }

    const llmData = await llmResp.json();
    llmContent = llmData.choices?.[0]?.message?.content ?? '';
    if (!llmContent) {
      throw new Error('OpenAI returned empty content');
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[matchRecallAgainstCategories] LLM call failed:', msg);
    return { completed: false, matches: [], error: `llm call failed: ${msg}` };
  }

  // Step 4: parse LLM response (strip markdown fences if present)
  let parsed: { matches?: MatchResult[] };
  try {
    parsed = parseLlmJson(llmContent);
  } catch (err) {
    const msg = (err as Error).message;
    console.error('Failed to parse OpenAI response:', err);
    // Re-throw so the outer handler returns completed:false and the recall stays retryable.
    throw new Error(`parse failed: ${msg}`);
  }

  if (!parsed?.matches || !Array.isArray(parsed.matches)) {
    console.log('[matchRecallAgainstCategories] LLM returned no matches array');
    return { completed: true, matches: [] };
  }

  // Step 5: filter by confidence threshold
  for (const m of parsed.matches) {
    if (
      m &&
      typeof m.category_id === 'string' &&
      typeof m.match_score === 'number' &&
      m.match_score >= CONFIDENCE_THRESHOLD
    ) {
      matches.push({
        category_id: m.category_id,
        match_score: Math.round(m.match_score),
        reason: m.reason ?? '',
      });
    }
  }

  return { completed: true, matches };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openaiKey = Deno.env.get('OPENAI_API_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let recallId: string | null = null;

  try {
    const body = await req.json();
    // Accept both snake_case and camelCase
    recallId = body.recall_id ?? body.recallId ?? null;

    if (!recallId) {
      return new Response(
        JSON.stringify({ error: 'recall_id (or recallId) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. Fetch the recall
    const { data: recall, error: recallErr } = await supabase
      .from('recalls')
      .select('id, user_id, text, recall_embedding, category_matched_at, category_matching_at, category_match_attempts')
      .eq('id', recallId)
      .single();

    if (recallErr || !recall) {
      return new Response(
        JSON.stringify({ error: `recall not found: ${recallErr?.message ?? 'unknown'}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Already done?
    if (recall.category_matched_at) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'already_matched', recallId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Bounded retry guard
    if ((recall.category_match_attempts ?? 0) >= MAX_ATTEMPTS) {
      console.log(`[handler] recall ${recallId} hit max attempts (${MAX_ATTEMPTS}) — giving up`);
      await supabase
        .from('recalls')
        .update({ category_matched_at: new Date().toISOString(), category_matching_at: null })
        .eq('id', recallId);
      return new Response(
        JSON.stringify({ skipped: true, reason: 'max_attempts_reached', recallId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // In-flight idempotency guard: if another invocation is already working on
    // this recall (within the last 30s), skip.
    if (recall.category_matching_at) {
      const matchingAt = new Date(recall.category_matching_at).getTime();
      const ageSec = (Date.now() - matchingAt) / 1000;
      if (ageSec < IN_FLIGHT_LOCK_SECONDS) {
        return new Response(
          JSON.stringify({ skipped: true, reason: 'in_flight', recallId, age_seconds: ageSec }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Stamp matching_at to claim the slot
    await supabase
      .from('recalls')
      .update({ category_matching_at: new Date().toISOString() })
      .eq('id', recallId);

    // 2. Fetch all categories for this user
    const { data: categories, error: catErr } = await supabase
      .from('recollection_categories')
      .select('id, user_id, category_name, category_search_description, category_embedding')
      .eq('user_id', recall.user_id);

    if (catErr) {
      throw new Error(`failed to load categories: ${catErr.message}`);
    }

    if (!categories || categories.length === 0) {
      // Nothing to match against — done.
      await supabase
        .from('recalls')
        .update({ category_matched_at: new Date().toISOString(), category_matching_at: null })
        .eq('id', recallId);
      return new Response(
        JSON.stringify({ success: true, recallId, matchCount: 0, matchedCategories: [], threshold: SIMILARITY_THRESHOLD }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Run the match
    const matchResult = await matchRecallAgainstCategories(
      recall as RecallData,
      categories as CategoryData[],
      openaiKey,
      supabaseUrl,
      serviceKey,
    );

    if (!matchResult.completed) {
      // Failure path — increment attempts, clear matching_at, leave matched_at NULL.
      await supabase.rpc('increment_category_match_attempts', { p_recall_id: recallId });
      return new Response(
        JSON.stringify({
          success: false,
          recallId,
          completed: false,
          error: matchResult.error ?? 'unknown',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Insert recollections for each match
    if (matchResult.matches.length > 0) {
      const rows = matchResult.matches.map(m => ({
        user_id: recall.user_id,
        recall_id: recall.id,
        category_id: m.category_id,
        match_score: m.match_score,
        reason: m.reason,
      }));

      const { error: insErr } = await supabase
        .from('recollections')
        .upsert(rows, { onConflict: 'recall_id,category_id' });

      if (insErr) {
        console.error('[handler] failed to upsert recollections:', insErr);
        await supabase.rpc('increment_category_match_attempts', { p_recall_id: recallId });
        return new Response(
          JSON.stringify({
            success: false,
            recallId,
            completed: false,
            error: `recollections upsert failed: ${insErr.message}`,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Bump last_match_at on each matched category
      for (const m of matchResult.matches) {
        await supabase
          .from('recollection_categories')
          .update({ last_match_at: new Date().toISOString() })
          .eq('id', m.category_id);
      }
    }

    // 5. Stamp matched_at, clear matching_at
    await supabase
      .from('recalls')
      .update({
        category_matched_at: new Date().toISOString(),
        category_matching_at: null,
      })
      .eq('id', recallId);

    return new Response(
      JSON.stringify({
        success: true,
        recallId,
        matchCount: matchResult.matches.length,
        matchedCategories: matchResult.matches.map(m => ({ id: m.category_id, score: m.match_score })),
        threshold: SIMILARITY_THRESHOLD,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[handler] unexpected error:', msg);
    if (recallId) {
      try {
        // Bump attempt count, clear matching_at so the sweeper can retry.
        await supabase.rpc('increment_category_match_attempts', { p_recall_id: recallId });
      } catch (rpcErr) {
        console.error('[handler] failed to increment attempts on error path:', rpcErr);
      }
    }
    return new Response(
      JSON.stringify({ error: msg, recallId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
