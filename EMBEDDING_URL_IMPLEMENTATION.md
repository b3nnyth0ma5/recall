
# Embedding URL Implementation

## Overview
This document describes the implementation of the `embedding-url` edge function and its integration with the existing URL processing pipeline.

## Architecture

### Flow Diagram
```
User creates/updates note with URL
    ↓
recall_urls table insert/update
    ↓
trigger_process_url() → process-url edge function
    ↓
Updates url_data in recall_urls
    ↓
trigger_embedding_url() → embedding-url edge function
    ↓
Updates recall_url_embedding in recall_urls
    ↓
Available for search via search-recalls-v2
```

## Components

### 1. embedding-url Edge Function
**Location:** `supabase/functions/embedding-url/index.ts`

**Purpose:** 
- Generates embeddings for URL content using OpenAI's text-embedding-3-small model
- Stores embeddings in the `recall_urls.recall_url_embedding` column

**Key Features:**
- Base64 encoding for efficient storage
- Duplicate processing prevention (checks if embedding already exists)
- Automatic retry logic for transient failures
- Comprehensive error handling and logging
- Similar architecture to `embedding-image` function

**Input:**
```json
{
  "recall_url_id": "uuid",
  "url_data": "optional text content"
}
```

**Output:**
```json
{
  "success": true,
  "recall_url_id": "uuid",
  "processingTimeMs": 1234,
  "embeddingDimensions": 1536,
  "urlDataLength": 5000,
  "tokenUsage": {
    "prompt_tokens": 100,
    "total_tokens": 100
  }
}
```

### 2. Database Trigger
**Function:** `trigger_embedding_url()`

**Purpose:**
- Automatically calls the `embedding-url` edge function after `url_data` is updated
- Only triggers when `url_data` is not null and has been changed

**Trigger:**
- **Event:** AFTER INSERT OR UPDATE OF url_data ON recall_urls
- **Timing:** Asynchronous (uses `net.http_post`)

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION trigger_embedding_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  -- Only proceed if url_data is not null and has been updated
  IF NEW.url_data IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.url_data IS DISTINCT FROM NEW.url_data) THEN
    -- Get the service role key from vault
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;

    -- Make async HTTP request to embedding-url edge function
    SELECT net.http_post(
      url := 'https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/embedding-url',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := jsonb_build_object(
        'recall_url_id', NEW.id,
        'url_data', NEW.url_data
      )
    ) INTO request_id;

    -- Log the request
    RAISE LOG 'Triggered embedding-url for recall_url_id: %, request_id: %', NEW.id, request_id;
  END IF;

  RETURN NEW;
