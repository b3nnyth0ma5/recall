
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
    const gcoreApiKey = Deno.env.get('GCORE_API_KEY');
    
    if (!gcoreApiKey) {
      console.error('GCORE_API_KEY environment variable is not set');
      return new Response(
        JSON.stringify({ 
          error: 'Gcore CDN is not configured. Please set GCORE_API_KEY environment variable.' 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { base64Data, fileName, contentType }: UploadRequest = await req.json();

    if (!base64Data || !fileName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: base64Data, fileName' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('=== Uploading to Gcore CDN ===');
    console.log('File name:', fileName);
    console.log('Content type:', contentType);

    // Convert base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create form data for upload
    const formData = new FormData();
    const blob = new Blob([bytes], { type: contentType });
    formData.append('file', blob, fileName);

    // Upload to Gcore Storage
    // Note: You'll need to adjust the storage name and path as per your Gcore setup
    const storageName = Deno.env.get('GCORE_STORAGE_NAME') || 'natively-images';
    const uploadUrl = `https://api.gcore.com/storage/v1/storage/${storageName}/upload`;

    console.log('Uploading to:', uploadUrl);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `APIKey ${gcoreApiKey}`,
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Gcore upload failed:', uploadResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to upload to Gcore CDN',
          details: errorText,
          status: uploadResponse.status
        }),
        {
          status: uploadResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload result:', uploadResult);

    // Extract CDN URL from response
    // The exact structure depends on Gcore's API response
    // Adjust this based on actual Gcore API response format
    const cdnUrl = uploadResult.url || uploadResult.cdn_url || uploadResult.file_url;

    if (!cdnUrl) {
      console.error('No CDN URL in Gcore response:', uploadResult);
      return new Response(
        JSON.stringify({ 
          error: 'No CDN URL returned from Gcore',
          response: uploadResult
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('=== Upload successful ===');
    console.log('CDN URL:', cdnUrl);

    return new Response(
      JSON.stringify({ 
        success: true,
        cdnUrl,
        fileName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Exception in gcore-upload function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
