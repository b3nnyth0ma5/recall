
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageRecord {
  id: string;
  recall_id: string;
  image_data: string;
  content_type: string;
  user_id: string;
}

interface OpenAIVisionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== OCR Image Edge Function Started ===');

    // Get the image record from the request
    const { record } = await req.json() as { record: ImageRecord };
    
    if (!record || !record.id) {
      console.error('No record provided in request');
      return new Response(
        JSON.stringify({ error: 'No record provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Processing image:', record.id);

    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the image data from the database
    const { data: imageData, error: fetchError } = await supabase
      .from('recall_images')
      .select('image_data, content_type')
      .eq('id', record.id)
      .single();

    if (fetchError || !imageData) {
      console.error('Error fetching image data:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch image data' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Image data fetched, content type:', imageData.content_type);

    // Prepare the image for OpenAI Vision API
    const base64Image = imageData.image_data;
    const contentType = imageData.content_type || 'image/jpeg';

    // Call OpenAI Vision API
    console.log('Calling OpenAI Vision API...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please perform OCR on this image and extract all visible text. Then, provide a concise explanation of what the image shows in under 120 words. Format your response as follows:\n\nOCR TEXT:\n[extracted text here]\n\nEXPLANATION:\n[explanation here]'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${contentType};base64,${base64Image}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'OpenAI API request failed', details: errorText }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const openaiData = await openaiResponse.json() as OpenAIVisionResponse;
    const responseText = openaiData.choices[0]?.message?.content || '';

    console.log('OpenAI response received:', responseText.substring(0, 100) + '...');

    // Parse the response to extract OCR text and explanation
    let ocrText = '';
    let explanation = '';

    const ocrMatch = responseText.match(/OCR TEXT:\s*([\s\S]*?)(?=\n\nEXPLANATION:|$)/i);
    const explanationMatch = responseText.match(/EXPLANATION:\s*([\s\S]*?)$/i);

    if (ocrMatch) {
      ocrText = ocrMatch[1].trim();
    }

    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    }

    // If parsing failed, use the whole response as explanation
    if (!ocrText && !explanation) {
      explanation = responseText.trim();
    }

    console.log('Parsed OCR text length:', ocrText.length);
    console.log('Parsed explanation length:', explanation.length);

    // Update the database with OCR results
    const { error: updateError } = await supabase
      .from('recall_images')
      .update({
        ocr_text: ocrText,
        image_explanation: explanation,
        processed_at: new Date().toISOString(),
      })
      .eq('id', record.id);

    if (updateError) {
      console.error('Error updating image record:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update image record', details: updateError }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('=== OCR processing completed successfully ===');

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageId: record.id,
        ocrText: ocrText.substring(0, 100) + (ocrText.length > 100 ? '...' : ''),
        explanation: explanation.substring(0, 100) + (explanation.length > 100 ? '...' : ''),
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('=== Error in OCR Image Edge Function ===');
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
