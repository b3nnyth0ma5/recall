/**
 * embedding-document Edge Function v3
 *
 * Direct mirror of embedding-image/index.ts with these substitutions:
 * - recall_document_id instead of recall_image_id
 * - recall_documents table instead of recall_images
 * - extracted_text + doc_explanation instead of ocr_text + image_explanation
 * - doc_embedding instead of recall_image_embedding
 * - Triggers people-finder after embedding (same as embedding-image)
 *
 * v3: Fixed 401 on people-finder call.
 * Replaced supabase.functions.invoke() + EdgeRuntime.waitUntil() with an
 * awaited bare fetch() using explicit Authorization: Bearer header.
 * Mirrors the proven ocr-image -> embedding-image pattern exactly.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingRequest {
  recall_document_id: string;
  extracted_text?: string;
  doc_explanation?: string;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== embedding-document Edge Function Started (v3) ===');
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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { recall_document_id, extracted_text, doc_explanation } = requestBody;

    if (!recall_document_id) {
      console.error('No recall_document_id provided in request');
      return new Response(
        JSON.stringify({ error: 'Missing required field: recall_document_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing recall_document_id:', recall_document_id);

    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    // Defensive startup log — confirms key is loaded (logs length, never the value)
    console.log('[embedding-document] SERVICE_ROLE_KEY loaded:', supabaseServiceKey ? `length=${supabaseServiceKey.length}` : 'MISSING');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Supabase credentials missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: OpenAI API key missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if embedding already exists to prevent duplicate processing
    console.log('Checking if embedding already exists...');
    const { data: existingData, error: checkError } = await supabase
      .from('recall_documents')
      .select('doc_embedding, extracted_text, doc_explanation, recall_id, user_id')
      .eq('id', recall_document_id)
      .single();

    if (checkError) {
      console.error('Database check error:', checkError);
      return new Response(
        JSON.stringify({ error: 'Failed to check existing embedding', details: checkError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!existingData) {
      console.error('No document data found for ID:', recall_document_id);
      return new Response(
        JSON.stringify({ error: 'Document data not found in database' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if embedding already exists
    if (existingData.doc_embedding && Array.isArray(existingData.doc_embedding) && existingData.doc_embedding.length > 0) {
      console.log('Embedding already exists for this document, skipping processing');
      const processingTime = Date.now() - startTime;
      return new Response(
        JSON.stringify({
          success: true,
          recall_document_id,
          skipped: true,
          reason: 'Embedding already exists',
          processingTimeMs: processingTime,
          embeddingDimensions: existingData.doc_embedding.length,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('No existing embedding found, proceeding with generation');

    // Use provided values or fall back to database values
    let finalExtractedText = extracted_text || existingData.extracted_text || '';
    let finalDocExplanation = doc_explanation || existingData.doc_explanation || '';

    // Cap input at 8000 chars (token limit safety margin)
    // Truncate from the start of extracted_text if combined is too long
    const MAX_INPUT_CHARS = 8000;
    let combinedInput = `${finalExtractedText} ${finalDocExplanation}`.trim();
    if (combinedInput.length > MAX_INPUT_CHARS) {
      // Truncate extracted_text from the start, keep doc_explanation intact
      const explanationPart = finalDocExplanation ? ` ${finalDocExplanation}` : '';
      const availableForText = MAX_INPUT_CHARS - explanationPart.length;
      if (availableForText > 0) {
        finalExtractedText = finalExtractedText.substring(0, availableForText);
      } else {
        finalExtractedText = '';
      }
      combinedInput = `${finalExtractedText}${explanationPart}`.trim();
    }

    const inputText = combinedInput;

    if (!inputText) {
      console.warn('No text content to embed (both extracted_text and doc_explanation are empty)');
      return new Response(
        JSON.stringify({
          error: 'No text content available for embedding',
          details: 'Both extracted_text and doc_explanation are empty'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

        if (openaiResponse.ok) break;

        if (openaiResponse.status === 429 && retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`Rate limited. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }
        break;
      } catch (fetchError) {
        console.error(`Fetch attempt ${retryCount + 1} failed:`, fetchError);
        if (retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000;
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
        JSON.stringify({ error: 'OpenAI API request failed', details: errorMessage, status: openaiResponse?.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openaiData = await openaiResponse.json() as OpenAIEmbeddingResponse;

    if (!openaiData.data || openaiData.data.length === 0) {
      console.error('No data in OpenAI response');
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const embeddingBase64 = openaiData.data[0].embedding;

    console.log('OpenAI embedding received');
    console.log('Embedding format: base64');
    console.log('Embedding length (base64):', embeddingBase64.length);
    if (openaiData.usage) {
      console.log('Token usage:', JSON.stringify(openaiData.usage));
    }

    // Decode base64 to float32 array
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
      .from('recall_documents')
      .update({ doc_embedding: embeddingArray })
      .eq('id', recall_document_id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update database with embedding', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log('=== Embedding processing completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    // Trigger people-finder asynchronously (fire-and-forget bare fetch, mirroring embedding-image).
    // FIXED v3: Use bare fetch() with explicit Authorization header — same pattern as embedding-image.
    // Do NOT use supabase.functions.invoke() — it produces a malformed JWT.
    console.log('[embedding-document] Triggering people-finder for recall:', existingData.recall_id);
    console.log('User ID:', existingData.user_id);

    // Fetch the recall text to combine with doc explanation
    let recallText = '';
    try {
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .select('text')
        .eq('id', existingData.recall_id)
        .single();

      if (recallError) {
        console.error('Failed to fetch recall text:', recallError);
      } else if (recallData) {
        recallText = recallData.text || '';
        console.log('Recall text length:', recallText.length);
      }
    } catch (recallFetchError) {
      console.error('Exception fetching recall text:', recallFetchError);
    }

    // Trigger people-finder asynchronously (don't await — mirrors embedding-image pattern exactly)
    fetch(`${supabaseUrl}/functions/v1/people-finder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        recall_id: existingData.recall_id,
        user_id: existingData.user_id,
        text: recallText,
        image_explanation: finalDocExplanation, // people-finder accepts image_explanation field
      }),
    })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          console.log('[embedding-document] people-finder triggered successfully:', data);
        } else {
          const errorText = await response.text();
          console.error('[embedding-document] Failed to trigger people-finder:', errorText);
        }
      })
      .catch((error) => {
        console.error('[embedding-document] Exception while triggering people-finder:', error);
      });

    console.log('[embedding-document] people-finder triggered asynchronously');

    // ===== TRIGGER MATCH-RECOLLECTION-CATEGORY FIRE-AND-FORGET =====
    console.log('[embedding-document] Triggering match-recollection-category asynchronously');
    fetch(`${supabaseUrl}/functions/v1/match-recollection-category`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ recallId: existingData.recall_id }),
    })
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          console.log('[embedding-document] match-recollection-category triggered successfully:', data);
        } else {
          const errorText = await response.text();
          console.error('[embedding-document] Failed to trigger match-recollection-category:', errorText);
        }
      })
      .catch((error) => {
        console.error('[embedding-document] Exception while triggering match-recollection-category:', error);
      });
    console.log('[embedding-document] match-recollection-category triggered asynchronously');

    return new Response(
      JSON.stringify({
        success: true,
        recall_document_id,
        processingTimeMs: processingTime,
        embeddingDimensions: embeddingArray.length,
        inputTextLength: inputText.length,
        tokenUsage: openaiData.usage,
        peopleFinderTriggered: true,
        categoryMatchingTriggered: true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in embedding-document Edge Function ===');
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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
