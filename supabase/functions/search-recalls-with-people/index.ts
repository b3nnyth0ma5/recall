
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

    console.log('[People Search] ========================================');
    console.log('[People Search] Query:', query);

    // Get Claude API key
    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!claudeApiKey) {
      return new Response(
        JSON.stringify({ error: 'Claude API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // OPTIMIZATION: Run NER detection and persons fetch in parallel
    console.log('[People Search] Running NER detection and fetching persons in parallel...');
    const [nerResult, personsResult] = await Promise.all([
      // NER detection
      (async () => {
        try {
          console.log('[People Search] Calling Claude NER API...');
          const nerStartTime = Date.now();
          
          const nerResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': claudeApiKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json'
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5',
              max_tokens: 200,
              system: 'Extract person names as JSON object. Format: {"names": ["Name1", "Name2"]}. No explanation. Respond with valid JSON only.',
              messages: [
                {
                  role: 'user',
                  content: `Extract person names from: "${query}"`
                }
              ]
            })
          });

          const nerDuration = Date.now() - nerStartTime;
          console.log(`[People Search] NER API call completed in ${nerDuration}ms`);

          if (!nerResponse.ok) {
            console.log('[People Search] NER API returned error status:', nerResponse.status);
            return { names: [] };
          }

          const nerData = await nerResponse.json();
          const nerContent = nerData.content?.[0]?.text;

          if (nerContent) {
            const parsed = JSON.parse(nerContent);
            const detectedNames = parsed.names || parsed.persons || parsed.people || [];
            const namesArray = Array.isArray(detectedNames) ? detectedNames : [];
            
            console.log('[People Search] ========================================');
            console.log('[People Search] NER RESULTS:');
            console.log('[People Search]   Names Detected:', namesArray.length);
            console.log('[People Search]   Names:', JSON.stringify(namesArray));
            console.log('[People Search] ========================================');
            
            return { names: namesArray };
          }

          console.log('[People Search] NER returned no content');
          return { names: [] };
        } catch (error) {
          console.error('[People Search] NER error:', error);
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
    console.log('[People Search] ========================================');
    console.log('[People Search] DETECTED NAMES COUNT:', detectedNames.length);

    if (detectedNames.length === 0) {
      console.log('[People Search] No names detected - returning no people intent');
      console.log('[People Search] ========================================');
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
      console.log('[People Search] No persons found in database');
      console.log('[People Search] ========================================');
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
    console.log('[People Search] ========================================');
    console.log('[People Search] DATABASE PERSONS:');
    console.log('[People Search]   Total persons in database:', personsData.length);
    console.log('[People Search] ========================================');

    // FIXED: Find matching persons with EXACT match only (no partial matches)
    // Match is case-insensitive but must be exact (full name match)
    const matchingPersonIds: string[] = [];
    const matchedPersonNames: string[] = [];

    console.log('[People Search] MATCHING PROCESS:');
    console.log('[People Search]   Matching detected names with database persons...');
    console.log('[People Search]   Match Type: EXACT ONLY (no partial matches)');
    console.log('[People Search] ========================================');
    
    for (const detectedName of detectedNames) {
      const normalizedDetected = detectedName.toLowerCase().trim();
      console.log(`[People Search] Looking for exact match for: "${detectedName}"`);

      let foundMatch = false;
      for (const person of personsData) {
        const normalizedPerson = person.person_name.toLowerCase().trim();

        // EXACT match only - no partial matches
        if (normalizedPerson === normalizedDetected) {
          matchingPersonIds.push(person.id);
          matchedPersonNames.push(person.person_name);
          console.log(`[People Search]   ✓ Exact match found: "${person.person_name}" (ID: ${person.id})`);
          foundMatch = true;
        }
      }
      
      if (!foundMatch) {
        console.log(`[People Search]   ✗ No exact match found for: "${detectedName}"`);
      }
    }

    console.log('[People Search] ========================================');
    console.log('[People Search] MATCHING RESULTS:');
    console.log('[People Search]   Total exact matches found:', matchingPersonIds.length);
    console.log('[People Search]   Matched person names:', JSON.stringify(matchedPersonNames));
    console.log('[People Search]   Matched person IDs:', JSON.stringify(matchingPersonIds));
    console.log('[People Search] ========================================');

    if (matchingPersonIds.length === 0) {
      console.log('[People Search] No exact matches found - returning no people intent');
      console.log('[People Search] ========================================');
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
        console.log('[People Search] Search mode: ALL (looking for recalls with all people)');
      } else {
        console.log('[People Search] Search mode: ANY (looking for recalls with any person)');
      }
    } else {
      console.log('[People Search] Search mode: ANY (single person query)');
    }

    // Fetch recalls based on search mode
    console.log('[People Search] ========================================');
    console.log('[People Search] Fetching recall_people relationships...');
    const { data: recallPeopleData, error: recallPeopleError } = await supabase
      .from('recall_people')
      .select('recall_id, person_id')
      .in('person_id', matchingPersonIds)
      .eq('user_id', user.id);

    if (recallPeopleError || !recallPeopleData || recallPeopleData.length === 0) {
      console.log('[People Search] No recall_people relationships found');
      console.log('[People Search] ========================================');
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

    console.log('[People Search] Found', recallPeopleData.length, 'recall_people relationships');

    let peopleRecallIds: string[] = [];

    if (searchMode === 'any') {
      // ANY mode: Find recalls mentioning any of the people
      peopleRecallIds = [...new Set(recallPeopleData.map((rp: any) => rp.recall_id))];
      console.log('[People Search] ANY mode - found', peopleRecallIds.length, 'unique recalls');
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
      console.log('[People Search] ALL mode - threshold:', threshold, 'out of', matchingPersonIds.length, 'people');
      
      peopleRecallIds = Array.from(recallPersonCounts.entries())
        .filter(([_, personSet]) => personSet.size >= threshold)
        .map(([recallId, _]) => recallId);
      
      console.log('[People Search] ALL mode - found', peopleRecallIds.length, 'recalls meeting threshold');
    }

    const processingTime = Date.now() - startTime;
    console.log('[People Search] ========================================');
    console.log('[People Search] FINAL SUMMARY:');
    console.log('[People Search]   Processing Time:', processingTime, 'ms');
    console.log('[People Search]   NER detected names:', JSON.stringify(detectedNames));
    console.log('[People Search]   Exact matches found:', JSON.stringify(matchedPersonNames));
    console.log('[People Search]   Total recalls matched:', peopleRecallIds.length);
    console.log('[People Search]   Recall IDs:', JSON.stringify(peopleRecallIds.slice(0, 10)), peopleRecallIds.length > 10 ? '...' : '');
    console.log('=== search-recalls-with-people completed in', processingTime, 'ms ===');
    console.log('[People Search] ========================================');

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
