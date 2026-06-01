// deno-lint-ignore-file no-explicit-any

/**
 * cloudflare-upload-document Edge Function
 * Uploads documents to Supabase Storage (documents bucket).
 * Returns the storage path (not a signed URL) so the client can sign on demand.
 * Also UPDATEs recall_documents.cdn_url which triggers extract-document via DB trigger.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UploadRequest {
  base64Data: string;
  fileName: string;
  contentType: string;
  userId: string;
  // Frontend sends documentId (the pre-inserted recall_documents row id)
  documentId?: string;
  // Also accept recordId for spec compatibility
  recordId?: string;
}

interface SuccessResponse {
  success: true;
  cdnUrl: string;
  storagePath: string;
  uploadTimeMs: number;
}

interface ErrorResponse {
  error: string;
  message?: string;
  details?: string;
}

const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
];

function validateContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase());
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  return Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
}

Deno.serve(async (req: Request): Promise<Response> => {
  const startTime = performance.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('=== cloudflare-upload-document Edge Function Started ===');
    console.log('Timestamp:', new Date().toISOString());

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      const errorResponse: ErrorResponse = {
        error: 'Server configuration error: Supabase credentials missing',
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
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

    const { base64Data, fileName, contentType, userId } = requestBody;
    // Accept either documentId (frontend) or recordId (spec)
    const rowId = requestBody.documentId || requestBody.recordId;

    // Validate required fields
    if (!base64Data || !fileName || !userId) {
      const errorResponse: ErrorResponse = {
        error: 'Missing required fields: base64Data, fileName, and userId are required',
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

    // Validate file size (approximate check on base64 length)
    const estimatedSizeBytes = (base64Data.length * 3) / 4;
    if (estimatedSizeBytes > MAX_FILE_SIZE_BYTES) {
      const errorResponse: ErrorResponse = {
        error: 'File too large',
        message: `File size exceeds ${MAX_FILE_SIZE_MB}MB limit`,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Upload details:', {
      fileName,
      contentType,
      userId,
      rowId,
      estimatedSizeMB: (estimatedSizeBytes / (1024 * 1024)).toFixed(2),
    });

    // Decode base64 to binary
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

    // Generate unique storage path: <userId>/<uuid>-<safeFileName>
    // The bucket is 'documents', so full path in bucket is: <userId>/<uuid>-<safeFileName>
    const fileUuid = crypto.randomUUID();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${userId}/${fileUuid}-${safeFileName}`;

    console.log('Storage path:', storagePath);

    // Initialize Supabase client with service role for storage access
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Upload to Supabase Storage
    console.log('Uploading to Supabase Storage bucket: documents');
    const uploadStart = performance.now();

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, bytes, {
        contentType: contentType || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase Storage upload error:', uploadError);
      const errorResponse: ErrorResponse = {
        error: 'Failed to upload to storage',
        details: uploadError.message,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const uploadTime = performance.now() - uploadStart;
    console.log(`Storage upload completed in ${uploadTime.toFixed(2)}ms`);
    console.log('Upload data:', uploadData);

    // The cdnUrl is the storage path — the client uses getDocumentSignedUrl() to sign it on demand.
    // Returning the path (not a signed URL) means it never expires.
    const cdnUrl = storagePath;
    const totalTime = performance.now() - startTime;

    // UPDATE recall_documents.cdn_url if we have a row id.
    // This UPDATE triggers the on_document_cdn_url_set_trigger_extraction DB trigger
    // which fires extract-document asynchronously.
    if (rowId) {
      console.log('Updating recall_documents.cdn_url for row:', rowId);
      const { error: updateError } = await supabase
        .from('recall_documents')
        .update({ cdn_url: cdnUrl })
        .eq('id', rowId);

      if (updateError) {
        console.error('Failed to update cdn_url in recall_documents:', updateError);
        // Non-fatal: storage upload succeeded, just log the error
      } else {
        console.log('recall_documents.cdn_url updated successfully — extract-document will be triggered by DB trigger');
      }
    } else {
      console.warn('No documentId/recordId provided — skipping recall_documents update');
    }

    console.log('=== Upload Successful ===');
    console.log('CDN URL (storage path):', cdnUrl);
    console.log(`Total processing time: ${totalTime.toFixed(2)}ms`);

    const successResponse: SuccessResponse = {
      success: true,
      cdnUrl,
      storagePath,
      uploadTimeMs: Math.round(totalTime),
    };

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error('Exception in cloudflare-upload-document:', error);
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