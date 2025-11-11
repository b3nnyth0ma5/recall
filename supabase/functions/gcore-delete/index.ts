
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeleteRequest {
  cdnUrl: string;
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

    const { cdnUrl }: DeleteRequest = await req.json();

    if (!cdnUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: cdnUrl' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('=== Deleting from Gcore CDN ===');
    console.log('CDN URL:', cdnUrl);

    // Extract file path from CDN URL
    // Example: https://natively-images.gcdn.co/images/image-123.jpg
    const urlParts = new URL(cdnUrl);
    const pathParts = urlParts.pathname.split('/').filter(p => p);
    
    // The path should be everything after the domain
    // e.g., "images/image-123.jpg"
    const filePath = pathParts.join('/');
    const storageName = Deno.env.get('GCORE_STORAGE_NAME') || 'natively-images';

    console.log('Deleting file path:', filePath);
    console.log('Storage name:', storageName);

    // Delete from Gcore Storage using DELETE method
    // Format: https://api.gcore.com/storage/v1/storage/{storage_name}/{path}
    const deleteUrl = `https://api.gcore.com/storage/v1/storage/${storageName}/${filePath}`;

    console.log('Delete URL:', deleteUrl);

    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `APIKey ${gcoreApiKey}`,
      },
    });

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text();
      console.error('Gcore delete failed:', deleteResponse.status, errorText);
      
      // If file not found, consider it a success (already deleted)
      if (deleteResponse.status === 404) {
        console.log('File not found, considering delete successful');
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'File not found (already deleted)'
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete from Gcore CDN',
          details: errorText,
          status: deleteResponse.status
        }),
        {
          status: deleteResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('=== Delete successful ===');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'File deleted successfully'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Exception in gcore-delete function:', error);
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
