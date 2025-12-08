
// Deno-lint-ignore-file no-explicit-any

/**
 * Cloudflare Upload Edge Function
 * Optimized for fast and efficient image uploads to Cloudflare Images CDN
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UploadRequest {
  base64Data: string;
  fileName: string;
  contentType: string;
}

interface CloudflareUploadResponse {
  success: boolean;
  result: {
    id: string;
    filename: string;
    uploaded: string;
    requireSignedURLs: boolean;
    variants: string[];
  };
  errors: any[];
  messages: any[];
}

interface SuccessResponse {
  success: true;
  cdnUrl: string;
  imageId: string;
  variants: string[];
  uploadTimeMs: number;
}

interface ErrorResponse {
  error: string;
  message?: string;
  details?: string;
}

// Configuration constants
const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 30000; // 30 seconds
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

/**
 * Validate image content type
 */
function validateContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase());
}

/**
 * Convert base64 string to Uint8Array efficiently
 * Uses native Uint8Array.from for better performance
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  // Use Uint8Array.from with a mapping function for better performance
  return Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
}

/**
 * Create a fetch request with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Upload timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Main handler for Cloudflare image uploads
 */
Deno.serve(async (req: Request): Promise<Response> => {
  const startTime = performance.now();

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== Cloudflare Upload Edge Function Started ===');

    // Get Cloudflare credentials from environment
    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN');
    const CLOUDFLARE_ACCOUNT_HASH = Deno.env.get('CLOUDFLARE_ACCOUNT_HASH');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_HASH) {
      console.error('Missing Cloudflare configuration');
      const errorResponse: ErrorResponse = {
        error: 'Cloudflare CDN is not configured. Please set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ACCOUNT_HASH environment variables.',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate request body
    let requestBody: UploadRequest;
    try {
      requestBody = await req.json();
    } catch (error) {
      console.error('Invalid JSON in request body:', error);
      const errorResponse: ErrorResponse = {
        error: 'Invalid request body',
        message: 'Request body must be valid JSON',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { base64Data, fileName, contentType } = requestBody;

    // Validate required fields
    if (!base64Data || !fileName) {
      const errorResponse: ErrorResponse = {
        error: 'Missing required fields: base64Data and fileName',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate content type
    if (contentType && !validateContentType(contentType)) {
      const errorResponse: ErrorResponse = {
        error: 'Invalid content type',
        message: `Content type must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate image size (approximate check on base64 length)
    // Base64 encoding increases size by ~33%, so we check the encoded size
    const estimatedSizeBytes = (base64Data.length * 3) / 4;
    if (estimatedSizeBytes > MAX_IMAGE_SIZE_BYTES) {
      const errorResponse: ErrorResponse = {
        error: 'Image too large',
        message: `Image size exceeds ${MAX_IMAGE_SIZE_MB}MB limit`,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Upload details:', {
      fileName,
      contentType,
      estimatedSizeMB: (estimatedSizeBytes / (1024 * 1024)).toFixed(2),
    });

    // Convert base64 to binary efficiently
    const conversionStart = performance.now();
    let bytes: Uint8Array;
    try {
      bytes = base64ToUint8Array(base64Data);
    } catch (error) {
      console.error('Failed to decode base64:', error);
      const errorResponse: ErrorResponse = {
        error: 'Invalid base64 data',
        message: 'Failed to decode base64 string',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const conversionTime = performance.now() - conversionStart;
    console.log(`Base64 conversion completed in ${conversionTime.toFixed(2)}ms`);

    // Create form data for Cloudflare Images API
    const formData = new FormData();
    const blob = new Blob([bytes], { type: contentType || 'image/jpeg' });
    formData.append('file', blob, fileName);

    // Upload to Cloudflare Images with timeout
    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/images/v1`;

    console.log('Uploading to Cloudflare Images...');
    const uploadStart = performance.now();

    let uploadResponse: Response;
    try {
      uploadResponse = await fetchWithTimeout(
        uploadUrl,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          },
          body: formData,
        },
        UPLOAD_TIMEOUT_MS
      );
    } catch (error) {
      console.error('Upload request failed:', error);
      const errorResponse: ErrorResponse = {
        error: 'Upload request failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 504,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uploadTime = performance.now() - uploadStart;
    console.log(`Cloudflare API request completed in ${uploadTime.toFixed(2)}ms`);

    // Handle upload response
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Cloudflare upload failed:', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorText,
      });
      const errorResponse: ErrorResponse = {
        error: 'Failed to upload to Cloudflare',
        details: errorText,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: uploadResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse successful response
    let uploadResult: CloudflareUploadResponse;
    try {
      uploadResult = await uploadResponse.json();
    } catch (error) {
      console.error('Failed to parse Cloudflare response:', error);
      const errorResponse: ErrorResponse = {
        error: 'Invalid response from Cloudflare',
        message: 'Failed to parse JSON response',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!uploadResult.success || !uploadResult.result) {
      console.error('Cloudflare returned unsuccessful response:', uploadResult);
      const errorResponse: ErrorResponse = {
        error: 'Upload failed',
        details: JSON.stringify(uploadResult.errors || []),
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract the CDN URL from the response
    const imageId = uploadResult.result.id;
    const cdnUrl = `https://imagedelivery.net/${CLOUDFLARE_ACCOUNT_HASH}/${imageId}/public`;

    const totalTime = performance.now() - startTime;
    console.log('=== Upload Successful ===');
    console.log('Image ID:', imageId);
    console.log('CDN URL:', cdnUrl);
    console.log(`Total processing time: ${totalTime.toFixed(2)}ms`);

    const successResponse: SuccessResponse = {
      success: true,
      cdnUrl,
      imageId,
      variants: uploadResult.result.variants,
      uploadTimeMs: Math.round(totalTime),
    };

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error('Exception in cloudflare-upload:', error);
    console.error(`Failed after ${totalTime.toFixed(2)}ms`);

    const errorResponse: ErrorResponse = {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
