/**
 * Cloudflare Images variant helper.
 *
 * Returns a Cloudflare-Images URL with the requested variant substituted for
 * the last path segment. If the URL is not a Cloudflare Images URL (e.g. an
 * OG image from a third-party site, or a non-CDN URL), it is returned
 * unchanged so callers can use it in place anywhere.
 *
 * NOTE: The variant names 'thumbnail', 'card', and 'avatar' must be created
 * on the Cloudflare Images dashboard (Account → Images → Variants) before
 * they will resolve. Until then, requesting those variants will return a 404.
 * The helper is forward-compatible — add the variants on the dashboard when
 * you are ready to use them.
 *
 * Examples:
 *   cdnVariant('https://imagedelivery.net/AbC/img-123/public', 'thumbnail')
 *     -> 'https://imagedelivery.net/AbC/img-123/thumbnail'
 *   cdnVariant('https://example.com/og.jpg', 'thumbnail')
 *     -> 'https://example.com/og.jpg'
 *   cdnVariant(undefined, 'thumbnail') -> undefined
 */

export type CdnVariant = 'public' | 'thumbnail' | 'card' | 'avatar';

export function cdnVariant(
  url: string | null | undefined,
  variant: CdnVariant,
): string | null | undefined {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('imagedelivery.net/')) return url;
  // Replace last path segment with the requested variant
  const idx = url.lastIndexOf('/');
  if (idx <= 0) return url;
  return url.substring(0, idx + 1) + variant;
}
