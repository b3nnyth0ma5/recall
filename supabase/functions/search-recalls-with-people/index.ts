
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const startTime = Date.now();
  console.log('=== search-recalls-with-people started ===');

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // OPTIMIZATION: Run NER detection and persons fetch in parallel
    const [nerResult, personsResult] = await Promise.all([
      // NER detection
      (async () => {
        try {
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
                  content: 'Extract person names as JSON array. Format: {"names": ["Name1", "Name2"]}. No explanation.'
                },
                {
                  role: 'user',
                  content: `Extract person names from: "${query}"`
                }
              ],
              temperature: 0.1,
              max_tokens: 100, // Reduced for speed
              response_format: { type: 'json_object' }
            })
          });

          if (!nerResponse.ok) {
            return { names: [] };
          }

          const nerData = await nerResponse.json();
          const nerContent = nerData.choices?.[0]?.message?.content;

          if (nerContent) {
            const parsed = JSON.parse(nerContent);
            const detectedNames = parsed.names || parsed.persons || parsed.people || [];
            return { names: Array.isArray(detectedNames) ? detectedNames : [] };
          }

          return { names: [] };
        } catch (error) {
          console.error('NER error:', error);
          return { names: [] };
        }
      })(),
      // Fetch persons
      supabase
        .from('persons')
        .select('id, person_name')
        .eq('user_id', user.id)
    ]);

    const detectedNames = nerResult.names;

    if (detectedNames.length === 0) {
      return new Response(
        JSON.stringify({
          hasPeopleIntent: false,
          recallIds: [],
          personInfo: null,
          processingTimeMs: Date.now() - startTime,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (personsResult.error || !personsResult.data || personsResult.data.length === 0) {
      return new Response(
        JSON.stringify({
          hasPeopleIntent: false,
          recallIds: [],
          personInfo: null,
          processingTimeMs: Date.now() - startTime,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const personsData = personsResult.data;

    // OPTIMIZATION: Find matching persons with case-insensitive partial match
    const matchingPersonIds: string[] = [];
    const matchedPersonNames: string[] = [];

    for (const detectedName of detectedNames) {
      const normalizedDetected = detectedName.toLowerCase().trim();

      for (const person of personsData) {
        const normalizedPerson = person.person_name.toLowerCase().trim();

        if (normalizedPerson.includes(normalizedDetected) ||
          normalizedDetected.includes(normalizedPerson)) {
          matchingPersonIds.push(person.id);
          matchedPersonNames.push(person.person_name);
        }
      }
    }

    if (matchingPersonIds.length === 0) {
      return new Response(
        JSON.stringify({
          hasPeopleIntent: false,
          recallIds: [],
          personInfo: null,
          processingTimeMs: Date.now() - startTime,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Determine search mode (ANY vs ALL)
    let searchMode: 'any' | 'all' = 'any';

    if (detectedNames.length > 1) {
      // OPTIMIZATION: Simplified intent detection
      const lowerQuery = query.toLowerCase();
      if (lowerQuery.includes(' with ') || lowerQuery.includes(' and ') || 
          lowerQuery.includes('together') || lowerQuery.includes('both') || 
          lowerQuery.includes('all of')) {
        searchMode = 'all';
      }
    }

    // Fetch recalls based on search mode
    const { data: recallPeopleData, error: recallPeopleError } = await supabase
      .from('recall_people')
      .select('recall_id, person_id')
      .in('person_id', matchingPersonIds)
      .eq('user_id', user.id);

    if (recallPeopleError || !recallPeopleData || recallPeopleData.length === 0) {
      return new Response(
        JSON.stringify({
          hasPeopleIntent: true,
          recallIds: [],
          personInfo: {
            detectedNames: detectedNames,
            matchedNames: matchedPersonNames,
          },
          processingTimeMs: Date.now() - startTime,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let peopleRecallIds: string[] = [];

    if (searchMode === 'any') {
      // ANY mode: Find recalls mentioning any of the people
      peopleRecallIds = [...new Set(recallPeopleData.map((rp: any) => rp.recall_id))];
    } else {
      // ALL mode: Find recalls mentioning all or most of the people
      const recallPersonCounts = new Map<string, Set<string>>();
      
      recallPeopleData.forEach((rp: any) => {
        if (!recallPersonCounts.has(rp.recall_id)) {
          recallPersonCounts.set(rp.recall_id, new Set());
        }
        recallPersonCounts.get(rp.recall_id)!.add(rp.person_id);
      });

      // Filter recalls that mention all or most (>= 50%) of the people
      const threshold = Math.ceil(matchingPersonIds.length * 0.5);
      
      peopleRecallIds = Array.from(recallPersonCounts.entries())
        .filter(([_, personSet]) => personSet.size >= threshold)
        .map(([recallId, _]) => recallId);
    }

    const processingTime = Date.now() - startTime;
    console.log('=== search-recalls-with-people completed in', processingTime, 'ms ===');

    return new Response(
      JSON.stringify({
        hasPeopleIntent: true,
        recallIds: peopleRecallIds,
        personInfo: {
          detectedNames: detectedNames,
          matchedNames: matchedPersonNames,
        },
        processingTimeMs: processingTime,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in search-recalls-with-people ===');
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