END;
$$;
```

### 3. search-recalls-v2 Updates
**Location:** `supabase/functions/search-recalls-v2/index.ts`

**Changes:**
1. **Added URL Fetching:**
   ```typescript
   // Fetch all recall URLs with embeddings for this user
   const { data: allUrls, error: fetchUrlsError } = await supabase
     .from('recall_urls')
     .select('id, recall_id, url, url_data, recall_url_embedding')
     .eq('user_id', user.id)
     .not('recall_url_embedding', 'is', null);
   ```

2. **Added URL Similarity Calculation:**
   ```typescript
   // Calculate cosine similarity for each URL
   const urlMatches = (allUrls || []).map((url)=>{
     const similarity = calculateCosineSimilarity(url.recall_url_embedding);
     return {
       id: url.id,
       recall_id: url.recall_id,
       url: url.url || '',
       url_data: url.url_data || '',
       similarity,
       source: 'url'
     };
   });
   ```

3. **Updated Context Building:**
   ```typescript
   if (match.source === 'url') {
     return {
       sourceId,
       recallId: match.recall_id,
       text: `${sourceId} (${Math.round(match.similarity * 100)}% match - from URL):
URL: ${match.url}
URL Content: ${match.url_data.substring(0, 500)}${match.url_data.length > 500 ? '...' : ''}`,
       similarity: match.similarity
     };
   }
   ```

## Database Schema

### recall_urls Table
```sql
CREATE TABLE recall_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_id uuid REFERENCES recalls(id),
  user_id uuid REFERENCES auth.users(id),
  url text NOT NULL,
  url_data text,  -- Extracted text content from URL
  recall_url_embedding vector,  -- OpenAI embedding (1536 dimensions)
  created_at timestamptz DEFAULT now()
);
```

## Processing Pipeline

### Step 1: URL Detection and Storage
When a user creates or updates a note with a URL:
1. The URL is detected in the note text
2. A record is inserted into `recall_urls` table
3. The `trigger_process_url()` function is triggered

### Step 2: URL Content Extraction
The `process-url` edge function:
1. Fetches the URL content
2. Extracts text from HTML
3. Updates `url_data` in `recall_urls`

### Step 3: Embedding Generation
The `trigger_embedding_url()` function:
1. Detects that `url_data` has been updated
2. Calls the `embedding-url` edge function
3. The function generates an embedding using OpenAI
4. The embedding is stored in `recall_url_embedding`

### Step 4: Search Integration
When a user searches:
1. The query is converted to an embedding
2. All embeddings (recalls, images, URLs) are fetched
3. Cosine similarity is calculated for each
4. Results are ranked and returned

## Testing

### Manual Testing
1. **Create a note with a URL:**
   ```
   Check out this article: https://example.com/article
   ```

2. **Verify URL processing:**
   ```sql
   SELECT id, url, url_data, recall_url_embedding 
   FROM recall_urls 
   WHERE url = 'https://example.com/article';
   ```

3. **Test search:**
   - Search for content related to the URL
   - Verify that the note appears in results
   - Check that the match percentage is reasonable

### Monitoring
- Check edge function logs for errors
- Monitor OpenAI API usage
- Verify embedding dimensions (should be 1536)

## Error Handling

### Common Issues

1. **URL fetch fails:**
   - The `process-url` function will update `url_data` with an error message
   - The embedding function will not be triggered (url_data is not null but contains error)

2. **OpenAI API rate limiting:**
   - The function includes automatic retry logic with exponential backoff
   - Maximum 2 retries before failing

3. **Invalid URL format:**
   - Caught by `process-url` function
   - Error message stored in `url_data`

## Performance Considerations

1. **Asynchronous Processing:**
   - Both `process-url` and `embedding-url` run asynchronously
   - Does not block the main application flow

2. **Duplicate Prevention:**
   - The function checks if an embedding already exists
   - Skips processing if embedding is present

3. **Token Limits:**
   - URL content is limited to 10,000 characters by `process-url`
   - This prevents excessive OpenAI API costs

## Cost Estimation

### OpenAI API Costs
- Model: text-embedding-3-small
- Cost: ~$0.00002 per 1,000 tokens
- Average URL: ~500-2,000 tokens
- Cost per URL: ~$0.00001-$0.00004

### Example Monthly Costs
- 1,000 URLs/month: ~$0.01-$0.04
- 10,000 URLs/month: ~$0.10-$0.40
- 100,000 URLs/month: ~$1.00-$4.00

## Deployment

### Edge Functions
```bash
# Deploy embedding-url function
supabase functions deploy embedding-url

# Deploy updated search-recalls-v2 function
supabase functions deploy search-recalls-v2
```

### Database Migration
```bash
# Apply the trigger migration
supabase migration apply add_embedding_url_trigger
```

## Monitoring and Debugging

### Check Logs
```bash
# Check embedding-url logs
supabase functions logs embedding-url

# Check search-recalls-v2 logs
supabase functions logs search-recalls-v2
```

### Verify Embeddings
```sql
-- Count URLs with embeddings
SELECT COUNT(*) 
FROM recall_urls 
WHERE recall_url_embedding IS NOT NULL;

-- Check recent embeddings
SELECT id, url, 
       CASE 
         WHEN recall_url_embedding IS NOT NULL 
         THEN 'Has embedding' 
         ELSE 'No embedding' 
       END as status,
       created_at
FROM recall_urls
ORDER BY created_at DESC
LIMIT 10;
```

## Future Enhancements

1. **Batch Processing:**
   - Process multiple URLs in a single API call
   - Reduce API overhead

2. **Caching:**
   - Cache embeddings for frequently accessed URLs
   - Reduce duplicate processing

3. **Content Summarization:**
   - Summarize long URL content before embedding
   - Improve search relevance

4. **URL Metadata:**
   - Extract title, description, and other metadata
   - Enhance search context

## Related Documentation
- [URL Processing Implementation](./URL_PROCESSING_IMPLEMENTATION.md)
- [Embedding Image Implementation](./EMBEDDING_IMAGE_IMPLEMENTATION.md)
- [Search Recalls V2 Implementation](./SEARCH_RECALLS_V2_IMPLEMENTATION.md)
