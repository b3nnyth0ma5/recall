
# Embedding URL Quick Reference

## Quick Start

### 1. How It Works
```
Note with URL → recall_urls → process-url → url_data → embedding-url → recall_url_embedding → search
```

### 2. Key Components
- **Edge Function:** `embedding-url` (generates embeddings)
- **Trigger:** `trigger_embedding_url()` (calls edge function)
- **Search:** `search-recalls-v2` (includes URL embeddings)

### 3. Database Column
```sql
recall_urls.recall_url_embedding  -- vector type, 1536 dimensions
```

## Common Tasks

### Check if URL has embedding
```sql
SELECT url, 
       CASE 
         WHEN recall_url_embedding IS NOT NULL 
         THEN 'Yes' 
         ELSE 'No' 
       END as has_embedding
FROM recall_urls
WHERE url = 'https://example.com';
```

### Manually trigger embedding generation
```bash
curl -X POST https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/embedding-url \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"recall_url_id": "uuid-here"}'
```

### View recent embeddings
```sql
SELECT id, url, 
       array_length(recall_url_embedding, 1) as embedding_dimensions,
       created_at
FROM recall_urls
WHERE recall_url_embedding IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### Check logs
```bash
# Embedding function logs
supabase functions logs embedding-url --tail

# Search function logs
supabase functions logs search-recalls-v2 --tail
```

## Troubleshooting

### URL not getting embedded
1. Check if `url_data` is populated:
   ```sql
   SELECT url, url_data FROM recall_urls WHERE url = 'your-url';
   ```

2. Check edge function logs:
   ```bash
   supabase functions logs embedding-url
   ```

3. Manually trigger:
   ```sql
   UPDATE recall_urls SET url_data = url_data WHERE id = 'uuid-here';
   ```

### Search not returning URL results
1. Verify embedding exists:
   ```sql
   SELECT recall_url_embedding FROM recall_urls WHERE id = 'uuid-here';
   ```

2. Check search logs:
   ```bash
   supabase functions logs search-recalls-v2
   ```

3. Test similarity manually:
   ```sql
   -- This requires the query embedding
   SELECT url, 
          1 - (recall_url_embedding <=> '[your-query-embedding]'::vector) as similarity
   FROM recall_urls
   WHERE recall_url_embedding IS NOT NULL
   ORDER BY similarity DESC
   LIMIT 10;
   ```

## API Reference

### embedding-url Edge Function

**Endpoint:** `POST /functions/v1/embedding-url`

**Request:**
```json
{
  "recall_url_id": "uuid",
  "url_data": "optional text content"
}
```

**Response (Success):**
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

**Response (Skipped):**
```json
{
  "success": true,
  "recall_url_id": "uuid",
  "skipped": true,
  "reason": "Embedding already exists",
  "processingTimeMs": 50,
  "embeddingDimensions": 1536
}
```

**Response (Error):**
```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

## Performance Metrics

### Expected Processing Times
- Embedding generation: 500-2000ms
- Search with URLs: +100-300ms overhead
- Total pipeline (URL → embedding): 10-15 seconds

### Token Usage
- Average URL: 500-2,000 tokens
- Cost per URL: ~$0.00001-$0.00004
- Model: text-embedding-3-small (1536 dimensions)

## Monitoring Queries

### Count URLs by status
```sql
SELECT 
  COUNT(*) as total_urls,
  COUNT(url_data) as processed_urls,
  COUNT(recall_url_embedding) as embedded_urls
FROM recall_urls;
```

### Recent processing activity
```sql
SELECT 
  url,
  CASE 
    WHEN url_data IS NULL THEN 'Pending processing'
    WHEN recall_url_embedding IS NULL THEN 'Pending embedding'
    ELSE 'Complete'
  END as status,
  created_at
FROM recall_urls
ORDER BY created_at DESC
LIMIT 20;
```

### Failed URLs
```sql
SELECT url, url_data
FROM recall_urls
WHERE url_data LIKE 'Error:%'
ORDER BY created_at DESC;
```

## Configuration

### Environment Variables
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (stored in vault)
- `OPENAI_API_KEY`: OpenAI API key

### Trigger Configuration
- **Event:** AFTER INSERT OR UPDATE OF url_data
- **Condition:** url_data IS NOT NULL AND changed
- **Execution:** Asynchronous via net.http_post

## Best Practices

1. **Always check logs first** when debugging
2. **Monitor OpenAI API usage** to control costs
3. **Use the trigger** instead of manual calls
4. **Verify url_data** before expecting embeddings
5. **Test with small URLs** first

## Related Commands

```bash
# Deploy functions
supabase functions deploy embedding-url
supabase functions deploy search-recalls-v2

# View logs
supabase functions logs embedding-url --tail
supabase functions logs search-recalls-v2 --tail

# Test locally
supabase functions serve embedding-url
```

## Support

For issues or questions:
1. Check logs: `supabase functions logs embedding-url`
2. Review documentation: `EMBEDDING_URL_IMPLEMENTATION.md`
3. Test manually with curl
4. Check database triggers: `SELECT * FROM pg_trigger WHERE tgname = 'trigger_embedding_url_on_update';`
