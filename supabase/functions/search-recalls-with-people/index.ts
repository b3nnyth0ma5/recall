import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const startTime = Date.now();
  console.log('=== search-recalls-with-people started ===', new Date().toISOString());

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
    if (!query || typeof query !== 'string' || !query.trim()) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Query: "${query}"`);

    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // NER + DB fetch in parallel
    const [nerResult, personsResult] = await Promise.all([
      (async () => {
        try {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': claudeApiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 200,
              system: 'Extract person names as JSON. Format: {"names": ["Name1"]}. JSON only, no explanation.',
              messages: [{ role: 'user', content: `Extract person names from: "${query}"` }]
            })
          });
          if (!res.ok) return { names: [] };
          const data = await res.json();
          const text = data.content?.[0]?.text;
          if (!text) return { names: [] };
          const parsed = JSON.parse(text);
          const names = parsed.names || parsed.persons || parsed.people || [];
          return { names: Array.isArray(names) ? names : [] };
        } catch (e) {
          console.error('NER error:', e);
          return { names: [] };
        }
      })(),
      supabase.from('persons').select('id, person_name').eq('user_id', user.id)
    ]);

    const detectedNames: string[] = nerResult.names;
    console.log(`NER detected ${detectedNames.length} names:`, detectedNames);

    if (detectedNames.length === 0) {
      return new Response(JSON.stringify({
        hasPeopleIntent: false, recallIds: [], personInfo: null,
        processingTimeMs: Date.now() - startTime
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (personsResult.error || !personsResult.data?.length) {
      return new Response(JSON.stringify({
        hasPeopleIntent: false, recallIds: [], personInfo: null,
        processingTimeMs: Date.now() - startTime
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Exact case-insensitive name matching
    const matchingPersonIds: string[] = [];
    const matchedPersonNames: string[] = [];

    for (const detected of detectedNames) {
      const norm = detected.toLowerCase().trim();
      for (const person of personsResult.data) {
        if (person.person_name.toLowerCase().trim() === norm) {
          matchingPersonIds.push(person.id);
          matchedPersonNames.push(person.person_name);
        }
      }
    }

    console.log(`Matched ${matchingPersonIds.length} persons: ${matchedPersonNames.join(', ')}`);

    if (matchingPersonIds.length === 0) {
      return new Response(JSON.stringify({
        hasPeopleIntent: false, recallIds: [], personInfo: null,
        processingTimeMs: Date.now() - startTime
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine search mode: ALL if query implies co-presence, else ANY
    let searchMode: 'any' | 'all' = 'any';
    if (detectedNames.length > 1) {
      const lq = query.toLowerCase();
      if (lq.includes(' with ') || lq.includes(' and ') || lq.includes('together') || lq.includes('both') || lq.includes('all of')) {
        searchMode = 'all';
      }
    }
    console.log(`Search mode: ${searchMode.toUpperCase()}`);

    const { data: recallPeopleData, error: rpError } = await supabase
      .from('recall_people')
      .select('recall_id, person_id')
      .in('person_id', matchingPersonIds)
      .eq('user_id', user.id);

    if (rpError || !recallPeopleData?.length) {
      return new Response(JSON.stringify({
        hasPeopleIntent: true, recallIds: [],
        personInfo: { detectedNames, matchedNames: matchedPersonNames },
        processingTimeMs: Date.now() - startTime
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let peopleRecallIds: string[];

    if (searchMode === 'any') {
      peopleRecallIds = [...new Set(recallPeopleData.map((rp: any) => rp.recall_id))];
    } else {
      const recallPersonSets = new Map<string, Set<string>>();
      for (const rp of recallPeopleData) {
        if (!recallPersonSets.has(rp.recall_id)) recallPersonSets.set(rp.recall_id, new Set());
        recallPersonSets.get(rp.recall_id)!.add(rp.person_id);
      }
      const threshold = Math.ceil(matchingPersonIds.length * 0.5);
      peopleRecallIds = Array.from(recallPersonSets.entries())
        .filter(([, s]) => s.size >= threshold)
        .map(([id]) => id);
    }

    const processingTime = Date.now() - startTime;
    console.log(`Found ${peopleRecallIds.length} recalls | ${processingTime}ms`);

    return new Response(JSON.stringify({
      hasPeopleIntent: true,
      recallIds: peopleRecallIds,
      personInfo: { detectedNames, matchedNames: matchedPersonNames },
      processingTimeMs: processingTime
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Error in search-recalls-with-people:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: processingTime
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
