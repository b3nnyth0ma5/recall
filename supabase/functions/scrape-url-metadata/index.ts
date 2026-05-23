NEW

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAX_BYTES = 256 * 1024; // 256 KB cap
const FETCH_TIMEOUT_MS = 6000;
const MAX_FIELD_LENGTH = 1000;
const MAX_IMAGE_URL_LENGTH = 2000;

// ---------------------------------------------------------------------------
// YouTube helpers
// ---------------------------------------------------------------------------

function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www\.|m\.)/, '');

    // youtu.be/<id>
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id || null;
    }

    if (host === 'youtube.com') {
      // /watch?v=<id>
      const v = u.searchParams.get('v');
      if (v) return v;

      // /shorts/<id>  or  /embed/<id>  or  /v/<id>
      const parts = u.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'v'].includes(parts[0]) && parts[1]) {
        return parts[1];
      }
    }
  } catch {
    // invalid URL — fall through
  }
  return null;
}

function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^(www\.|m\.)/, '');
    return host === 'youtube.com' || host === 'youtu.be';
  } catch {
    return false;
  }
}

interface YouTubeResult {
  og_title: string | undefined;
  og_description: string | undefined;
  og_site_name: string;
  og_image_url: string | null;
}

// Tier 1: YouTube Data API v3
async function fetchYouTubeDataAPI(
  videoId: string,
  apiKey: string
): Promise<YouTubeResult | null> {
  console.log(`[YouTube API] Calling for video ${videoId}`);
  try {
    const apiUrl =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[YouTube API] HTTP ${res.status} — falling through to oEmbed`);
      return null;
    }

    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      console.warn(`[YouTube API] No items found for video ${videoId}`);
      return null;
    }

    const snippet = data.items[0].snippet;

    // Pick the highest-resolution thumbnail available
    const thumbPriority = ['standard', 'high', 'medium', 'default'];
    let og_image_url: string | null = null;
    for (const key of thumbPriority) {
      const thumb = snippet.thumbnails?.[key]?.url;
      if (thumb && thumb.length <= MAX_IMAGE_URL_LENGTH) {
        og_image_url = thumb;
        break;
      }
    }

    console.log(`[YouTube API] Success for video ${videoId}`);
    return {
      og_title: snippet.title ? snippet.title.substring(0, MAX_FIELD_LENGTH) : undefined,
      og_description: snippet.description
        ? snippet.description.substring(0, MAX_FIELD_LENGTH)
        : undefined,
      og_site_name: 'YouTube',
      og_image_url,
    };
  } catch (err) {
    console.warn(`[YouTube API] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// Tier 2: YouTube oEmbed
async function fetchYouTubeOEmbed(url: string): Promise<YouTubeResult | null> {
  console.log(`[YouTube oEmbed] Calling for ${url}`);
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(oEmbedUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[YouTube oEmbed] HTTP ${res.status} — falling through to HTML scrape`);
      return null;
    }

    const data = await res.json();

    const og_image_url =
      data.thumbnail_url && data.thumbnail_url.length <= MAX_IMAGE_URL_LENGTH
        ? data.thumbnail_url
        : null;

    console.log(`[YouTube oEmbed] Success`);
    return {
      og_title: data.title ? String(data.title).substring(0, MAX_FIELD_LENGTH) : undefined,
      // oEmbed has no description field — use author_name as a fallback signal
      og_description: data.author_name
        ? String(data.author_name).substring(0, MAX_FIELD_LENGTH)
        : undefined,
      og_site_name: 'YouTube',
      og_image_url,
    };
  } catch (err) {
    console.warn(`[YouTube oEmbed] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generic HTML scrape helpers (unchanged from v7)
// ---------------------------------------------------------------------------

function extractMetaContent(html: string, property: string): string | undefined {
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
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => {
      try {
        const code = parseInt(hex, 16);
        return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : _;
      } catch { return _; }
    })
    .replace(/&#([0-9]{1,7});/g, (_, dec) => {
      try {
        const code = parseInt(dec, 10);
        return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : _;
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
  let resolved = decoded;
  try {
    resolved = new URL(decoded, sourceUrl).href;
  } catch {
    resolved = decoded;
  }
  if (!resolved.startsWith('http://') && !resolved.startsWith('https://')) return null;
  if (resolved.length > MAX_IMAGE_URL_LENGTH) return null;
  return resolved;
}

// Tier 3: HTML scrape (generic, unchanged logic)
async function scrapeHtml(url: string): Promise<{
  og_title: string | undefined;
  og_description: string | undefined;
  og_site_name: string | undefined;
  og_image_url: string | null;
  fetchOk: boolean;
  fetchStatus?: number;
  fetchError?: string;
}> {
  console.log(`[HTML scrape] Calling for ${url}`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
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

    const fetchStatus = response.status;
    console.log('[HTML scrape] Fetch response status:', fetchStatus);

    if (!response.ok) {
      return { og_title: undefined, og_description: undefined, og_site_name: undefined, og_image_url: null, fetchOk: false, fetchStatus };
    }

    let html = '';
    const reader = response.body?.getReader();
    if (reader) {
      let bytesRead = 0;
      const decoder = new TextDecoder();
      while (bytesRead < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        bytesRead += value.byteLength;
        if (html.toLowerCase().includes('</head>')) break;
      }
      reader.cancel();
    }
    console.log('[HTML scrape] HTML read, length:', html.length, 'bytes');

    const og_title = cleanField(extractMetaContent(html, 'og:title') ?? extractTitle(html));
    const og_description = cleanField(
      extractMetaContent(html, 'og:description') ?? extractMetaContent(html, 'description')
    );

    const rawSiteName = extractMetaContent(html, 'og:site_name');
    let og_site_name: string | undefined;
    if (rawSiteName) {
      og_site_name = cleanField(rawSiteName);
    } else {
      try {
        og_site_name = new URL(url).hostname.replace(/^www\./, '') || undefined;
      } catch {
        og_site_name = undefined;
      }
    }

    const rawOgImage = extractMetaContent(html, 'og:image');
    const og_image_url = rawOgImage ? resolveOgImageUrl(rawOgImage, url) : null;

    return { og_title, og_description, og_site_name, og_image_url, fetchOk: true, fetchStatus };
  } catch (err) {
    clearTimeout(timeoutId);
    const fetchError = err instanceof Error ? err.message : String(err);
    console.warn('[HTML scrape] Fetch failed:', fetchError);
    return { og_title: undefined, og_description: undefined, og_site_name: undefined, og_image_url: null, fetchOk: false, fetchError };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('=== Scrape URL Metadata Edge Function Started ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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

    // -----------------------------------------------------------------------
    // Metadata extraction — YouTube waterfall or generic HTML scrape
    // -----------------------------------------------------------------------

    let og_title: string | undefined;
    let og_description: string | undefined;
    let og_site_name: string | undefined;
    let og_image_url: string | null = null;
    let fetchOk = true; // assume ok unless HTML scrape fails

    if (isYouTubeUrl(row.url)) {
      const videoId = extractYouTubeVideoId(row.url);
      console.log(`Detected YouTube URL ${row.url}, video ID: ${videoId}`);

      let result: YouTubeResult | null = null;

      // Tier 1: YouTube Data API v3
      const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
      if (apiKey && videoId) {
        result = await fetchYouTubeDataAPI(videoId, apiKey);
      } else if (!apiKey) {
        console.warn('[YouTube API] GOOGLE_PLACES_API_KEY not set — skipping to oEmbed');
      } else if (!videoId) {
        console.warn('[YouTube API] Could not extract video ID — skipping to oEmbed');
      }

      // Tier 2: oEmbed
      if (!result) {
        result = await fetchYouTubeOEmbed(row.url);
      }

      // Tier 3: HTML scrape
      if (!result) {
        console.log('[YouTube] Both API and oEmbed failed — falling back to HTML scrape');
        const scraped = await scrapeHtml(row.url);
        fetchOk = scraped.fetchOk;
        if (!scraped.fetchOk) {
          // Stamp scraped_at to prevent retry storms
          await supabase
            .from('recall_urls')
            .update({ scraped_at: new Date().toISOString() })
            .eq('id', recall_url_id);
          const reason = scraped.fetchError ? 'fetch_failed' : 'http_error';
          return new Response(
            JSON.stringify({ success: false, scraped: false, reason, status: scraped.fetchStatus, error: scraped.fetchError }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        og_title = scraped.og_title;
        og_description = scraped.og_description;
        og_site_name = scraped.og_site_name;
        og_image_url = scraped.og_image_url;
      } else {
        og_title = result.og_title;
        og_description = result.og_description;
        og_site_name = result.og_site_name;
        og_image_url = result.og_image_url;
      }

    } else {
      // Non-YouTube: generic HTML scrape only
      const scraped = await scrapeHtml(row.url);
      fetchOk = scraped.fetchOk;

      if (!scraped.fetchOk) {
        await supabase
          .from('recall_urls')
          .update({ scraped_at: new Date().toISOString() })
          .eq('id', recall_url_id);
        const reason = scraped.fetchError ? 'fetch_failed' : 'http_error';
        return new Response(
          JSON.stringify({ success: false, scraped: false, reason, status: scraped.fetchStatus, error: scraped.fetchError }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      og_title = scraped.og_title;
      og_description = scraped.og_description;
      og_site_name = scraped.og_site_name;
      og_image_url = scraped.og_image_url;
    }

    console.log('Final og_title:', og_title);
    console.log('Final og_description:', og_description?.substring(0, 80));
    console.log('Final og_site_name:', og_site_name);
    console.log('Final og_image_url:', og_image_url);

    // -----------------------------------------------------------------------
    // Build url_data for embeddings
    // -----------------------------------------------------------------------

    let url_data: string | null = row.url_data ?? null;
    if (og_title && og_description) {
      url_data = `${og_title}\n\n${og_description}`;
    } else if (og_title) {
      url_data = og_title;
    } else if (og_description) {
      url_data = og_description;
    }

    console.log('url_data length:', url_data?.length ?? 0);

    // -----------------------------------------------------------------------
    // DB update — coalesce semantics, scraped_at always written
    // -----------------------------------------------------------------------

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
    } else {
      console.log('DB updated successfully');
    }

    // Chain to embedding-url (fire and forget)
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
