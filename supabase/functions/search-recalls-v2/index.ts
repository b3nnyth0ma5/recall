import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

interface Recall {
  recall_id: string;
  matchPercentage: number;
  tier?: string;
  recall_data?: any;
  images_data?: any[];
  isLocationMatch?: boolean;
  isPeopleMatch?: boolean;
  isKeywordMatch?: boolean;
  keywordMatches?: number;
  totalKeywords?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== search-recalls-v2 started ===', new Date().toISOString());

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

    const { query, locationRecalls, peopleRecalls, keywordRecalls, personInfo } = await req.json();
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Query: "${query}" | location=${locationRecalls?.length ?? 0} people=${peopleRecalls?.length ?? 0} keyword=${keywordRecalls?.length ?? 0}`);

    // Build sets of IDs that need full data fetched
    const recallIdsToFetch = new Set<string>();
    const keywordRecallsMap = new Map<string, any>();

    if (keywordRecalls?.length) {
      for (const r of keywordRecalls) keywordRecallsMap.set(r.recall_id, r);
    }
    if (locationRecalls?.length) {
      for (const r of locationRecalls) r.recall_id && recallIdsToFetch.add(r.recall_id);
    }
    if (peopleRecalls?.length) {
      for (const r of peopleRecalls) r.recall_id && recallIdsToFetch.add(r.recall_id);
    }

    const allUniqueRecallIds = new Set<string>([...keywordRecallsMap.keys(), ...recallIdsToFetch]);
    console.log(`Fetching data for ${recallIdsToFetch.size} recalls, images for ${allUniqueRecallIds.size} recalls`);

    // Fetch recall data and images in parallel
    const [fetchedRecallsResult, allImagesResult] = await Promise.all([
      recallIdsToFetch.size > 0
        ? supabase
            .from('recalls')
            .select('id, text, location, location_primary_type, created_at')
            .in('id', Array.from(recallIdsToFetch))
            .eq('user_id', user.id)
        : Promise.resolve({ data: [], error: null }),
      allUniqueRecallIds.size > 0
        ? supabase
            .from('recall_images')
            .select('id, recall_id, ocr_text, image_explanation')
            .in('recall_id', Array.from(allUniqueRecallIds))
            .eq('user_id', user.id)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (fetchedRecallsResult.error) console.error('Error fetching recalls:', fetchedRecallsResult.error);
    if (allImagesResult.error) console.error('Error fetching images:', allImagesResult.error);

    // Build lookup maps
    const fetchedRecallsMap = new Map<string, any>();
    for (const r of (fetchedRecallsResult.data ?? [])) {
      fetchedRecallsMap.set(r.id, {
        text: r.text || '',
        location: r.location || '',
        location_primary_type: r.location_primary_type || '',
        created_at: r.created_at
      });
    }

    const imagesByRecallId = new Map<string, any[]>();
    for (const img of (allImagesResult.data ?? [])) {
      if (!imagesByRecallId.has(img.recall_id)) imagesByRecallId.set(img.recall_id, []);
      imagesByRecallId.get(img.recall_id)!.push({
        id: img.id,
        ocr_text: img.ocr_text || '',
        image_explanation: img.image_explanation || '',
        similarity: 1.0
      });
    }

    // Merge all recalls, deduplicating by recall_id
    const allRecallsMap = new Map<string, Recall>();

    if (locationRecalls?.length) {
      for (const r of locationRecalls) {
        allRecallsMap.set(r.recall_id, {
          recall_id: r.recall_id,
          matchPercentage: r.matchPercentage || 100,
          isLocationMatch: true,
          isPeopleMatch: false,
          isKeywordMatch: false,
          recall_data: fetchedRecallsMap.get(r.recall_id) ?? { text: '', location: '', location_primary_type: '', created_at: null },
          images_data: imagesByRecallId.get(r.recall_id) ?? []
        });
      }
    }

    if (peopleRecalls?.length) {
      for (const r of peopleRecalls) {
        const existing = allRecallsMap.get(r.recall_id);
        if (existing) {
          existing.isPeopleMatch = true;
        } else {
          allRecallsMap.set(r.recall_id, {
            recall_id: r.recall_id,
            matchPercentage: r.matchPercentage || 100,
            isLocationMatch: false,
            isPeopleMatch: true,
            isKeywordMatch: false,
            recall_data: fetchedRecallsMap.get(r.recall_id) ?? { text: '', location: '', location_primary_type: '', created_at: null },
            images_data: imagesByRecallId.get(r.recall_id) ?? []
          });
        }
      }
    }

    if (keywordRecalls?.length) {
      for (const r of keywordRecalls) {
        const allImages = imagesByRecallId.get(r.recall_id) ?? [];
        const mergedImages = allImages.map((img: any) => {
          const ki = r.images_data?.find((k: any) => k.id === img.id);
          return ki ?? img;
        });
        const existing = allRecallsMap.get(r.recall_id);
        if (existing) {
          existing.isKeywordMatch = true;
          existing.keywordMatches = r.keywordMatches;
          existing.totalKeywords = r.totalKeywords;
          existing.matchPercentage = Math.max(existing.matchPercentage || 0, r.matchPercentage || 0);
          existing.images_data = mergedImages;
        } else {
          allRecallsMap.set(r.recall_id, {
            recall_id: r.recall_id,
            matchPercentage: r.matchPercentage || 0,
            isLocationMatch: false,
            isPeopleMatch: false,
            isKeywordMatch: true,
            keywordMatches: r.keywordMatches,
            totalKeywords: r.totalKeywords,
            recall_data: r.recall_data ?? { text: '', location: '', location_primary_type: '', created_at: null },
            images_data: mergedImages
          });
        }
      }
    }

    const allRecalls = Array.from(allRecallsMap.values());
    console.log(`Combined ${allRecalls.length} unique recalls`);

    if (allRecalls.length === 0) {
      return new Response(JSON.stringify({
        answer: null, confidence: 0, results: [],
        processingTimeMs: Date.now() - startTime,
        personInfo: personInfo ?? null
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Sort by match % desc, then recency desc
    allRecalls.sort((a, b) => {
      const diff = (b.matchPercentage || 0) - (a.matchPercentage || 0);
      if (diff !== 0) return diff;
      const da = a.recall_data?.created_at ? new Date(a.recall_data.created_at).getTime() : 0;
      const db = b.recall_data?.created_at ? new Date(b.recall_data.created_at).getTime() : 0;
      return db - da;
    });

    console.log(`Top recall: ${Math.round(allRecalls[0]?.matchPercentage || 0)}% match`);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build context — use array join instead of string concatenation
    const contextParts: string[] = [];
    const contextWithSources: Array<{ sourceId: string; recallId: string; matchPercentage: number; tier: string; isLocationMatch: boolean; isPeopleMatch: boolean; isKeywordMatch: boolean }> = [];

    for (let idx = 0; idx < allRecalls.length; idx++) {
      const recall = allRecalls[idx];
      const sourceId = `SOURCE_${idx + 1}`;

      const matchTypes: string[] = [];
      if (recall.isLocationMatch) matchTypes.push('LOCATION');
      if (recall.isPeopleMatch) matchTypes.push('PEOPLE');
      if (recall.isKeywordMatch) matchTypes.push('KEYWORD');

      const parts: string[] = [
        `${sourceId} (${Math.round(recall.matchPercentage || 0)}%${matchTypes.length ? ` [${matchTypes.join('+')}]` : ''}${recall.tier ? ` [${recall.tier}]` : ''}${recall.keywordMatches && recall.totalKeywords ? ` [${recall.keywordMatches}/${recall.totalKeywords} kw]` : ''}):`,
        `Text: ${recall.recall_data?.text || ''}`,
        `Location: ${recall.recall_data?.location || ''} (${recall.recall_data?.location_primary_type || ''})`
      ];

      if (recall.images_data?.length) {
        for (let i = 0; i < recall.images_data.length; i++) {
          const img = recall.images_data[i];
          const simStr = img.similarity && img.similarity < 1.0 ? ` (${Math.round(img.similarity * 100)}%)` : '';
          if (img.image_explanation) parts.push(`  Img${i + 1}${simStr} explanation: ${img.image_explanation}`);
          if (img.ocr_text) parts.push(`  Img${i + 1}${simStr} ocr: ${img.ocr_text}`);
        }
      }

      contextParts.push(parts.join('\n'));
      contextWithSources.push({
        sourceId, recallId: recall.recall_id,
        matchPercentage: recall.matchPercentage || 0,
        tier: recall.tier || 'MEDIUM',
        isLocationMatch: recall.isLocationMatch || false,
        isPeopleMatch: recall.isPeopleMatch || false,
        isKeywordMatch: recall.isKeywordMatch || false
      });
    }

    const context = contextParts.join('\n\n');

    // gpt-4o: near-identical accuracy for structured QA over provided context
    const systemPrompt = `You are a search assistant answering questions from personal memory recalls. Answer based only on the provided recalls, prioritising highest match % first.

Rules:
- Cite sources inline as SOURCE_X immediately after relevant info
- Use bullet points for lists
- Return JSON only: {"answer": "text with SOURCE_X inline", "confidence": 0-100, "sources": ["SOURCE_1"]}
- If insufficient info: {"answer": "I don't have enough information in the provided recalls to answer this question.", "confidence": 0, "sources": []}`;

    console.log('Calling gpt-4o for QA...');
    const qaResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Question: ${query}\n\nRecalls (highest match first):\n${context}` }
        ]
      })
    });

    if (!qaResponse.ok) {
      const errorText = await qaResponse.text();
      console.error('OpenAI QA error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to generate answer', details: errorText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const qaData = await qaResponse.json();
    const qaContent = qaData.choices?.[0]?.message?.content;

    let answer = null;
    let confidence = 0;
    let sourcesUsed: string[] = [];

    if (qaContent) {
      try {
        const jsonMatch = qaContent.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch?.[0] ?? qaContent);
        answer = parsed.answer ?? null;
        confidence = parsed.confidence ?? 0;
        sourcesUsed = parsed.sources ?? [];
      } catch {
        answer = qaContent;
        confidence = 50;
      }
    }

    console.log(`Answer: ${answer ? 'yes' : 'no'} | Confidence: ${confidence} | Sources: ${sourcesUsed.length}`);

    const sourceRecallIds = sourcesUsed
      .map((sid: string) => contextWithSources.find(c => c.sourceId === sid)?.recallId ?? null)
      .filter(Boolean) as string[];

    const usedSet = new Set(sourceRecallIds);
    const usedRecalls = allRecalls.filter(r => usedSet.has(r.recall_id)).sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
    const unusedRecalls = allRecalls.filter(r => !usedSet.has(r.recall_id)).sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));
    const orderedRecalls = [...usedRecalls, ...unusedRecalls];

    const matchResults = orderedRecalls.map((r: Recall) => ({
      id: r.recall_id,
      matchPercentage: Math.round(r.matchPercentage || 0),
      usedForAnswer: usedSet.has(r.recall_id),
      tier: r.tier || 'MEDIUM',
      keywordMatches: r.keywordMatches || 0,
      totalKeywords: r.totalKeywords || 0,
      isLocationMatch: r.isLocationMatch || false,
      isPeopleMatch: r.isPeopleMatch || false,
      isKeywordMatch: r.isKeywordMatch || false
    }));

    const processingTime = Date.now() - startTime;
    console.log(`=== search-recalls-v2 done in ${processingTime}ms ===`);

    return new Response(JSON.stringify({
      answer, confidence,
      results: matchResults,
      processingTimeMs: processingTime,
      personInfo: personInfo ?? null
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Error in search-recalls-v2:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: processingTime
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
