
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
  console.log('=== search-recalls-with-people function invoked ===');
  console.log('Timestamp:', new Date().toISOString());

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
      console.error('Authentication error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Authenticated user:', user.id);

    // Parse request body
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Search query:', query);

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Step 1: Use NLP NER to detect people names in the query
    console.log('Step 1: Detecting people names using NLP NER with GPT-4o-mini...');
    let peopleRecallIds: string[] = [];
    let detectedPersonNames: string[] = [];
    let matchedPersonNames: string[] = [];

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
              content: 'You are a Named Entity Recognition (NER) expert. Extract all person names from the user\'s query. Return only the names as a JSON array of strings. If no names are found, return an empty array. Format: {"names": ["Name1", "Name2"]}'
            },
            {
              role: 'user',
              content: `Extract person names from this query: "${query}"`
            }
          ],
          temperature: 0.1,
          max_tokens: 200,
          response_format: { type: 'json_object' }
        })
      });

      if (!nerResponse.ok) {
        const errorText = await nerResponse.text();
        console.error('OpenAI NER API error:', errorText);
        // Return empty result if NER fails
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

      const nerData = await nerResponse.json();
      const nerContent = nerData.choices?.[0]?.message?.content;

      if (nerContent) {
        try {
          const parsed = JSON.parse(nerContent);
          const detectedNames = parsed.names || parsed.persons || parsed.people || [];

          if (Array.isArray(detectedNames) && detectedNames.length > 0) {
            detectedPersonNames = detectedNames;
            console.log('Detected person names:', detectedPersonNames);

            // Step 2: Search for these people in the Persons table
            console.log('Step 2: Searching for detected people in database...');
            const { data: personsData, error: personsError } = await supabase
              .from('persons')
              .select('id, person_name')
              .eq('user_id', user.id);

            if (!personsError && personsData && personsData.length > 0) {
              // Find matching persons (case-insensitive partial match)
              const matchingPersonIds: string[] = [];

              for (const detectedName of detectedNames) {
                const normalizedDetected = detectedName.toLowerCase().trim();

                for (const person of personsData) {
                  const normalizedPerson = person.person_name.toLowerCase().trim();

                  // Check if either name contains the other (partial match)
                  if (normalizedPerson.includes(normalizedDetected) ||
                    normalizedDetected.includes(normalizedPerson)) {
                    matchingPersonIds.push(person.id);
                    matchedPersonNames.push(person.person_name);
                    console.log(`Matched "${detectedName}" to person "${person.person_name}"`);
                  }
                }
              }

              if (matchingPersonIds.length > 0) {
                // Step 3: Get recalls mentioning these people
                console.log('Step 3: Fetching recalls mentioning detected people...');
                const { data: recallPeopleData, error: recallPeopleError } = await supabase
                  .from('recall_people')
                  .select('recall_id')
                  .in('person_id', matchingPersonIds)
                  .eq('user_id', user.id);

                if (!recallPeopleError && recallPeopleData && recallPeopleData.length > 0) {
                  peopleRecallIds = [...new Set(recallPeopleData.map((rp: any) => rp.recall_id))];
                  console.log(`Found ${peopleRecallIds.length} recalls mentioning detected people`);
                }
              }
            }
          }
        } catch (parseError) {
          console.error('Failed to parse NER response:', parseError);
        }
      }
    } catch (nerError) {
      console.error('Error in NER detection:', nerError);
    }

    // Return results
    const hasPeopleIntent = matchedPersonNames.length > 0;
    const processingTime = Date.now() - startTime;

    console.log('=== search-recalls-with-people completed ===');
    console.log('Has people intent:', hasPeopleIntent);
    console.log('Matched person names:', matchedPersonNames);
    console.log('Recall IDs:', peopleRecallIds.length);
    console.log('Processing time:', processingTime, 'ms');

    return new Response(
      JSON.stringify({
        hasPeopleIntent,
        recallIds: peopleRecallIds,
        personInfo: hasPeopleIntent ? {
          detectedNames: detectedPersonNames,
          matchedNames: matchedPersonNames,
        } : null,
        processingTimeMs: processingTime,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in search-recalls-with-people function ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Processing time before error:', processingTime, 'ms');

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
