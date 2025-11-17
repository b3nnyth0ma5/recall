
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingRequest {
  recall_image_id: string;
  ocr_text?: string;
  image_explanation?: string;
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
 * Embedding Image Edge Function
 * 
 * This function:
 * 1. Receives a recall_image_id and optionally ocr_text and image_explanation
 * 2. If not provided, fetches ocr_text and image_explanation from the database
 * 3. Concatenates ocr_text and image_explanation as input
 * 4. Calls OpenAI's text-embedding-3-small model with base64 encoding
 * 5. Stores the resulting embedding in recall_images.recall_image_embedding
 * 
 * Features:
 * - Uses text-embedding-3-small model for cost efficiency
 * - Base64 encoding format for compact storage
 * - Automatic retry logic for transient failures
 * - Comprehensive error handling and logging
 */

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== Embedding Image Edge Function Started ===');
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

    const { recall_image_id, ocr_text, image_explanation } = requestBody;
    
    if (!recall_image_id) {
      console.error('No recall_image_id provided in request');
      return new Response(
        JSON.stringify({ error: 'Missing required field: recall_image_id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Processing recall_image_id:', recall_image_id);

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

    // If ocr_text or image_explanation not provided, fetch from database
    let finalOcrText = ocr_text || '';
    let finalImageExplanation = image_explanation || '';

    if (!ocr_text || !image_explanation) {
      console.log('Fetching ocr_text and image_explanation from database...');
      const { data: imageData, error: fetchError } = await supabase
        .from('recall_images')
        .select('ocr_text, image_explanation')
        .eq('id', recall_image_id)
        .single();

      if (fetchError) {
        console.error('Database fetch error:', fetchError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to fetch image data from database',
            details: fetchError.message 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (!imageData) {
        console.error('No image data found for ID:', recall_image_id);
        return new Response(
          JSON.stringify({ error: 'Image data not found in database' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      finalOcrText = imageData.ocr_text || '';
      finalImageExplanation = imageData.image_explanation || '';
      console.log('Fetched data from database');
    }

    // Concatenate ocr_text and image_explanation
    const inputText = `${finalOcrText} ${finalImageExplanation}`.trim();
    
    if (!inputText) {
      console.warn('No text content to embed (both ocr_text and image_explanation are empty)');
      return new Response(
        JSON.stringify({ 
          error: 'No text content available for embedding',
          details: 'Both ocr_text and image_explanation are empty'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Input text length:', inputText.length);
    console.log('Input text preview:', inputText.substring(0, 100) + (inputText.length > 100 ? '...' : ''));

    // Call OpenAI Embeddings API
    console.log('Calling OpenAI Embeddings API...');
    console.log('Model: text-embedding-3-small');
    console.log('Encoding format: base64');

    const openaiRequestBody = {
      model: 'text-embedding-3-small',
      input: inputText,
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
      .from('recall_images')
      .update({
        recall_image_embedding: embeddingArray,
      })
      .eq('id', recall_image_id);

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
        recall_image_id: recall_image_id,
        processingTimeMs: processingTime,
        embeddingDimensions: embeddingArray.length,
        inputTextLength: inputText.length,
        tokenUsage: openaiData.usage,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in Embedding Image Edge Function ===');
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
