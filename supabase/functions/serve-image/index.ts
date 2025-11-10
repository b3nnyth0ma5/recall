
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImageRecord {
  id: string;
  image_data: string;
  content_type: string;
  user_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const imageId = url.searchParams.get('id');
    const width = url.searchParams.get('width');
    const height = url.searchParams.get('height');
    const quality = url.searchParams.get('quality') || '85';

    if (!imageId) {
      return new Response(
        JSON.stringify({ error: 'Image ID is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Fetch image from database
    const { data, error } = await supabaseClient
      .from('recall_images')
      .select('image_data, content_type')
      .eq('id', imageId)
      .single();

    if (error || !data) {
      console.error('Error fetching image:', error);
      return new Response(
        JSON.stringify({ error: 'Image not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const imageRecord = data as ImageRecord;

    // Convert base64 to binary
    const binaryString = atob(imageRecord.image_data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Set aggressive caching headers for CDN
    const cacheHeaders = {
      ...corsHeaders,
      'Content-Type': imageRecord.content_type || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      'ETag': imageId, // Use image ID as ETag for cache validation
      'Vary': 'Accept-Encoding',
    };

    // Check if client has cached version
    const ifNoneMatch = req.headers.get('If-None-Match');
    if (ifNoneMatch === imageId) {
      return new Response(null, {
        status: 304,
        headers: cacheHeaders,
      });
    }

    // Return the image with caching headers
    return new Response(bytes, {
      status: 200,
      headers: cacheHeaders,
    });
  } catch (error) {
    console.error('Exception in serve-image function:', error);
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
