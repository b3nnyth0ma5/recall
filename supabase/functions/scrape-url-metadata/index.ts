import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAX_BYTES = 256 * 1024; // 256 KB cap
const FETCH_TIMEOUT_MS = 6000;
const MAX_FIELD_LENGTH = 500;
const MAX_IMAGE_URL_LENGTH = 2000;

function extractMetaContent(html: string, property: string): string | undefined {
  // Try property/name attribute first, then reversed attribute order
  const patterns = [
    new RegExp(`<meta\\s+(?:property|name)=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1];
}

function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  return text
    // Named entities — keep the existing 6 plus add common extras
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&hellip;/g, '\u2026')
    // Hex numeric: &#x...; — supports all Unicode including emojis (up to 6 hex digits)
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => {
      try {
        const code = parseInt(hex, 16);
        if (code > 0 && code <= 0x10FFFF) {
          return String.fromCodePoint(code);
        }
        return _;
      } catch { return _; }
    })
    // Decimal numeric: &#NNN; (up to 7 digits)
    .replace(/&#([0-9]{1,7});/g, (_, dec) => {
      try {
        const code = parseInt(dec, 10);
        if (code > 0 && code <= 0x10FFFF) {
          return String.fromCodePoint(code);
        }
        return _;
      } catch { return _; }
    });
}

function cleanField(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const decoded = decodeHtmlEntities(value).trim();
  if (!decoded) return undefined;
  return decoded.substring(0, MAX_FIELD_LENGTH);
}

function resolveOgImageUrl(rawValue: string, sourceUrl: string): string | null {
  const decoded = decodeHtmlEntities(rawValue).trim();
  if (!decoded) return null;

  // Resolve relative URLs against the source URL
  let resolved = decoded;
  try {
    resolved = new URL(decoded, sourceUrl).href;
  } catch {
    // If resolution fails, fall back to raw value
    resolved = decoded;
  }

  // Must start with http:// or https://
  if (!resolved.startsWith('http://') && !resolved.startsWith('https://')) {
    return null;
  }

  // Cap at 2000 chars
  if (resolved.length > MAX_IMAGE_URL_LENGTH) {
    return null;
  }

  return resolved;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== Scrape URL Metadata Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Parse request
    let body: { recall_url_id?: string; force?: boolean };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { recall_url_id, force } = body;
    if (!recall_url_id || typeof recall_url_id !== 'string' || recall_url_id.trim() === '') {
      console.error('Missing or empty recall_url_id');
      return new Response(
        JSON.stringify({ error: 'Missing required field: recall_url_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing recall_url_id:', recall_url_id);
    console.log('Force re-scrape:', !!force);

    // Init service-role Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch the row — include scraped_at for idempotency check
    const { data: row, error: fetchRowError } = await supabase
      .from('recall_urls')
      .select('id, url, og_title, url_data, scraped_at')
      .eq('id', recall_url_id)
      .single();

    if (fetchRowError || !row) {
      console.error('Row not found:', fetchRowError?.message);
      return new Response(
        JSON.stringify({ error: 'recall_url not found', details: fetchRowError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Row found. URL:', row.url);
    console.log('Existing scraped_at:', row.scraped_at);

    // Idempotency: if scraped_at already set and force is not true, skip scraping
    if (row.scraped_at && !force) {
      console.log('scraped_at already present — skipping scrape, chaining to embedding-url if applicable');
      if (row.url_data) {
        supabase.functions.invoke('embedding-url', { body: { recall_url_id } }).catch(() => {});
      }
      return new Response(
        JSON.stringify({ success: true, scraped: false, reason: 'already_scraped' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the URL HTML with mobile UA and 6s timeout
    console.log('Fetching URL:', row.url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let html = '';
    let fetchOk = false;
    let fetchStatus: number | undefined;

    try {
      const response = await fetch(row.url, {
        method: 'GET',
        headers: {
          'User-Agent': MOBILE_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      fetchStatus = response.status;
      console.log('Fetch response status:', fetchStatus);

      if (!response.ok) {
        console.warn('Non-2xx response from target site:', fetchStatus);
        // Stamp scraped_at even on HTTP error so we don't retry dead URLs
        await supabase
          .from('recall_urls')
          .update({ scraped_at: new Date().toISOString() })
          .eq('id', recall_url_id);
        return new Response(
          JSON.stringify({ success: false, scraped: false, reason: 'http_error', status: fetchStatus }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Read up to MAX_BYTES
      const reader = response.body?.getReader();
      if (reader) {
        let bytesRead = 0;
        const decoder = new TextDecoder();
        while (bytesRead < MAX_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          bytesRead += value.byteLength;
          // Stop early once we've passed </head> — OG tags are always in <head>
          if (html.toLowerCase().includes('</head>')) break;
        }
        reader.cancel();
      }
      fetchOk = true;
      console.log('HTML read, length:', html.length, 'bytes');
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Fetch failed:', msg);
      // Stamp scraped_at even on fetch failure so we don't retry dead URLs
      await supabase
        .from('recall_urls')
        .update({ scraped_at: new Date().toISOString() })
        .eq('id', recall_url_id);
      return new Response(
        JSON.stringify({ success: false, scraped: false, reason: 'fetch_failed', error: msg }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse OG metadata
    let og_title: string | undefined;
    let og_description: string | undefined;
    let og_site_name: string | undefined;
    let og_image_url: string | null = null;

    if (fetchOk && html) {
      // og:title with fallback to <title>
      og_title = cleanField(extractMetaContent(html, 'og:title') ?? extractTitle(html));
      // og:description with fallback to meta description
      og_description = cleanField(
        extractMetaContent(html, 'og:description') ??
        extractMetaContent(html, 'description')
      );
      // og:site_name with fallback to hostname
      const rawSiteName = extractMetaContent(html, 'og:site_name');
      if (rawSiteName) {
        og_site_name = cleanField(rawSiteName);
      } else {
        try {
          const hostname = new URL(row.url).hostname.replace(/^www\./, '');
          og_site_name = hostname || undefined;
        } catch {
          og_site_name = undefined;
        }
      }
      // og:image — resolve relative URLs, validate scheme, cap length
      const rawOgImage = extractMetaContent(html, 'og:image');
      if (rawOgImage) {
        og_image_url = resolveOgImageUrl(rawOgImage, row.url);
        console.log('Parsed og_image_url:', og_image_url);
      }
    } else {
      // Fetch succeeded but no HTML — derive site_name from hostname
      try {
        og_site_name = new URL(row.url).hostname.replace(/^www\./, '') || undefined;
      } catch {
        og_site_name = undefined;
      }
    }

    console.log('Parsed og_title:', og_title);
    console.log('Parsed og_description:', og_description?.substring(0, 80));
    console.log('Parsed og_site_name:', og_site_name);

    // Build url_data
    let url_data: string | null = row.url_data ?? null;
    if (og_title && og_description) {
      url_data = `${og_title}\n\n${og_description}`;
    } else if (og_title) {
      url_data = og_title;
    } else if (og_description) {
      url_data = og_description;
    }
    // If neither, leave url_data as existing value (don't overwrite with empty)

    console.log('url_data length:', url_data?.length ?? 0);

    // Build update payload — coalesce semantics: never overwrite non-null with null
    // scraped_at is ALWAYS set unconditionally
    const updatePayload: Record<string, string | null> = {
      scraped_at: new Date().toISOString(),
    };
    if (og_title !== undefined) updatePayload.og_title = og_title;
    if (og_description !== undefined) updatePayload.og_description = og_description;
    if (og_site_name !== undefined) updatePayload.og_site_name = og_site_name;
    if (og_image_url !== null) updatePayload.og_image_url = og_image_url;
    if (url_data !== null) updatePayload.url_data = url_data;

    const { error: updateError } = await supabase
      .from('recall_urls')
      .update(updatePayload)
      .eq('id', recall_url_id);

    if (updateError) {
      console.error('DB update error:', updateError.message);
      // Don't fail the whole request — return partial success
    } else {
      console.log('DB updated successfully');
    }

    // Chain to embedding-url (fire and forget) — only if url_data is non-empty
    const embedding_triggered = !!(url_data);
    if (embedding_triggered) {
      console.log('Chaining to embedding-url (fire-and-forget)...');
      supabase.functions.invoke('embedding-url', { body: { recall_url_id } }).catch(() => {});
    } else {
      console.log('No url_data — skipping embedding chain');
    }

    const processingTime = Date.now() - startTime;
    console.log('=== Scrape URL Metadata completed ===');
    console.log('Total processing time:', processingTime, 'ms');

    const parsed = !!(og_title || og_description || og_site_name);
    return new Response(
      JSON.stringify({
        success: true,
        scraped: true,
        parsed,
        og_title: og_title ?? null,
        og_description: og_description ?? null,
        og_site_name: og_site_name ?? null,
        og_image_url: og_image_url ?? null,
        embedding_triggered,
        processingTimeMs: processingTime,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Unhandled error in scrape-url-metadata ===');
    console.error('Error:', error instanceof Error ? error.message : String(error));
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
