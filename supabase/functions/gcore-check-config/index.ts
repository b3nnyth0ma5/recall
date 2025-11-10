
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const gcoreApiKey = Deno.env.get('GCORE_API_KEY');
    const configured = !!gcoreApiKey;

    console.log('Gcore CDN configuration check:', configured ? 'Configured' : 'Not configured');

    return new Response(
      JSON.stringify({ 
        configured,
        message: configured 
          ? 'Gcore CDN is properly configured' 
          : 'GCORE_API_KEY environment variable is not set'
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Exception in gcore-check-config function:', error);
    return new Response(
      JSON.stringify({ 
        configured: false,
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
