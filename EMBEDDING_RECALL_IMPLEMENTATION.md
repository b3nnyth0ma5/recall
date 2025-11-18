
# Embedding Recall Implementation

## Overview
This document describes the implementation of the `embedding-recall` Supabase edge function that automatically generates embeddings for recall records whenever they are saved.

## Implementation Details

### 1. Edge Function: `embedding-recall`
**Location:** `supabase/functions/embedding-recall/index.ts`

**Purpose:** 
- Generates embeddings for recall records by concatenating `recalls.text`, `recalls.location`, and `recalls.location_primary_type`
- Uses OpenAI's `text-embedding-3-small` model with `base64` encoding format
- Stores the generated embedding in the `recalls.recall_embedding` column

**Key Features:**
- **Duplicate Prevention:** Checks if an embedding already exists before processing
- **Automatic Data Fetching:** If text fields are not provided in the request, fetches them from the database
- **Retry Logic:** Implements exponential backoff for transient failures and rate limiting
- **Comprehensive Logging:** Detailed logs for debugging and monitoring
- **Error Handling:** Graceful error handling with informative error messages

**API Interface:**
```typescript
// Request Body
{
  recall_id: string;           // Required: UUID of the recall
  text?: string;               // Optional: recall text (fetched from DB if not provided)
  location?: string;           // Optional: recall location (fetched from DB if not provided)
  location_primary_type?: string; // Optional: location type (fetched from DB if not provided)
}

// Success Response
{
  success: true,
  recall_id: string,
  processingTimeMs: number,
  embeddingDimensions: number,
  inputTextLength: number,
  tokenUsage: {
    prompt_tokens: number,
    total_tokens: number
  }
}

// Skipped Response (when embedding already exists)
{
  success: true,
  recall_id: string,
  skipped: true,
  reason: "Embedding already exists",
  processingTimeMs: number,
  embeddingDimensions: number
}
```

### 2. Database Trigger Function
**Function Name:** `trigger_recall_embedding_processing()`

**Purpose:**
- Automatically calls the `embedding-recall` edge function whenever a recall is saved
- Constructs the JSON payload with recall data
- Uses `supabase_functions.http_request` to invoke the edge function asynchronously

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION trigger_recall_embedding_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
  payload text;
BEGIN
  -- Construct the JSON payload
  payload := json_build_object(
    'recall_id', NEW.id::text,
    'text', COALESCE(NEW.text, ''),
    'location', COALESCE(NEW.location, ''),
    'location_primary_type', COALESCE(NEW.location_primary_type, '')
  )::text;

  -- Call the edge function
  SELECT INTO request_id supabase_functions.http_request(
    'https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/embedding-recall',
    'POST',
    '{"Content-Type":"application/json"}'::jsonb,
    payload::jsonb,
    '10000'
  );

  RAISE LOG 'Recall embedding processing triggered for recall % with request_id %', NEW.id, request_id;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to trigger recall embedding processing for recall %: % (SQLSTATE: %)', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;
```

### 3. Database Trigger
**Trigger Name:** `trigger_embedding_on_recall_save`

**Purpose:**
- Fires AFTER INSERT or UPDATE on the `recalls` table
- Specifically monitors changes to `text`, `location`, or `location_primary_type` columns
- Ensures data has been saved before the edge function runs

**Implementation:**
```sql
CREATE TRIGGER trigger_embedding_on_recall_save
  AFTER INSERT OR UPDATE OF text, location, location_primary_type ON recalls
  FOR EACH ROW
  EXECUTE FUNCTION trigger_recall_embedding_processing();
```

## How It Works

### Workflow
1. **User Action:** A recall is created or updated in the database
2. **Trigger Fires:** The `trigger_embedding_on_recall_save` trigger fires AFTER the data is saved
3. **Function Invocation:** The trigger function calls the `embedding-recall` edge function asynchronously
4. **Embedding Generation:**
   - Edge function receives the recall data
   - Checks if embedding already exists (skip if yes)
   - Concatenates text, location, and location_primary_type
   - Calls OpenAI API to generate embedding
   - Decodes base64 response to float array
5. **Database Update:** The embedding is stored in `recalls.recall_embedding`

### Data Flow
```
User creates/updates recall
    ↓
Database saves recall data
    ↓
Trigger fires (AFTER INSERT/UPDATE)
    ↓
Trigger function constructs payload
    ↓
HTTP request to embedding-recall edge function
    ↓
Edge function processes:
  - Validates input
  - Checks for existing embedding
  - Concatenates text fields
  - Calls OpenAI API
  - Decodes base64 embedding
    ↓
