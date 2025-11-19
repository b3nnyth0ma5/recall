
# URL Processing Deployment & Verification Guide

## Deployment Checklist

### ✅ Completed Steps

1. **Database Migration: Unique Constraint**
   - Migration: `add_unique_constraint_recall_urls`
   - Status: ✅ Applied
   - Adds unique constraint on `(user_id, recall_id, url)`

2. **Edge Function: process-url**
   - Function: `process-url`
   - Status: ✅ Deployed (Version 2)
   - Extracts text content from URLs
   - Updates `recall_urls.url_data` automatically

3. **Database Trigger**
   - Migration: `create_process_url_trigger`
   - Status: ✅ Applied
   - Triggers on INSERT/UPDATE of `recall_urls`
   - Calls `process-url` edge function asynchronously

4. **Client-Side Utilities**
   - File: `utils/urlProcessor.ts`
   - Status: ✅ Created
   - Functions for URL extraction and processing

5. **Note Editor Integration**
   - File: `app/note-editor.tsx`
   - Status: ✅ Updated
   - Calls `processRecallUrls()` on note save

## Verification Steps

### 1. Test URL Detection and Storage

```typescript
// Test Case 1: Create note with single URL
1. Open the app
2. Create a new note
3. Type: "Check out https://example.com for more info"
4. Save the note
5. Verify in database:
   SELECT * FROM recall_urls WHERE url = 'https://example.com';
   // Should return 1 row with the URL
```

### 2. Test URL Content Extraction

```typescript
// Test Case 2: Verify URL processing
1. Wait 10-15 seconds after creating note
2. Check database:
   SELECT url, url_data FROM recall_urls WHERE url = 'https://example.com';
   // url_data should contain extracted text content
```

### 3. Test Multiple URLs

```typescript
// Test Case 3: Multiple URLs in one note
1. Create a new note
2. Type: "Resources: https://github.com and https://stackoverflow.com"
3. Save the note
4. Verify in database:
   SELECT COUNT(*) FROM recall_urls WHERE recall_id = '<note_id>';
   // Should return 2
```

### 4. Test URL Update

```typescript
// Test Case 4: Update note to add URL
1. Edit an existing note
2. Add text: "Also see https://reddit.com"
3. Save the note
4. Verify new URL added:
   SELECT url FROM recall_urls WHERE recall_id = '<note_id>';
   // Should include the new URL
```

### 5. Test URL Removal

```typescript
// Test Case 5: Remove URL from note
1. Edit a note with URLs
2. Remove one URL from the text
3. Save the note
4. Verify URL removed from database:
   SELECT url FROM recall_urls WHERE recall_id = '<note_id>';
   // Should not include the removed URL
```

### 6. Test No URLs

```typescript
// Test Case 6: Note without URLs
1. Create a new note
2. Type: "This is a note without any links"
3. Save the note
4. Verify no URLs stored:
   SELECT COUNT(*) FROM recall_urls WHERE recall_id = '<note_id>';
   // Should return 0
```

### 7. Test URL Removal (All URLs)

```typescript
// Test Case 7: Remove all URLs from note
1. Edit a note that has URLs
2. Remove all URLs from the text
3. Save the note
4. Verify all URLs removed:
   SELECT COUNT(*) FROM recall_urls WHERE recall_id = '<note_id>';
   // Should return 0
```

## Database Queries for Verification

### Check Unique Constraint
```sql
SELECT 
    con.conname AS constraint_name,
    ARRAY_AGG(att.attname ORDER BY u.attposition) AS columns
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN UNNEST(con.conkey) WITH ORDINALITY AS u(attnum, attposition) ON TRUE
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
WHERE rel.relname = 'recall_urls'
  AND con.contype = 'u'
GROUP BY con.conname;
```

Expected result:
```
constraint_name: recall_urls_user_recall_url_unique
columns: {user_id, recall_id, url}
```

### Check Trigger Exists
```sql
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_process_url_on_insert_update';
```

Expected result:
```
trigger_name: trigger_process_url_on_insert_update
event_manipulation: INSERT, UPDATE
event_object_table: recall_urls
action_statement: EXECUTE FUNCTION trigger_process_url()
```

### Check Edge Function Status
```sql
-- Via Supabase Dashboard or CLI
-- Navigate to Edge Functions
-- Verify "process-url" is listed and ACTIVE
```

### View Recent URL Processing
```sql
SELECT 
    ru.id,
    ru.url,
    ru.created_at,
    CASE 
        WHEN ru.url_data IS NULL THEN 'Pending'
        WHEN ru.url_data LIKE 'Error:%' THEN 'Failed'
        ELSE 'Processed'
    END AS status,
    LENGTH(ru.url_data) AS data_length
FROM recall_urls ru
ORDER BY ru.created_at DESC
LIMIT 10;
```

## Monitoring & Debugging

### Check Edge Function Logs
```bash
# Via Supabase Dashboard
1. Go to Edge Functions
2. Click on "process-url"
3. View Logs tab
4. Look for recent invocations

# Expected log entries:
# - "=== Process URL Function Started ==="
# - "Processing URL: <url>"
# - "HTML content fetched, length: <number>"
# - "Text extracted, length: <number>"
# - "Database updated successfully"
# - "=== Process URL Function Completed Successfully ==="
```

### Check Database Trigger Logs
```sql
-- View PostgreSQL logs for trigger execution
-- Look for: "Triggered process-url for recall_url_id: <id>, request_id: <id>"
```

