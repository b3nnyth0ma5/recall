
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

interface OpenAIVisionResponse {
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
 * Enhanced OCR and Image Explanation Edge Function
 * 
 * This function:
 * 1. Receives an image record ID from a database webhook or manual trigger
 * 2. Fetches the image CDN URL from the recall_images table
 * 3. Sends the image to OpenAI's Vision API (gpt-4o-mini) for OCR and explanation
 * 4. Parses the response to extract OCR text and explanation separately
 * 5. Updates the database with the results
 * 6. Calls the embedding-image function to generate embeddings for the image
 * 
 * Features:
 * - Robust error handling with detailed logging
 * - Cost-optimized using gpt-4o-mini model
 * - Structured prompt for consistent response format
 * - Automatic retry logic for transient failures
 * - Comprehensive validation and sanitization
 * - Triggers embedding generation after OCR completion
 */

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== OCR Image Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Parse and validate request body
    let requestBody;
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

    const { record } = requestBody as { record: ImageRecord };
    
    if (!record || !record.id) {
      console.error('No record or record.id provided in request');
      return new Response(
        JSON.stringify({ error: 'Missing required field: record.id' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Processing image ID:', record.id);
    console.log('Recall ID:', record.recall_id);

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

    // Fetch the image CDN URL from the database
    console.log('Fetching image CDN URL from database...');
    const { data: imageData, error: fetchError } = await supabase
      .from('recall_images')
      .select('cdn_url, content_type, user_id')
      .eq('id', record.id)
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
      console.error('No image data found for ID:', record.id);
      return new Response(
        JSON.stringify({ error: 'Image data not found in database' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Image data fetched successfully');
    console.log('Content type:', imageData.content_type);
    console.log('Has CDN URL:', !!imageData.cdn_url);
    console.log('User ID:', imageData.user_id);

    // Check if we have a CDN URL
    if (!imageData.cdn_url) {
      console.error('No CDN URL found for ID:', record.id);
      return new Response(
        JSON.stringify({ error: 'Image CDN URL not found in database' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Using CDN URL for OCR processing:', imageData.cdn_url);
    const imageDataUrl = imageData.cdn_url;

    // Call OpenAI Vision API with enhanced prompt
    console.log('Calling OpenAI Vision API...');
    console.log('Model: gpt-4o-mini');
    console.log('Max tokens: 500');

    const openaiRequestBody = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image and provide two things:

1. OCR TEXT: Extract ALL visible text from the image. If there is no text, write "No text detected."

2. EXPLANATION: Describe what the image shows in under 70 words. Be concise and informative.

Format your response EXACTLY like this:

OCR TEXT:
[extracted text or "No text detected."]

EXPLANATION:
[your description here]`
            },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more consistent results
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

    const openaiData = await openaiResponse.json() as OpenAIVisionResponse;
    
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
    console.log('Response length:', responseText.length);
    if (openaiData.usage) {
      console.log('Token usage:', JSON.stringify(openaiData.usage));
    }

    // Parse the response to extract OCR text and explanation
    let ocrText = '';
    let explanation = '';

    // Enhanced parsing with multiple fallback strategies
    const ocrMatch = responseText.match(/OCR TEXT:\s*([\s\S]*?)(?=\n\s*EXPLANATION:|$)/i);
    const explanationMatch = responseText.match(/EXPLANATION:\s*([\s\S]*?)$/i);

    if (ocrMatch) {
      ocrText = ocrMatch[1].trim();
      console.log('Extracted OCR text (length):', ocrText.length);
    } else {
      console.warn('Could not parse OCR TEXT section');
    }

    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
      console.log('Extracted explanation (length):', explanation.length);
    } else {
      console.warn('Could not parse EXPLANATION section');
    }

    // Fallback: if parsing completely failed, try alternative format
    if (!ocrText && !explanation) {
      console.log('Primary parsing failed, attempting fallback parsing...');
      
      // Try splitting by double newline
      const parts = responseText.split(/\n\s*\n/);
      if (parts.length >= 2) {
        ocrText = parts[0].replace(/^OCR TEXT:\s*/i, '').trim();
        explanation = parts.slice(1).join('\n\n').replace(/^EXPLANATION:\s*/i, '').trim();
        console.log('Fallback parsing successful');
      } else {
        // Last resort: use entire response as explanation
        console.log('All parsing failed, using entire response as explanation');
        explanation = responseText.trim();
        ocrText = 'No text detected.';
      }
    }

    // Sanitize and validate results
    ocrText = ocrText.substring(0, 10000); // Limit to 10k chars
    explanation = explanation.substring(0, 2000); // Limit to 2k chars

    console.log('Final OCR text length:', ocrText.length);
    console.log('Final explanation length:', explanation.length);

    // Update the database with OCR results
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
        JSON.stringify({ 
          error: 'Failed to update database with OCR results', 
          details: updateError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log('=== OCR processing completed successfully ===');
    console.log('Total processing time:', processingTime, 'ms');

    // Trigger category matching for this recall
    console.log('Triggering category matching for recall:', record.recall_id);
    try {
      const categoryMatchResponse = await fetch(`${supabaseUrl}/functions/v1/match-recollection-category`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ recallId: record.recall_id }),
      });

      if (categoryMatchResponse.ok) {
        const categoryMatchData = await categoryMatchResponse.json();
        console.log('Category matching triggered successfully:', categoryMatchData);
      } else {
        const errorText = await categoryMatchResponse.text();
        console.error('Failed to trigger category matching:', errorText);
      }
    } catch (categoryError) {
      console.error('Exception while triggering category matching:', categoryError);
      // Don't fail the OCR process if category matching fails
    }

    // ===== TRIGGER EMBEDDING GENERATION FOR THIS IMAGE =====
    // This happens at the end, after OCR processing is complete
    console.log('=== Triggering embedding generation for image ===');
    console.log('Image ID:', record.id);
    
    // Only trigger embedding if we have both OCR text and explanation
    if (ocrText && explanation && ocrText !== 'No text detected.') {
      try {
        console.log('Calling embedding-image function...');
        const embeddingResponse = await fetch(`${supabaseUrl}/functions/v1/embedding-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
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
          // Don't fail the OCR process if embedding generation fails
        }
      } catch (embeddingError) {
        console.error('Exception while generating embedding:', embeddingError);
        // Don't fail the OCR process if embedding generation fails
      }
    } else {
      console.log('Skipping embedding generation - no meaningful text content');
    }
    
    console.log('=== Embedding generation triggered ===');

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageId: record.id,
        processingTimeMs: processingTime,
        ocrTextLength: ocrText.length,
        explanationLength: explanation.length,
        ocrTextPreview: ocrText.substring(0, 100) + (ocrText.length > 100 ? '...' : ''),
        explanationPreview: explanation.substring(0, 100) + (explanation.length > 100 ? '...' : ''),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in OCR Image Edge Function ===');
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
