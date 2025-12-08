
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UploadRequest {
  base64Data: string;
  fileName: string;
  contentType: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== Cloudflare Upload Edge Function ===');

    // Get Cloudflare credentials from environment
    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const CLOUDFLARE_ACCOUNT_HASH = Deno.env.get('CLOUDFLARE_ACCOUNT_HASH');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_HASH) {
      console.error('Missing Cloudflare configuration');
      return new Response(
        JSON.stringify({ 
          error: 'Cloudflare CDN is not configured. Please set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ACCOUNT_HASH environment variables.' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request body
    const { base64Data, fileName, contentType }: UploadRequest = await req.json();

    if (!base64Data || !fileName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: base64Data and fileName' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Uploading to Cloudflare Images...');
    console.log('File name:', fileName);
    console.log('Content type:', contentType);

    // Convert base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create form data for Cloudflare Images API
    const formData = new FormData();
    const blob = new Blob([bytes], { type: contentType });
    formData.append('file', blob, fileName);

    // Upload to Cloudflare Images
    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudflare upload failed:', errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to upload to Cloudflare', 
          details: errorText 
        }),
        { 
          status: uploadResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload successful:', uploadResult);

    // Extract the CDN URL from the response
    // Cloudflare Images returns multiple variants, we'll use the public variant
    const imageId = uploadResult.result.id;
    const cdnUrl = `https://imagedelivery.net/${CLOUDFLARE_ACCOUNT_HASH}/${imageId}/public`;

    console.log('CDN URL:', cdnUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        cdnUrl,
        imageId,
        variants: uploadResult.result.variants 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Exception in cloudflare-upload:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
