
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingRequest {
  recall_url_id: string;
  url_data?: string;
}

interface OpenAIEmbeddingResponse {
  data: {
    embedding: string; // base64 encoded
    index: number;
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
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
 * Embedding URL Edge Function
 * 
 * This function:
 * 1. Receives a recall_url_id and optionally url_data
 * 2. Checks if an embedding already exists to prevent duplicate processing
 * 3. If not provided, fetches url_data from the database
 * 4. Calls OpenAI's text-embedding-3-small model with base64 encoding
 * 5. Stores the resulting embedding in recall_urls.recall_url_embedding
 * 
 * Features:
 * - Uses text-embedding-3-small model for cost efficiency
 * - Base64 encoding format for compact storage
 * - Automatic retry logic for transient failures
 * - Comprehensive error handling and logging
 * - Duplicate processing prevention
 */

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== Embedding URL Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Parse and validate request body
    let requestBody: EmbeddingRequest;
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

    const { recall_url_id, url_data } = requestBody;
    
    if (!recall_url_id) {
      console.error('No recall_url_id provided in request');
      return new Response(
        JSON.stringify({ error: 'Missing required field: recall_url_id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Processing recall_url_id:', recall_url_id);

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

    // Check if embedding already exists to prevent duplicate processing
    console.log('Checking if embedding already exists...');
    const { data: existingData, error: checkError } = await supabase
      .from('recall_urls')
      .select('recall_url_embedding, url_data')
      .eq('id', recall_url_id)
      .single();

    if (checkError) {
      console.error('Database check error:', checkError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to check existing embedding',
          details: checkError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!existingData) {
      console.error('No URL data found for ID:', recall_url_id);
      return new Response(
        JSON.stringify({ error: 'URL data not found in database' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // If embedding already exists, skip processing
    if (existingData.recall_url_embedding && Array.isArray(existingData.recall_url_embedding) && existingData.recall_url_embedding.length > 0) {
      console.log('Embedding already exists for this URL, skipping processing');
      const processingTime = Date.now() - startTime;
      return new Response(
        JSON.stringify({ 
          success: true, 
          recall_url_id: recall_url_id,
          skipped: true,
          reason: 'Embedding already exists',
          processingTimeMs: processingTime,
          embeddingDimensions: existingData.recall_url_embedding.length,
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('No existing embedding found, proceeding with generation');

    // If url_data not provided, use from database
    let finalUrlData = url_data || existingData.url_data || '';

    if (!finalUrlData) {
      console.warn('No URL data available for embedding (url_data is empty or null)');
      return new Response(
        JSON.stringify({ 
          error: 'No URL data available for embedding',
          details: 'url_data is empty or null'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('URL data length:', finalUrlData.length);
    console.log('URL data preview:', finalUrlData.substring(0, 100) + (finalUrlData.length > 100 ? '...' : ''));

    // Call OpenAI Embeddings API
    console.log('Calling OpenAI Embeddings API...');
    console.log('Model: text-embedding-3-small');
    console.log('Encoding format: base64');

    const openaiRequestBody = {
      model: 'text-embedding-3-small',
      input: finalUrlData,
      encoding_format: 'base64',
    };

    let openaiResponse;
    let retryCount = 0;
    const maxRetries = 2;

    // Retry logic for transient failures
    while (retryCount <= maxRetries) {
      try {
        openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
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
        // If parsing fails, use the raw error text
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

    const openaiData = await openaiResponse.json() as OpenAIEmbeddingResponse;
    
    if (!openaiData.data || openaiData.data.length === 0) {
      console.error('No data in OpenAI response');
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI API' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const embeddingBase64 = openaiData.data[0].embedding;
    
    console.log('OpenAI embedding received');
    console.log('Embedding format: base64');
    console.log('Embedding length (base64):', embeddingBase64.length);
    if (openaiData.usage) {
      console.log('Token usage:', JSON.stringify(openaiData.usage));
    }

    // Decode base64 to get the actual embedding array
    // Base64 string represents a float32 array
    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    const embeddingArray = Array.from(float32Array);

    console.log('Decoded embedding array length:', embeddingArray.length);
    console.log('Embedding array preview (first 5 values):', embeddingArray.slice(0, 5));

    // Update the database with the embedding
    console.log('Updating database with embedding...');
    const { error: updateError } = await supabase
      .from('recall_urls')
      .update({
        recall_url_embedding: embeddingArray,
      })
      .eq('id', recall_url_id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to update database with embedding', 
          details: updateError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log('=== Embedding processing completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    return new Response(
      JSON.stringify({ 
        success: true, 
        recall_url_id: recall_url_id,
        processingTimeMs: processingTime,
        embeddingDimensions: embeddingArray.length,
        urlDataLength: finalUrlData.length,
        tokenUsage: openaiData.usage,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Embedding URL Edge Function ===');
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