Database updated with embedding
```

## Key Design Decisions

### 1. AFTER Trigger Timing
- **Why:** Ensures the recall data is fully saved before processing
- **Benefit:** Prevents race conditions and ensures data consistency

### 2. Asynchronous Processing
- **Why:** Uses `supabase_functions.http_request` for non-blocking execution
- **Benefit:** User operations complete quickly without waiting for embedding generation

### 3. Duplicate Prevention
- **Why:** Checks if embedding exists before processing
- **Benefit:** Saves API costs and processing time

### 4. Error Handling in Trigger
- **Why:** Uses `EXCEPTION` block to catch and log errors without failing the insert/update
- **Benefit:** User operations succeed even if embedding generation fails

### 5. Base64 Encoding
- **Why:** Uses base64 encoding format for OpenAI API
- **Benefit:** More compact representation for storage and transmission

## Monitoring and Debugging

### Check Trigger Status
```sql
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'recalls';
```

### Check Edge Function Logs
Use the Supabase dashboard or CLI to view edge function logs:
```bash
supabase functions logs embedding-recall
```

### Test the Edge Function Manually
```bash
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/embedding-recall \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"recall_id": "YOUR_RECALL_UUID"}'
```

### Check Embedding Status
```sql
SELECT 
    id,
    text,
    location,
    location_primary_type,
    CASE 
        WHEN recall_embedding IS NULL THEN 'No embedding'
        WHEN array_length(recall_embedding, 1) > 0 THEN 'Has embedding'
        ELSE 'Empty embedding'
    END as embedding_status
FROM recalls
ORDER BY created_at DESC
LIMIT 10;
```

## Environment Variables Required
The edge function requires the following environment variables to be set in Supabase:
- `SUPABASE_URL`: Automatically provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Automatically provided by Supabase
- `OPENAI_API_KEY`: Must be configured in Supabase Edge Function secrets

## Comparison with embedding-image

### Similarities
- Both use OpenAI's `text-embedding-3-small` model
- Both use `base64` encoding format
- Both implement duplicate prevention
- Both have retry logic for transient failures
- Both use AFTER triggers for automatic processing

### Differences
| Feature | embedding-image | embedding-recall |
|---------|----------------|------------------|
| **Target Table** | `recall_images` | `recalls` |
| **Input Fields** | `ocr_text` + `image_explanation` | `text` + `location` + `location_primary_type` |
| **Output Column** | `recall_image_embedding` | `recall_embedding` |
| **Trigger Event** | AFTER INSERT only | AFTER INSERT OR UPDATE |
| **Monitored Columns** | N/A (INSERT only) | `text`, `location`, `location_primary_type` |

## Future Enhancements
Potential improvements for future iterations:
1. **Batch Processing:** Process multiple recalls in a single API call
2. **Webhook Notifications:** Notify when embedding generation completes
3. **Embedding Versioning:** Track embedding model versions for future updates
4. **Performance Metrics:** Add detailed performance tracking and analytics
5. **Selective Updates:** Only regenerate embeddings when relevant fields change significantly

## Testing
To test the implementation:

1. **Create a new recall:**
```sql
INSERT INTO recalls (text, location, location_primary_type, user_id)
VALUES ('Test recall', 'San Francisco', 'city', 'YOUR_USER_UUID');
```

2. **Check the logs:**
- View edge function logs in Supabase dashboard
- Check PostgreSQL logs for trigger execution

3. **Verify the embedding:**
```sql
SELECT id, text, recall_embedding
FROM recalls
WHERE text = 'Test recall';
```

4. **Update a recall:**
```sql
UPDATE recalls
SET text = 'Updated test recall'
WHERE text = 'Test recall';
```

5. **Verify embedding was regenerated:**
The embedding should be updated after the text change.

## Troubleshooting

### Embedding not generated
- Check edge function logs for errors
- Verify OpenAI API key is configured
- Check PostgreSQL logs for trigger errors
- Ensure the recall has at least one non-empty text field

### Trigger not firing
- Verify trigger exists: `SELECT * FROM information_schema.triggers WHERE event_object_table = 'recalls';`
- Check if trigger function exists: `SELECT * FROM information_schema.routines WHERE routine_name = 'trigger_recall_embedding_processing';`

### OpenAI API errors
- Check API key validity
- Verify API rate limits
- Review edge function logs for detailed error messages

## Conclusion
The `embedding-recall` edge function and associated database trigger provide automatic, asynchronous embedding generation for recall records. The implementation follows best practices for error handling, performance, and maintainability, ensuring reliable operation in production environments.
