
# URL Processing - Quick Reference

## Overview
Automatic URL detection, storage, and content extraction for notes.

## Key Files

### Client-Side
- **`utils/urlProcessor.ts`** - URL extraction and processing utilities
- **`app/note-editor.tsx`** - Integration point (calls URL processing on save)

### Server-Side
- **Edge Function**: `process-url` - Extracts text content from URLs
- **Database Trigger**: `trigger_process_url_on_insert_update` - Auto-calls edge function

### Database
- **Table**: `recall_urls` - Stores URLs and extracted content
- **Constraint**: `recall_urls_user_recall_url_unique` - Ensures uniqueness

## How It Works

```
User saves note → URLs detected → Stored in DB → Trigger fires → 
Edge function called → Content extracted → DB updated
```

## API Reference

### `extractUrls(text: string): string[]`
Extracts all URLs from text.

```typescript
import { extractUrls } from '@/utils/urlProcessor';

const urls = extractUrls("Check https://example.com");
// Returns: ["https://example.com"]
```

### `hasUrls(text: string): boolean`
Quick check if text contains URLs.

```typescript
import { hasUrls } from '@/utils/urlProcessor';

const hasLinks = hasUrls("Check https://example.com");
// Returns: true
```

### `processRecallUrls(userId, recallId, noteText): Promise`
Main function - processes all URLs in note text.

```typescript
import { processRecallUrls } from '@/utils/urlProcessor';

const result = await processRecallUrls(
  user.id,
  recallId,
  "Visit https://example.com"
);
// Returns: { success: true } or { success: false, error: "..." }
```

### `getRecallUrls(recallId): Promise`
Retrieves all URLs for a recall.

```typescript
import { getRecallUrls } from '@/utils/urlProcessor';

const urls = await getRecallUrls(recallId);
// Returns: [{ id, url, url_data, created_at }, ...]
```

## Database Schema

```sql
recall_urls (
  id UUID PRIMARY KEY,
  recall_id UUID REFERENCES recalls(id),
  user_id UUID REFERENCES auth.users(id),
  url TEXT NOT NULL,
  url_data TEXT,  -- Extracted content
  created_at TIMESTAMPTZ,
  UNIQUE (user_id, recall_id, url)
)
```

## Edge Function

### Endpoint
```
POST https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/process-url
```

### Request
```json
{
  "url": "https://example.com",
  "recall_url_id": "uuid-here"  // Optional
}
```

### Response
```json
{
  "success": true,
  "text": "Extracted content..."
}
```

## Common Patterns

### Check if note has URLs
```typescript
import { hasUrls } from '@/utils/urlProcessor';

if (hasUrls(noteText)) {
  // Show URL indicator in UI
}
```

### Get URLs for display
```typescript
import { getRecallUrls } from '@/utils/urlProcessor';

const urls = await getRecallUrls(recallId);
urls.forEach(({ url, url_data }) => {
  console.log(`${url}: ${url_data?.substring(0, 100)}...`);
});
```

### Manual URL processing
```typescript
import { processRecallUrls } from '@/utils/urlProcessor';

// After updating note text
await processRecallUrls(userId, recallId, updatedText);
```

## Database Queries

### Get all URLs for a user
```sql
SELECT r.text, ru.url, ru.url_data
FROM recalls r
JOIN recall_urls ru ON r.id = ru.recall_id
WHERE r.user_id = '<user_id>'
ORDER BY ru.created_at DESC;
```

### Get URLs pending processing
```sql
SELECT url, created_at
FROM recall_urls
WHERE url_data IS NULL
ORDER BY created_at DESC;
```

### Get failed URL processing
```sql
SELECT url, url_data
FROM recall_urls
WHERE url_data LIKE 'Error:%'
ORDER BY created_at DESC;
```

### Get processing statistics
```sql
SELECT 
  COUNT(*) AS total,
  COUNT(CASE WHEN url_data IS NOT NULL THEN 1 END) AS processed,
  COUNT(CASE WHEN url_data IS NULL THEN 1 END) AS pending
FROM recall_urls;
```

## Debugging

### Enable verbose logging
```typescript
// In urlProcessor.ts, all operations are already logged
// Check console for:
// - "Processing URLs in note text for recall: <id>"
// - "URLs found in text: <count>"
// - "URLs to add: <count>"
// - "URLs to remove: <count>"
```

### Check edge function logs
```bash
# Supabase Dashboard → Edge Functions → process-url → Logs
```

### Test edge function manually
```bash
curl -X POST \
  https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/process-url \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## Configuration

### URL Regex Pattern
```typescript
const urlRegex = /(https?:\/\/[^\s]+)/g;
```

### Timeout
```typescript
// In process-url edge function
signal: AbortSignal.timeout(10000)  // 10 seconds
```

### Text Limit
```typescript
// In process-url edge function
const limitedText = text.substring(0, 10000);  // 10,000 chars
```

## Error Handling

### Client-Side
```typescript
const result = await processRecallUrls(userId, recallId, text);
if (!result.success) {
  console.error('URL processing failed:', result.error);
  // Handle error (optional - doesn't block note saving)
}
```

### Edge Function
```typescript
// Errors are caught and returned in response
{
  "success": false,
  "error": "Failed to fetch URL: 404 Not Found"
}
```

### Database
```sql
-- Errors stored in url_data column
SELECT url, url_data 
FROM recall_urls 
WHERE url_data LIKE 'Error:%';
```

## Performance

- **Asynchronous**: URL processing doesn't block note saving
- **Timeout**: 10-second limit per URL
- **Text Limit**: 10,000 characters max
- **Trigger**: Fires after database commit
- **Edge Function**: Runs independently

## Security

- **RLS**: Users can only access their own URLs
- **Authentication**: JWT verification on edge function
- **Validation**: URL format validated before processing
- **Service Role**: Stored securely in vault

## Testing

### Unit Test
```typescript
import { extractUrls } from '@/utils/urlProcessor';

test('extracts URLs from text', () => {
  const urls = extractUrls('Visit https://a.com and https://b.com');
  expect(urls).toEqual(['https://a.com', 'https://b.com']);
});
```

### Integration Test
```typescript
// 1. Create note with URL
// 2. Verify URL in database
// 3. Wait for processing
// 4. Verify url_data populated
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| URLs not detected | Check regex pattern, verify URL format |
| URLs not stored | Check RLS policies, verify user authentication |
| Content not extracted | Check edge function logs, verify trigger enabled |
| Duplicate errors | Verify unique constraint, check upsert logic |
| Slow processing | Check URL accessibility, verify timeout setting |

## Best Practices

1. **Always check result**: Handle success/failure from `processRecallUrls()`
2. **Don't block UI**: URL processing is async, don't wait for it
3. **Log operations**: Use console.log for debugging
4. **Handle errors gracefully**: URL processing failures shouldn't break app
5. **Monitor performance**: Check edge function metrics regularly

## Future Enhancements

- [ ] URL preview cards in UI
- [ ] Metadata extraction (title, description, image)
- [ ] Link validation
- [ ] Content summarization with AI
- [ ] Include URL content in search
- [ ] Batch processing for multiple URLs
- [ ] Caching to avoid re-fetching

## Resources

- **Implementation Guide**: `URL_PROCESSING_IMPLEMENTATION.md`
- **Deployment Guide**: `URL_PROCESSING_DEPLOYMENT_GUIDE.md`
- **Edge Function**: `supabase/functions/process-url/index.ts`
- **Utilities**: `utils/urlProcessor.ts`
