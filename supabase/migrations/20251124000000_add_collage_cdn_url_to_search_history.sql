ALTER TABLE public.search_history
  ADD COLUMN IF NOT EXISTS collage_cdn_url text;

COMMENT ON COLUMN public.search_history.collage_cdn_url IS
  'Cloudflare Images CDN URL for the collage thumbnail composed from the top matching recalls'' primary images. Null when the search returned no recalls with images, or before collage generation completes.';
