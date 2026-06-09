/**
 * category-matching-sweeper Edge Function
 *
 * Periodic sweeper that finds recalls with NULL category_matched_at
 * (i.e. category matching was never completed or was skipped) and
 * re-triggers match-recollection-category for each one.
 *
 * Intended to be called on a schedule (e.g. every 5 minutes via pg_cron
 * or an external cron job) to catch any recalls that slipped through.
 *
 * Safety:
 * - Only processes recalls where category_matched_at IS NULL
 * - Skips recalls where category_matching_at was set within the last 30s
 *   (those are already in-flight, handled by the idempotency guard in
 *   match-recollection-category)
 * - Processes at most `batchSize` recalls per invocation (default 20)
 * - Fire-and-forget: triggers match-recollection-category without waiting
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
  console.log('=== category-matching-sweeper Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: Supabase credentials missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse optional batchSize from request body
    let batchSize = 20;
    try {
      const body = await req.json();
      if (body?.batchSize && typeof body.batchSize === 'number') {
        batchSize = Math.min(body.batchSize, 100); // cap at 100
      }
    } catch {
      // No body or invalid JSON — use default batchSize
    }

    console.log('Batch size:', batchSize);

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Find recalls with NULL category_matched_at, excluding those currently in-flight
    // (category_matching_at set within the last 30 seconds)
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();

    const { data: recalls, error: fetchError } = await supabase
      .from('recalls')
      .select('id, category_matching_at, category_matched_at, category_match_attempts')
      .is('category_matched_at', null)
      .lt('category_match_attempts', 5)
      .or(`category_matching_at.is.null,category_matching_at.lt.${thirtySecondsAgo}`)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      console.error('Error fetching recalls to sweep:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch recalls', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!recalls || recalls.length === 0) {
      console.log('No recalls need category matching sweep');
      const processingTime = Date.now() - startTime;
      return new Response(
        JSON.stringify({
          success: true,
          swept: 0,
          message: 'No recalls need sweeping',
          processingTimeMs: processingTime,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${recalls.length} recalls to sweep`);

    // Fire-and-forget match-recollection-category for each recall
    let triggered = 0;
    const errors: string[] = [];

    for (const recall of recalls) {
      try {
        console.log(`Triggering match-recollection-category for recall: ${recall.id}`);
        fetch(`${supabaseUrl}/functions/v1/match-recollection-category`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ recallId: recall.id }),
        })
          .then(async (response) => {
            if (response.ok) {
              const data = await response.json();
              console.log(`[sweeper] match-recollection-category OK for ${recall.id}:`, data?.matchCount ?? 'n/a', 'matches');
            } else {
              const errorText = await response.text();
              console.error(`[sweeper] match-recollection-category failed for ${recall.id}:`, errorText);
            }
          })
          .catch((err) => {
            console.error(`[sweeper] Exception triggering match-recollection-category for ${recall.id}:`, err);
          });
        triggered++;
      } catch (err) {
        const msg = `Failed to trigger for ${recall.id}: ${(err as any)?.message}`;
        console.error('[sweeper]', msg);
        errors.push(msg);
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`=== category-matching-sweeper complete: triggered ${triggered}/${recalls.length} ===`);
    console.log('Processing time:', processingTime, 'ms');

    return new Response(
      JSON.stringify({
        success: true,
        swept: triggered,
        total: recalls.length,
        errors: errors.length > 0 ? errors : undefined,
        processingTimeMs: processingTime,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in category-matching-sweeper ===');
    console.error('Error type:', (error as any)?.constructor?.name);
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
