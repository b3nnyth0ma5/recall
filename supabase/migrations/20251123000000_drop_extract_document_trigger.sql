-- Drop the broken document extraction triggers and their PL/pgSQL functions.
-- Document extraction is now invoked directly from the cloudflare-upload-document
-- edge function via bare fetch + service role key, mirroring the proven
-- ocr-image -> embedding-image and extract-document -> embedding-document patterns.
-- The DB trigger approach was fragile because it required hand-rolling an
-- Authorization header, which has been the root cause of multiple 401 incidents.

DROP TRIGGER IF EXISTS on_document_cdn_url_set_trigger_extraction ON recall_documents;
DROP TRIGGER IF EXISTS on_document_insert_trigger_extraction ON recall_documents;

DROP FUNCTION IF EXISTS trigger_document_extraction_on_update();
DROP FUNCTION IF EXISTS trigger_document_extraction();
DROP FUNCTION IF EXISTS trigger_extract_document_function();
