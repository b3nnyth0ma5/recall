// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOG = '[generate-search-collage]';

const CANVAS_SIZE = 512;

interface RequestBody {
  userId: string;
  searchText: string;
  imageUrls: string[];
  previousCollageCdnUrl?: string | null;
}

// Resize image to fill targetSize x targetSize (cover + center crop)
async function resizeAndCrop(img: Image, targetSize: number): Promise<Image> {
  const srcW = img.width;
  const srcH = img.height;
  const scale = Math.max(targetSize / srcW, targetSize / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  img.resize(newW, newH);
  const cropX = Math.floor((newW - targetSize) / 2);
  const cropY = Math.floor((newH - targetSize) / 2);
  img.crop(cropX, cropY, targetSize, targetSize);
  return img;
}

// Draw a white border (4px) around the edges of an image in-place
function drawWhiteBorder(img: Image, borderWidth: number = 4): void {
  const w = img.width;
  const h = img.height;
  const white = Image.rgbaToColor(255, 255, 255, 255);
  // Top
  for (let y = 0; y < borderWidth; y++) {
    for (let x = 0; x < w; x++) img.setPixelAt(x + 1, y + 1, white);
  }
  // Bottom
  for (let y = h - borderWidth; y < h; y++) {
    for (let x = 0; x < w; x++) img.setPixelAt(x + 1, y + 1, white);
  }
  // Left
  for (let x = 0; x < borderWidth; x++) {
    for (let y = 0; y < h; y++) img.setPixelAt(x + 1, y + 1, white);
  }
  // Right
  for (let x = w - borderWidth; x < w; x++) {
    for (let y = 0; y < h; y++) img.setPixelAt(x + 1, y + 1, white);
  }
}

// Extract Cloudflare image ID from CDN URL
function extractCloudflareImageId(url: string): string | null {
  try {
    // URL format: https://imagedelivery.net/<HASH>/<imageId>/public
    const parts = url.split('/');
    // Find 'imagedelivery.net', then skip hash, get imageId
    const idx = parts.findIndex(p => p === 'imagedelivery.net');
    if (idx !== -1 && parts.length > idx + 2) {
      return parts[idx + 2];
    }
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log(`${LOG} Request received`);

    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const CLOUDFLARE_ACCOUNT_HASH = Deno.env.get('CLOUDFLARE_ACCOUNT_HASH');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_HASH) {
      console.error(`${LOG} Missing Cloudflare env vars`);
      return new Response(
        JSON.stringify({ success: false, reason: 'cloudflare_not_configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: RequestBody;
    try {
      body = await req.json();
    } catch (e) {
      console.error(`${LOG} Failed to parse request body:`, e);
      return new Response(
        JSON.stringify({ success: false, reason: 'invalid_request_body' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, searchText, imageUrls, previousCollageCdnUrl } = body;

    console.log(`${LOG} userId=${userId} searchText="${searchText}" imageCount=${imageUrls?.length}`);

    // Validate imageUrls
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      console.log(`${LOG} No image URLs provided`);
      return new Response(
        JSON.stringify({ success: false, reason: 'no_images' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clamp to 4
    const urls = imageUrls.slice(0, 4);

    // Fetch all images in parallel
    console.log(`${LOG} Fetching ${urls.length} images in parallel`);
    const fetchResults = await Promise.all(
      urls.map(async (url, i) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          const img = await Image.decode(new Uint8Array(buf));
          console.log(`${LOG} Image ${i} decoded: ${img.width}x${img.height}`);
          return img;
        } catch (err) {
          console.warn(`${LOG} Failed to fetch/decode image ${i} (${url}):`, err);
          return null;
        }
      })
    );

    const images: Image[] = fetchResults.filter((img): img is Image => img !== null);

    if (images.length === 0) {
      console.log(`${LOG} All image fetches failed`);
      return new Response(
        JSON.stringify({ success: false, reason: 'all_fetches_failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`${LOG} ${images.length} images survived fetch/decode`);

    // Create canvas with transparent background
    const canvas = new Image(CANVAS_SIZE, CANVAS_SIZE);
    // Fill with transparent (default is transparent in imagescript)

    const count = images.length;

    // Layout config: [tileSize, [{dx, dy, rotation}]] in paint order (back to front)
    type TileConfig = { imgIndex: number; dx: number; dy: number; rotation: number };
    let tileSize: number;
    let paintOrder: TileConfig[];

    if (count === 1) {
      tileSize = 360;
      paintOrder = [
        { imgIndex: 0, dx: Math.floor((CANVAS_SIZE - tileSize) / 2), dy: Math.floor((CANVAS_SIZE - tileSize) / 2), rotation: 0 },
      ];
    } else if (count === 2) {
      tileSize = 320;
      // Paint tile 1 first (back), then tile 0 (front/top)
      paintOrder = [
        { imgIndex: 1, dx: 96, dy: 96, rotation: -6 },
        { imgIndex: 0, dx: 96, dy: 96, rotation: 4 },
      ];
    } else if (count === 3) {
      tileSize = 280;
      // Paint in reverse order: tile 2, tile 1, tile 0 (tile 0 ends up on top)
      paintOrder = [
        { imgIndex: 2, dx: 60, dy: 60, rotation: -10 },
        { imgIndex: 1, dx: 130, dy: 110, rotation: 2 },
        { imgIndex: 0, dx: 180, dy: 170, rotation: 8 },
      ];
    } else {
      // count >= 4
      tileSize = 260;
      // Paint in reverse order: tile 3, tile 2, tile 1, tile 0 (tile 0 ends up on top)
      paintOrder = [
        { imgIndex: 3, dx: 40, dy: 50, rotation: -12 },
        { imgIndex: 2, dx: 110, dy: 90, rotation: -2},
        { imgIndex: 1, dx: 180, dy: 140, rotation: 6 },
        { imgIndex: 0, dx: 240, dy: 200, rotation: 12 },
      ];
    }

    // Process and composite each tile
    for (const { imgIndex, dx, dy, rotation } of paintOrder) {
      if (imgIndex >= images.length) continue;
      try {
        // Clone by re-encoding/decoding to avoid mutating the original
        const srcImg = images[imgIndex];
        const cloned = await Image.decode(await srcImg.encode());

        // Resize + center crop to tileSize
        await resizeAndCrop(cloned, tileSize);

        // Draw white border
        drawWhiteBorder(cloned, 4);

        // Rotate (expand canvas to avoid clipping)
        if (rotation !== 0) {
          cloned.rotate(rotation, true);
        }

        // Composite onto canvas
        // imagescript 1.2.x uses composite(src, x, y)
        canvas.composite(cloned, dx, dy);

        console.log(`${LOG} Composited tile imgIndex=${imgIndex} at (${dx},${dy}) rot=${rotation}`);
      } catch (err) {
        console.warn(`${LOG} Failed to process tile imgIndex=${imgIndex}:`, err);
      }
    }

    // Encode canvas to PNG
    console.log(`${LOG} Encoding canvas to PNG`);
    const pngBytes = await canvas.encode();
    console.log(`${LOG} PNG size: ${pngBytes.length} bytes`);

    // Upload to Cloudflare Images
    const formData = new FormData();
    const blob = new Blob([pngBytes], { type: 'image/png' });
    const fileName = `search-collage-${userId}-${Date.now()}.png`;
    formData.append('file', blob, fileName);

    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;
    console.log(`${LOG} Uploading collage to Cloudflare Images`);

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error(`${LOG} Cloudflare upload failed: ${uploadRes.status} ${errText}`);
      return new Response(
        JSON.stringify({ success: false, reason: 'upload_failed', message: errText }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uploadData = await uploadRes.json() as any;
    if (!uploadData.success || !uploadData.result?.id) {
      console.error(`${LOG} Cloudflare upload unsuccessful:`, uploadData);
      return new Response(
        JSON.stringify({ success: false, reason: 'upload_failed', message: JSON.stringify(uploadData.errors) }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const imageId = uploadData.result.id;
    const collageCdnUrl = `https://imagedelivery.net/${CLOUDFLARE_ACCOUNT_HASH}/${imageId}/public`;
    console.log(`${LOG} Collage uploaded: ${collageCdnUrl}`);

    // Fire-and-forget cleanup of previous collage
    if (previousCollageCdnUrl) {
      (async () => {
        try {
          const oldId = extractCloudflareImageId(previousCollageCdnUrl);
          if (!oldId) {
            console.warn(`${LOG} Could not extract image ID from previousCollageCdnUrl: ${previousCollageCdnUrl}`);
            return;
          }
          const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1/${oldId}`;
          const delRes = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` },
          });
          console.log(`${LOG} Deleted previous collage ${oldId}: HTTP ${delRes.status}`);
        } catch (err) {
          console.warn(`${LOG} Failed to delete previous collage (non-fatal):`, err);
        }
      })();
    }

    return new Response(
      JSON.stringify({ success: true, collageCdnUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error(`${LOG} Unhandled error:`, err);
    return new Response(
      JSON.stringify({ success: false, reason: 'internal_error', message: err?.message ?? String(err) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
