/**
 * extract-document Edge Function
 * 
 * Receives a recall_document record ID, downloads the file from Supabase Storage
 * (cdn_url is a storage path like "<userId>/<uuid>-<fileName>"),
 * uploads it to OpenAI Files API, uses the Responses API to extract text
 * and generate a summary, then stores results and triggers embedding-document.
 * 
 * Mirrors the ocr-image → embedding-image pipeline pattern exactly.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentRecord {
  id: string;
  recall_id: string;
  user_id: string;
  cdn_url?: string;
  file_name: string;
  content_type: string;
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
  console.log('=== extract-document Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { record } = requestBody as { record: DocumentRecord };

    if (!record || !record.id) {
      console.error('No record or record.id provided in request');
      return new Response(
        JSON.stringify({ error: 'Missing required field: record.id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing document ID:', record.id);
    console.log('Recall ID:', record.recall_id);

    // Validate environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    // Defensive startup log — confirms key is loaded (logs length, never the value)
    console.log('[extract-document] SERVICE_ROLE_KEY loaded:', supabaseServiceKey ? `length=${supabaseServiceKey.length}` : 'MISSING');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration — supabaseUrl:', !!supabaseUrl, 'supabaseServiceKey:', !!supabaseServiceKey);
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

    // Initialize Supabase client with service-role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch the document row from the database
    console.log('Fetching document row from database...');
    const { data: docData, error: fetchError } = await supabase
      .from('recall_documents')
      .select('cdn_url, file_name, content_type, user_id, recall_id, processed_at')
      .eq('id', record.id)
      .single();

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch document data', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!docData) {
      console.error('No document data found for ID:', record.id);
      return new Response(
        JSON.stringify({ error: 'Document not found in database' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Skip if already processed
    if (docData.processed_at) {
      console.log('Document already processed, skipping');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Already processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!docData.cdn_url) {
      console.error('No cdn_url found for document:', record.id);
      return new Response(
        JSON.stringify({ error: 'Document cdn_url not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Document cdn_url:', docData.cdn_url);
    console.log('File name:', docData.file_name);
    console.log('Content type:', docData.content_type);

    // Step 1: Download the file.
    // cdn_url is a Supabase Storage path (e.g. "<userId>/<uuid>-file.pdf").
    // Use the service-role client to download directly from the 'documents' bucket.
    // Defensive fallback: if cdn_url starts with https://, use the old fetch() path
    // so we don't regress anything that legitimately stored a full URL.
    console.log('Downloading file...');
    let fileBytes: Uint8Array;
    try {
      if (docData.cdn_url.startsWith('https://')) {
        // Legacy full-URL path
        console.log('cdn_url is a full URL — using fetch() download path');
        const downloadResponse = await fetch(docData.cdn_url);
        if (!downloadResponse.ok) {
          throw new Error(`Download failed with status ${downloadResponse.status}: ${downloadResponse.statusText}`);
        }
        const arrayBuffer = await downloadResponse.arrayBuffer();
        fileBytes = new Uint8Array(arrayBuffer);
      } else {
        // Primary path: cdn_url is a storage path — download via service-role client
        console.log('cdn_url is a storage path — downloading via supabase.storage.from(documents).download()');
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from('documents')
          .download(docData.cdn_url);

        if (downloadError || !fileBlob) {
          throw new Error(
            downloadError?.message ||
            `Storage download returned no data for path: ${docData.cdn_url}`
          );
        }

        const arrayBuffer = await fileBlob.arrayBuffer();
        fileBytes = new Uint8Array(arrayBuffer);
      }

      console.log('File downloaded, size:', fileBytes.length, 'bytes');
    } catch (downloadError) {
      console.error('Failed to download file:', downloadError);
      return new Response(
        JSON.stringify({ error: 'Failed to download document file', details: downloadError instanceof Error ? downloadError.message : 'Unknown error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Upload file to OpenAI Files API
    console.log('Uploading file to OpenAI Files API...');
    let openaiFileId: string;
    try {
      const formData = new FormData();
      const blob = new Blob([fileBytes], { type: docData.content_type });
      formData.append('file', blob, docData.file_name);
      formData.append('purpose', 'assistants');

      let uploadResponse;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          uploadResponse = await fetch('https://api.openai.com/v1/files', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
            },
            body: formData,
          });

          if (uploadResponse.ok) break;

          if (uploadResponse.status === 429 && retryCount < maxRetries) {
            const waitTime = Math.pow(2, retryCount) * 1000;
            console.log(`Rate limited on file upload. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
            continue;
          }
          break;
        } catch (fetchError) {
          console.error(`File upload attempt ${retryCount + 1} failed:`, fetchError);
          if (retryCount < maxRetries) {
            const waitTime = Math.pow(2, retryCount) * 1000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
          } else {
            throw fetchError;
          }
        }
      }

      if (!uploadResponse || !uploadResponse.ok) {
        const errorText = await uploadResponse?.text() || 'No response';
        console.error('OpenAI file upload error:', errorText);
        throw new Error(`OpenAI file upload failed: ${errorText.substring(0, 200)}`);
      }

      const uploadData = await uploadResponse.json();
      openaiFileId = uploadData.id;
      console.log('OpenAI file uploaded, file_id:', openaiFileId);

      // Store the file_id immediately so we have it even if extraction fails
      await supabase
        .from('recall_documents')
        .update({ openai_file_id: openaiFileId })
        .eq('id', record.id);

    } catch (uploadError) {
      console.error('Failed to upload to OpenAI:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file to OpenAI', details: uploadError instanceof Error ? uploadError.message : 'Unknown error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Use OpenAI Responses API to extract text
    console.log('Calling OpenAI Responses API for text extraction...');
    console.log('Model: gpt-4o-mini');

    let extractedText = '';
    let docExplanation = '';

    let responsesResponse;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        responsesResponse = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            input: [{
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'Extract ALL text from this document verbatim. Preserve the structure as much as possible. Then write a 2-3 sentence summary at the end starting with "SUMMARY:".'
                },
                {
                  type: 'input_file',
                  file_id: openaiFileId
                }
              ]
            }]
          }),
        });

        if (responsesResponse.ok) break;

        if (responsesResponse.status === 429 && retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          console.log(`Rate limited on responses API. Waiting ${waitTime}ms before retry ${retryCount + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }
        break;
      } catch (fetchError) {
        console.error(`Responses API attempt ${retryCount + 1} failed:`, fetchError);
        if (retryCount < maxRetries) {
          const waitTime = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
        } else {
          throw fetchError;
        }
      }
    }

    if (!responsesResponse || !responsesResponse.ok) {
      const errorText = await responsesResponse?.text() || 'No response';
      console.error('OpenAI Responses API error:', errorText);

      let errorMessage = 'OpenAI Responses API request failed';
      try {
        const errorJson = JSON.parse(errorText) as OpenAIErrorResponse;
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText.substring(0, 200);
      }

      // Mark as processed with error so we don't retry infinitely
      await supabase
        .from('recall_documents')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', record.id);

      return new Response(
        JSON.stringify({ error: 'OpenAI Responses API request failed', details: errorMessage, status: responsesResponse?.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const responsesData = await responsesResponse.json();
    console.log('OpenAI Responses API response received');

    // Parse the response — Responses API returns output array
    const outputText = responsesData.output
      ?.find((item: any) => item.type === 'message')
      ?.content
      ?.find((c: any) => c.type === 'output_text')
      ?.text || '';

    console.log('Output text length:', outputText.length);

    // Split on SUMMARY: to separate extracted text from summary
    const summaryIndex = outputText.lastIndexOf('SUMMARY:');
    if (summaryIndex !== -1) {
      extractedText = outputText.substring(0, summaryIndex).trim();
      docExplanation = outputText.substring(summaryIndex + 'SUMMARY:'.length).trim();
    } else {
      // No SUMMARY: marker — use full text as extracted_text, generate a fallback explanation
      extractedText = outputText.trim();
      docExplanation = extractedText.substring(0, 300).trim();
    }

    // Sanitize lengths
    extractedText = extractedText.substring(0, 100000); // 100k chars max
    docExplanation = docExplanation.substring(0, 2000);  // 2k chars max

    console.log('Extracted text length:', extractedText.length);
    console.log('Doc explanation length:', docExplanation.length);

    // Step 4: Update recall_documents with results
    console.log('Updating database with extraction results...');
    const { error: updateError } = await supabase
      .from('recall_documents')
      .update({
        extracted_text: extractedText,
        doc_explanation: docExplanation,
        processed_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update database with extraction results', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log('=== Document extraction completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    // Step 5: Trigger embedding-document via supabase.functions.invoke() so the SDK
    // handles the Authorization header correctly using the already-loaded service-role key.
    // Wrap in EdgeRuntime.waitUntil() so the isolate stays alive until the call completes.
    const hasContent = (extractedText && extractedText.trim().length > 0)
      || (docExplanation && docExplanation.trim().length > 0);

    let embeddingTriggered = false;
    if (hasContent) {
      console.log('[extract-document] Triggering embedding-document for', record.id);
      const embeddingPromise = supabase.functions.invoke('embedding-document', {
        body: {
          recall_document_id: record.id,
          extracted_text: extractedText,
          doc_explanation: docExplanation,
        },
      }).then(({ error }) => {
        if (error) {
          console.error('[extract-document] embedding-document invoke error:', error);
        } else {
          console.log('[extract-document] embedding-document invoked successfully');
        }
      }).catch(err => {
        console.error('[extract-document] embedding-document invoke threw:', err);
      });

      // Keep the isolate alive until the background call completes.
      // EdgeRuntime is the Supabase Deno runtime global — it has waitUntil for exactly this.
      // @ts-ignore - EdgeRuntime is provided by Supabase's Deno runtime
      if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
        // @ts-ignore
        EdgeRuntime.waitUntil(embeddingPromise);
        console.log('[extract-document] EdgeRuntime.waitUntil registered for embedding-document call');
      } else {
        console.warn('[extract-document] EdgeRuntime.waitUntil not available — embedding call may not complete');
      }
      embeddingTriggered = true;
    } else {
      console.log('[extract-document] No content to embed, skipping embedding-document');
    }

    // Step 6: Cleanup — delete the OpenAI file (fire-and-forget, also wrapped in waitUntil)
    const cleanupPromise = (async () => {
      try {
        const deleteResponse = await fetch(`https://api.openai.com/v1/files/${openaiFileId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${openaiApiKey}` },
        });
        if (deleteResponse.ok) {
          console.log('OpenAI file deleted:', openaiFileId);
        } else {
          console.warn('Failed to delete OpenAI file (non-critical):', await deleteResponse.text());
        }
      } catch (deleteError) {
        console.warn('Exception deleting OpenAI file (non-critical):', deleteError);
      }
    })();

    // @ts-ignore - EdgeRuntime is provided by Supabase's Deno runtime
    if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
      // @ts-ignore
      EdgeRuntime.waitUntil(cleanupPromise);
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId: record.id,
        processingTimeMs: processingTime,
        extractedTextLength: extractedText.length,
        docExplanationLength: docExplanation.length,
        openaiFileId,
        embeddingTriggered,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in extract-document Edge Function ===');
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