### Check Client-Side Logs
```javascript
// In React Native app console, look for:
// - "Processing URLs in note text for recall: <id>"
// - "URLs found in text: <count>"
// - "URLs to add: <count>"
// - "URLs to remove: <count>"
// - "URLs processed successfully"
```

## Common Issues & Solutions

### Issue 1: URLs Not Being Stored
**Symptoms**: No entries in `recall_urls` table after saving note with URLs

**Debugging**:
1. Check console logs for "Processing URLs in note text"
2. Verify `processRecallUrls()` is being called
3. Check for errors in console

**Solution**:
- Ensure user is authenticated
- Verify `user.id` is available
- Check RLS policies on `recall_urls` table

### Issue 2: URL Content Not Extracted
**Symptoms**: `url_data` remains NULL after several minutes

**Debugging**:
1. Check edge function logs for errors
2. Verify trigger is firing: `SELECT * FROM pg_stat_user_functions WHERE funcname = 'trigger_process_url';`
3. Check if `pg_net` extension is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_net';`

**Solution**:
- Verify service role key in vault
- Check edge function deployment status
- Ensure trigger is enabled

### Issue 3: Duplicate URL Errors
**Symptoms**: Error when trying to insert URL that already exists

**Debugging**:
1. Check if unique constraint exists
2. Verify upsert logic in `processRecallUrls()`

**Solution**:
- Ensure using `upsert` with correct `onConflict` parameter
- Verify unique constraint is in place

### Issue 4: Trigger Not Firing
**Symptoms**: Edge function never called after URL insert

**Debugging**:
1. Check trigger exists: `\dS recall_urls` in psql
2. Verify trigger is enabled
3. Check function exists: `\df trigger_process_url`

**Solution**:
```sql
-- Re-enable trigger if disabled
ALTER TABLE recall_urls ENABLE TRIGGER trigger_process_url_on_insert_update;
```

### Issue 5: Edge Function Timeout
**Symptoms**: `url_data` shows "Error: Failed to fetch URL"

**Debugging**:
1. Check if URL is accessible
2. Verify timeout setting (10 seconds)
3. Check edge function logs

**Solution**:
- Increase timeout if needed
- Handle timeout errors gracefully
- URL might be slow or unreachable

## Performance Monitoring

### Monitor Edge Function Performance
```sql
-- Check average processing time
-- Via Supabase Dashboard > Edge Functions > process-url > Metrics
```

### Monitor Database Performance
```sql
-- Check trigger execution count
SELECT 
    schemaname,
    tablename,
    n_tup_ins AS inserts,
    n_tup_upd AS updates
FROM pg_stat_user_tables
WHERE tablename = 'recall_urls';
```

### Monitor URL Processing Success Rate
```sql
SELECT 
    COUNT(*) AS total_urls,
    COUNT(CASE WHEN url_data IS NOT NULL AND url_data NOT LIKE 'Error:%' THEN 1 END) AS processed,
    COUNT(CASE WHEN url_data IS NULL THEN 1 END) AS pending,
    COUNT(CASE WHEN url_data LIKE 'Error:%' THEN 1 END) AS failed,
    ROUND(
        100.0 * COUNT(CASE WHEN url_data IS NOT NULL AND url_data NOT LIKE 'Error:%' THEN 1 END) / COUNT(*),
        2
    ) AS success_rate
FROM recall_urls;
```

## Rollback Plan

If issues arise, you can rollback the changes:

### 1. Disable Trigger
```sql
ALTER TABLE recall_urls DISABLE TRIGGER trigger_process_url_on_insert_update;
```

### 2. Remove Client-Side Integration
```typescript
// In app/note-editor.tsx, comment out:
// processRecallUrls(user.id, recallId, noteData.text)...
```

### 3. Drop Trigger (if needed)
```sql
DROP TRIGGER IF EXISTS trigger_process_url_on_insert_update ON recall_urls;
DROP FUNCTION IF EXISTS trigger_process_url();
```

### 4. Remove Unique Constraint (if needed)
```sql
ALTER TABLE recall_urls DROP CONSTRAINT IF EXISTS recall_urls_user_recall_url_unique;
```

## Success Criteria

The implementation is successful when:

- ✅ URLs are automatically detected in note text
- ✅ URLs are stored in `recall_urls` table
- ✅ Unique constraint prevents duplicates
- ✅ URL content is extracted asynchronously
- ✅ `url_data` is populated with extracted text
- ✅ URLs are removed when deleted from note
- ✅ No URLs stored when note has no URLs
- ✅ No impact on note saving performance
- ✅ No UI changes (as requested)
- ✅ Existing functionality unchanged

## Next Steps

After successful deployment and verification:

1. **Monitor for 24-48 hours**
   - Check edge function logs
   - Monitor database performance
   - Review error rates

2. **Gather Metrics**
   - URL processing success rate
   - Average processing time
   - Common errors

3. **Consider Enhancements**
   - Add URL preview in UI
   - Implement retry logic for failed URLs
   - Add URL content to search index
   - Display URL metadata

## Support

For issues or questions:
1. Check console logs (client-side)
2. Check edge function logs (Supabase Dashboard)
3. Check database logs (PostgreSQL)
4. Review this guide for common issues
5. Verify all deployment steps completed

## Conclusion

This deployment guide provides comprehensive steps to verify the URL processing implementation. Follow the verification steps in order, and use the debugging queries to troubleshoot any issues.

The system is designed to work automatically without user intervention, so successful deployment means URLs are detected, stored, and processed seamlessly in the background.
