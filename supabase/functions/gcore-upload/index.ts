
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

    // Get storage configuration
    const storageName = Deno.env.get('GCORE_STORAGE_NAME') || 'natively-images';
    
    // Gcore Storage API uses PUT method to upload files directly to the path
    // Format: https://api.gcore.com/storage/v1/storage/{storage_name}/{path}
    const filePath = `images/${fileName}`;
    const uploadUrl = `https://api.gcore.com/storage/v1/storage/${storageName}/${filePath}`;

    console.log('Uploading to:', uploadUrl);
    console.log('Storage name:', storageName);
    console.log('File path:', filePath);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `APIKey ${gcoreApiKey}`,
        'Content-Type': contentType,
      },
      body: bytes,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Gcore upload failed:', uploadResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Gcore upload failed: ${uploadResponse.status} ${errorText}`,
          details: errorText,
          status: uploadResponse.status,
          url: uploadUrl
        }),
        {
          status: uploadResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload result:', uploadResult);

    // Construct the CDN URL
    // Gcore CDN URL format: https://{cdn-domain}/{storage_name}/{path}
    // You may need to adjust this based on your Gcore CDN configuration
    const cdnDomain = Deno.env.get('GCORE_CDN_DOMAIN') || `${storageName}.gcdn.co`;
    const cdnUrl = `https://${cdnDomain}/${filePath}`;

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
