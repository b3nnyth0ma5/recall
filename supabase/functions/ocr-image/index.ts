import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageRecord {
  id: string;
  recall_id: string;
  content_type: string;
  user_id: string;
  cdn_url?: string;
}

/**
 * Enhanced OCR and Image Explanation Edge Function
 * v56: switched cloud path to OpenAI gpt-4o-mini with max_completion_tokens.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== OCR Image Edge Function Started (v56) ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
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

    const { record, pre_extracted_ocr_text } = requestBody as { record: ImageRecord; pre_extracted_ocr_text?: string };
    
    if (!record || !record.id) {
      console.error('No record or record.id provided in request');
      return new Response(
        JSON.stringify({ error: 'Missing required field: record.id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing image ID:', record.id);
    console.log('Recall ID:', record.recall_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

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

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log('Fetching image CDN URL from database...');
    const { data: imageData, error: fetchError } = await supabase
      .from('recall_images')
      .select('cdn_url, content_type, user_id')
      .eq('id', record.id)
      .single();

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch image data from database', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!imageData) {
      return new Response(
        JSON.stringify({ error: 'Image data not found in database' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!imageData.cdn_url) {
      return new Response(
        JSON.stringify({ error: 'Image CDN URL not found in database' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nerStartTime = Date.now();
    const isOnDeviceOCR = typeof pre_extracted_ocr_text === 'string' && pre_extracted_ocr_text.trim().length > 0;
    console.log(`[OCR] Mode: ${isOnDeviceOCR ? 'on-device' : 'cloud'}`);

    console.log('Using CDN URL for processing:', imageData.cdn_url);
    const imageDataUrl = imageData.cdn_url;

    let ocrText = '';
    let explanation = '';

    if (isOnDeviceOCR) {
      // On-device path: use pre-extracted OCR text, call OpenAI gpt-4o for explanation only
      ocrText = pre_extracted_ocr_text!.trim().substring(0, 10000);
      console.log(`[OCR] On-device OCR text length: ${ocrText.length}, calling OpenAI gpt-4o for explanation only`);

      const openaiExplainBody = {
        model: 'gpt-4o',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageDataUrl }
              },
              {
                type: 'text',
                text: 'Describe what this image shows in under 70 words. Be concise and informative. Respond with just the description, no labels or formatting.'
              }
            ]
          }
        ]
      };

      let openaiResponse;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(openaiExplainBody),
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
        console.error('OpenAI API error response (explanation-only):', errorText);
        let errorMessage = 'OpenAI API request failed';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          errorMessage = errorText.substring(0, 200);
        }
        return new Response(
          JSON.stringify({ error: 'OpenAI API request failed', details: errorMessage, status: openaiResponse?.status }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const openaiData = await openaiResponse.json();
      if (!openaiData.choices || openaiData.choices.length === 0) {
        console.error('No choices in OpenAI response');
        return new Response(
          JSON.stringify({ error: 'Invalid response from OpenAI API' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Full response text is the explanation (no OCR TEXT: section needed)
      explanation = (openaiData.choices?.[0]?.message?.content || '').trim().substring(0, 2000);
      console.log('OpenAI explanation received, length:', explanation.length);

    } else {
      // Cloud path: call OpenAI gpt-4o-mini for both OCR and explanation, with system prompt for caching
      console.log('Calling OpenAI gpt-4o-mini Vision API (full OCR + explanation)...');

      const openaiRequestBody = {
        model: 'gpt-4o-mini',
        max_completion_tokens: 2048,
        messages: [
          {
            role: 'system',
            content: `You are an expert OCR and image analysis assistant. For every image you receive, provide two things:

1. OCR TEXT: Extract ALL visible text from the image exactly as it appears. Preserve line breaks and formatting where meaningful. If there is no text, write "No text detected."

2. EXPLANATION: Describe what the image shows in under 70 words. Be concise and informative. Focus on the main subject, context, and any notable details.

Always format your response EXACTLY like this:

OCR TEXT:
[extracted text or "No text detected."]

EXPLANATION:
[your description here]`
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: imageDataUrl }
              },
              {
                type: 'text',
                text: 'Analyze this image.'
              }
            ]
          }
        ]
      };

      let openaiResponse;
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
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
        console.error('OpenAI gpt-4o-mini API error response:', errorText);
        let errorMessage = 'OpenAI API request failed';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          errorMessage = errorText.substring(0, 200);
        }
        return new Response(
          JSON.stringify({ error: 'OpenAI API request failed', details: errorMessage, status: openaiResponse?.status }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const openaiData = await openaiResponse.json();
      
      if (!openaiData.choices || openaiData.choices.length === 0) {
        console.error('No choices in OpenAI response');
        return new Response(
          JSON.stringify({ error: 'Invalid response from OpenAI API' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const responseText = openaiData.choices?.[0]?.message?.content || '';
      console.log('OpenAI gpt-4o-mini response received, length:', responseText.length);

      const ocrMatch = responseText.match(/OCR TEXT:\s*([\s\S]*?)(?=\n\s*EXPLANATION:|$)/i);
      const explanationMatch = responseText.match(/EXPLANATION:\s*([\s\S]*?)$/i);

      if (ocrMatch) ocrText = ocrMatch[1].trim();
      if (explanationMatch) explanation = explanationMatch[1].trim();

      if (!ocrText && !explanation) {
        const parts = responseText.split(/\n\s*\n/);
        if (parts.length >= 2) {
          ocrText = parts[0].replace(/^OCR TEXT:\s*/i, '').trim();
          explanation = parts.slice(1).join('\n\n').replace(/^EXPLANATION:\s*/i, '').trim();
        } else {
          explanation = responseText.trim();
          ocrText = 'No text detected.';
        }
      }

      ocrText = ocrText.substring(0, 10000);
      explanation = explanation.substring(0, 2000);
    }

    const ocrTimingMs = Date.now() - nerStartTime;
    console.log(`[OCR] Timing: ${ocrTimingMs}ms`);

    console.log('Updating database with results...');
    const { error: updateError } = await supabase
      .from('recall_images')
      .update({
        ocr_text: ocrText,
        image_explanation: explanation,
        processed_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update database with OCR results', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log('=== OCR processing completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    const internalHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`,
    };
    const traceId = req.headers.get('x-trace-id') ?? req.headers.get('x-correlation-id');
    if (traceId) internalHeaders['x-trace-id'] = traceId;
    const subhost = req.headers.get('x-deno-subhost');
    if (subhost) internalHeaders['x-deno-subhost'] = subhost;

    // ===== waitUntil: match-recollection-category =====
    console.log('Triggering category matching for recall:', record.recall_id);
    // @ts-ignore - EdgeRuntime is provided by Supabase Edge Runtime
    EdgeRuntime.waitUntil((async () => {
      try {
        const matcherRes = await fetch(`${supabaseUrl}/functions/v1/match-recollection-category`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ recall_id: record.recall_id }),
        });
        if (!matcherRes.ok) {
          const txt = await matcherRes.text().catch(() => '<no body>');
          console.error('[ocr-image] matcher returned non-OK', matcherRes.status, txt);
        } else {
          const d = await matcherRes.json().catch(() => null);
          console.log('[ocr-image] matcher response:', d);
        }
      } catch (err) {
        console.error('[ocr-image] matcher invocation failed', err);
      }
    })());

    // ===== TRIGGER EMBEDDING GENERATION FOR THIS IMAGE =====
    const hasOcrText = ocrText && ocrText !== 'No text detected.' && ocrText.trim().length > 0;
    const hasExplanation = explanation && explanation.trim().length > 0;
    
    if (hasOcrText || hasExplanation) {
      try {
        console.log('Calling embedding-image function...');
        const embeddingResponse = await fetch(`${supabaseUrl}/functions/v1/embedding-image`, {
          method: 'POST',
          headers: internalHeaders,
          body: JSON.stringify({
            recall_image_id: record.id,
            ocr_text: ocrText,
            image_explanation: explanation,
          }),
        });

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          console.log('Embedding generated successfully:', embeddingData);
        } else {
          const errorText = await embeddingResponse.text();
          console.error('Failed to generate embedding:', errorText);
        }
      } catch (embeddingError) {
        console.error('Exception while generating embedding:', embeddingError);
      }
    } else {
      console.log('Skipping embedding generation - no meaningful text content');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageId: record.id,
        processingTimeMs: processingTime,
        ocrTextLength: ocrText.length,
        explanationLength: explanation.length,
        ocrTextPreview: ocrText.substring(0, 100) + (ocrText.length > 100 ? '...' : ''),
        explanationPreview: explanation.substring(0, 100) + (explanation.length > 100 ? '...' : ''),
        embeddingTriggered: hasOcrText || hasExplanation,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in OCR Image Edge Function ===');
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error', processingTimeMs: processingTime }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
