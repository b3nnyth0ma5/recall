/**
 * Client-side og:image scraper
 * Best-effort, never throws. Results are cached in memory for 24 hours.
 */

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const BLOCKED_HOSTS = [
  'instagram.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'tiktok.com',
];

function isBlockedHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return BLOCKED_HOSTS.some(blocked => hostname.includes(blocked));
  } catch {
    return false;
  }
}

function setCached(url: string, value: string | null): void {
  cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCached(url: string): string | null | undefined {
  const entry = cache.get(url);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(url);
    return undefined;
  }
  return entry.value;
}

/**
 * Fetch the og:image URL from a remote page using a mobile user-agent.
 * Returns null if not found, blocked, or on any error.
 */
export async function fetchOgImageUrl(url: string): Promise<string | null> {
  // Check cache first (including cached nulls)
  const cached = getCached(url);
  if (cached !== undefined) {
    return cached;
  }

  // Skip known non-scrapable hosts
  if (isBlockedHost(url)) {
    setCached(url, null);
    return null;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
    });

    const rawText = await response.text();
    const text = rawText.substring(0, 262144);

    // Try property="og:image" content="..." (standard order)
    const patternA = /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i;
    // Try content="..." property="og:image" (reversed order)
    const patternB = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i;

    const matchA = text.match(patternA);
    const matchB = text.match(patternB);
    const rawMatch = (matchA?.[1] ?? matchB?.[1]) ?? null;

    if (!rawMatch) {
      setCached(url, null);
      return null;
    }

    // Resolve relative URLs
    let resolved: string;
    try {
      resolved = new URL(rawMatch, url).href;
    } catch {
      resolved = rawMatch;
    }

    console.log('[ogImageScraper] Found og:image for', url, '->', resolved);
    setCached(url, resolved);
    return resolved;
  } catch (err) {
    console.warn('[ogImageScraper] Failed to fetch og:image for', url, err);
    setCached(url, null);
    return null;
  }
}
