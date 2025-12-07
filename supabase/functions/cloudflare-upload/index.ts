
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
    console.log('=== Cloudflare Upload Edge Function (Optimized) ===');
    const startTime = performance.now();

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
    console.log('Base64 data length:', base64Data.length);

    // OPTIMIZATION 1: Use native base64 decoding with Uint8Array.from()
    // This is significantly faster than manual byte-by-byte conversion
    const conversionStart = performance.now();
    
    // Decode base64 to binary string
    const binaryString = atob(base64Data);
    
    // OPTIMIZED: Use Uint8Array.from() with a mapping function
    // This is much faster than a for loop for large arrays
    const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
    
    const conversionTime = performance.now() - conversionStart;
    console.log(`Base64 conversion completed in ${conversionTime.toFixed(2)}ms`);
    console.log(`Decoded ${bytes.length} bytes`);

    // OPTIMIZATION 2: Create blob directly from Uint8Array
    // No need for intermediate array operations
    const blob = new Blob([bytes], { type: contentType });
    console.log(`Blob created: ${blob.size} bytes, type: ${blob.type}`);

    // OPTIMIZATION 3: Build FormData efficiently
    const formData = new FormData();
    formData.append('file', blob, fileName);

    // OPTIMIZATION 4: Use fetch with optimized settings
    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;
    
    const uploadStart = performance.now();
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      },
      body: formData,
      // OPTIMIZATION: Set signal for timeout (30 seconds)
      signal: AbortSignal.timeout(30000),
    });

    const uploadTime = performance.now() - uploadStart;
    console.log(`Upload request completed in ${uploadTime.toFixed(2)}ms`);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudflare upload failed:', errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to upload to Cloudflare', 
          details: errorText,
          statusCode: uploadResponse.status,
        }),
        { 
          status: uploadResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload successful');

    // Extract the CDN URL from the response
    const imageId = uploadResult.result.id;
    const cdnUrl = `https://imagedelivery.net/${CLOUDFLARE_ACCOUNT_HASH}/${imageId}/public`;

    const totalTime = performance.now() - startTime;
    console.log(`Total processing time: ${totalTime.toFixed(2)}ms`);
    console.log('CDN URL:', cdnUrl);

    // OPTIMIZATION 5: Return minimal response payload
    return new Response(
      JSON.stringify({ 
        success: true, 
        cdnUrl,
        imageId,
        // Include performance metrics for monitoring
        metrics: {
          conversionTime: Math.round(conversionTime),
          uploadTime: Math.round(uploadTime),
          totalTime: Math.round(totalTime),
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Exception in cloudflare-upload:', error);
    
    // OPTIMIZATION 6: Better error handling with specific error types
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Handle specific error types
      if (error.name === 'AbortError' || error.name === 'TimeoutError') {
        errorMessage = 'Upload timeout - image may be too large';
        statusCode = 408;
      } else if (error.message.includes('base64')) {
        errorMessage = 'Invalid base64 data';
        statusCode = 400;
      }
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        type: error instanceof Error ? error.name : 'UnknownError',
      }),
      { 
        status: statusCode, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
