
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PeopleFinderRequest {
  recall_id: string;
  user_id: string;
  text?: string;
  image_explanation?: string;
}

interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

/**
 * People Finder Edge Function
 * 
 * This function:
 * 1. Receives recall_id, user_id, text, and image_explanation
 * 2. Uses OpenAI NLP NER to detect names of people from the combined text
 * 3. Eliminates duplicate names and capitalizes first letters
 * 4. Inserts/updates records in the "persons" table (unique constraint: user_id, person_name)
 * 5. Inserts/updates records in the "recall_people" table (unique constraint: user_id, recall_id, person_id)
 * 
 * Features:
 * - Runs asynchronously after ocr-image function completes
 * - Uses OpenAI GPT-4o-mini for cost-effective NER
 * - Proper name capitalization
 * - Handles duplicate names
 * - Upserts to avoid conflicts with unique constraints
 */

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== People Finder Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Parse and validate request body
    let requestBody: PeopleFinderRequest;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { recall_id, user_id, text, image_explanation } = requestBody;
    
    if (!recall_id || !user_id) {
      console.error('Missing required fields: recall_id or user_id');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: recall_id and user_id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Processing recall ID:', recall_id);
    console.log('User ID:', user_id);

    // Combine text and image_explanation
    const combinedText = [text, image_explanation]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (!combinedText) {
      console.log('No text content to process, skipping people detection');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No text content to process',
          names: [],
          processingTimeMs: Date.now() - startTime,
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Combined text length:', combinedText.length);

    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Supabase credentials missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: OpenAI API key missing' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Initialize Supabase client with service role key for admin access
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Call OpenAI API for Named Entity Recognition (NER)
    console.log('Calling OpenAI API for NER...');
    console.log('Model: gpt-4o-mini');

    const openaiRequestBody = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a Named Entity Recognition (NER) system specialized in extracting person names from text. 

Your task:
1. Extract ALL person names (first names, last names, or full names) from the provided text
2. Return ONLY the names, one per line
3. Do NOT include titles (Mr., Mrs., Dr., etc.)
4. Do NOT include fictional characters or brand names
5. Do NOT include pronouns or generic terms
6. If no person names are found, return "NO_NAMES_FOUND"

Examples:
Input: "I met John Smith and Sarah at the park. Dr. Johnson was there too."
Output:
John Smith
Sarah
Johnson

Input: "The weather is nice today."
Output:
NO_NAMES_FOUND`
        },
        {
          role: 'user',
          content: combinedText
        }
      ],
      max_tokens: 300,
      temperature: 0.1, // Very low temperature for consistent extraction
    };

    let openaiResponse;
    let retryCount = 0;
    const maxRetries = 2;

    // Retry logic for transient failures
    while (retryCount <= maxRetries) {
      try {
        openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify(openaiRequestBody),
        });

        if (openaiResponse.ok) {
          break; // Success, exit retry loop
        }

        // Handle rate limiting with exponential backoff
        if (openaiResponse.status === 429 && retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          console.log(`Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }

        // For other errors, break and handle below
        break;
      } catch (fetchError) {
        console.error(`Fetch attempt ${retryCount + 1} failed:`, fetchError);
        if (retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
        } else {
          throw fetchError;
        }
      }
    }

    if (!openaiResponse || !openaiResponse.ok) {
      const errorText = await openaiResponse?.text() || 'No response';
      console.error('OpenAI API error response:', errorText);
      
      let errorMessage = 'OpenAI API request failed';
      try {
        const errorJson = JSON.parse(errorText) as OpenAIErrorResponse;
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText.substring(0, 200);
      }

      return new Response(
        JSON.stringify({ 
          error: 'OpenAI API request failed', 
          details: errorMessage,
          status: openaiResponse?.status 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const openaiData = await openaiResponse.json() as OpenAIResponse;
    
    if (!openaiData.choices || openaiData.choices.length === 0) {
      console.error('No choices in OpenAI response');
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI API' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const responseText = openaiData.choices[0]?.message?.content || '';
    
    console.log('OpenAI response received');
    console.log('Response:', responseText);
    if (openaiData.usage) {
      console.log('Token usage:', JSON.stringify(openaiData.usage));
    }

    // Parse and process names
    let names: string[] = [];
    
    if (responseText.trim() !== 'NO_NAMES_FOUND') {
      // Split by newlines and filter empty lines
      const rawNames = responseText
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0 && name !== 'NO_NAMES_FOUND');

      // Capitalize first letter of each word in each name and remove duplicates
      const capitalizedNames = rawNames.map(name => {
        return name
          .split(' ')
          .map(word => {
            if (word.length === 0) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          })
          .join(' ');
      });

      // Remove duplicates (case-insensitive comparison)
      const uniqueNames = new Set<string>();
      capitalizedNames.forEach(name => {
        const normalized = name.toLowerCase();
        if (!Array.from(uniqueNames).some(existing => existing.toLowerCase() === normalized)) {
          uniqueNames.add(name);
        }
      });

      names = Array.from(uniqueNames);
    }

    console.log('Extracted names:', names);
    console.log('Total unique names:', names.length);

    // Process each name: upsert into persons and recall_people tables
    const processedNames: string[] = [];
    const errors: string[] = [];

    for (const personName of names) {
      try {
        console.log(`Processing person: ${personName}`);

        // 1. Upsert into persons table
        const { data: person, error: personError } = await supabase
          .from('persons')
          .upsert(
            { 
              user_id: user_id, 
              person_name: personName 
            },
            { 
              onConflict: 'user_id,person_name',
              ignoreDuplicates: false 
            }
          )
          .select('id')
          .single();

        if (personError) {
          console.error(`Error upserting person "${personName}":`, personError);
          errors.push(`Failed to upsert person "${personName}": ${personError.message}`);
          continue;
        }

        if (!person) {
          console.error(`No person data returned for "${personName}"`);
          errors.push(`No person data returned for "${personName}"`);
          continue;
        }

        console.log(`Person "${personName}" upserted with ID:`, person.id);

        // 2. Upsert into recall_people table
        const { data: recallPerson, error: recallPersonError } = await supabase
          .from('recall_people')
          .upsert(
            { 
              user_id: user_id, 
              recall_id: recall_id, 
              person_id: person.id 
            },
            { 
              onConflict: 'user_id,recall_id,person_id',
              ignoreDuplicates: false 
            }
          )
          .select('id')
          .single();

        if (recallPersonError) {
          console.error(`Error upserting recall_person for "${personName}":`, recallPersonError);
          errors.push(`Failed to link person "${personName}" to recall: ${recallPersonError.message}`);
          continue;
        }

        console.log(`Recall-person link created for "${personName}"`);
        processedNames.push(personName);

      } catch (error) {
        console.error(`Exception processing person "${personName}":`, error);
        errors.push(`Exception processing "${personName}": ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log('=== People Finder processing completed ===');
    console.log('Total processing time:', processingTime, 'ms');
    console.log('Successfully processed:', processedNames.length, 'names');
    console.log('Errors:', errors.length);

    return new Response(
      JSON.stringify({ 
        success: true,
        recall_id: recall_id,
        names: processedNames,
        totalNamesFound: names.length,
        successfullyProcessed: processedNames.length,
        errors: errors.length > 0 ? errors : undefined,
        processingTimeMs: processingTime,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in People Finder Edge Function ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Processing time before error:', processingTime, 'ms');
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingTime,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
