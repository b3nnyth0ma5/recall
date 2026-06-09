/**
 * embed-category Edge Function v1
 *
 * Generates a 1536-dim embedding for a recollection category using
 * OpenAI text-embedding-3-small and writes it to:
 *   recollection_categories.category_embedding
 *   recollection_categories.category_embedding_updated_at
 *
 * Body: { category_id: string } or { categoryId: string }
 * verify_jwt = false (called from pg_net trigger and match-recollection-category)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== embed-category Edge Function Started (v1) ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const categoryId: string | undefined = body.category_id || body.categoryId;

    if (!categoryId) {
      console.error('No category_id provided in request');
      return new Response(
        JSON.stringify({ error: 'Missing required field: category_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing category_id:', categoryId);

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

    // Fetch category name + description
    const { data: categoryData, error: fetchError } = await supabase
      .from('recollection_categories')
      .select('id, category_name, category_search_description')
      .eq('id', categoryId)
      .single();

    if (fetchError) {
      console.error('Database fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch category data', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!categoryData) {
      console.error('No category found for ID:', categoryId);
      return new Response(
        JSON.stringify({ error: 'Category not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const categoryName = categoryData.category_name || '';
    const categoryDescription = categoryData.category_search_description || '';
    const inputText = `${categoryName}. ${categoryDescription}`.trim();

    if (!inputText) {
      console.warn('Category has empty name and description, nothing to embed');
      return new Response(
        JSON.stringify({ error: 'Category has no text to embed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Input text:', inputText.substring(0, 100));

    // Call OpenAI Embeddings API
    console.log('Calling OpenAI Embeddings API (text-embedding-3-small)...');
    const openaiResp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: inputText,
        encoding_format: 'base64',
      }),
    });

    if (!openaiResp.ok) {
      const errorText = await openaiResp.text();
      console.error('OpenAI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'OpenAI API request failed', details: errorText.substring(0, 200) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openaiData = await openaiResp.json();

    if (!openaiData.data || openaiData.data.length === 0) {
      console.error('No data in OpenAI response');
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI API' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const embeddingBase64: string = openaiData.data[0].embedding;

    // Decode base64 to float32 array
    const binaryString = atob(embeddingBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const float32Array = new Float32Array(bytes.buffer);
    const embeddingArray = Array.from(float32Array);

    console.log('Embedding dimensions:', embeddingArray.length);

    // Write embedding to recollection_categories
    const { error: updateError } = await supabase
      .from('recollection_categories')
      .update({
        category_embedding: embeddingArray,
        category_embedding_updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId);

    if (updateError) {
      console.error('Database update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update category embedding', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processingTime = Date.now() - startTime;
    console.log('=== embed-category completed successfully ===');
    console.log('Processing time:', processingTime, 'ms');

    return new Response(
      JSON.stringify({
        success: true,
        category_id: categoryId,
        embeddingDimensions: embeddingArray.length,
        processingTimeMs: processingTime,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in embed-category Edge Function ===');
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Processing time before error:', processingTime, 'ms');

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingTime,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
