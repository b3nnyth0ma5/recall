
# Embedding URL Testing Guide

## Quick Test Procedure

### Step 1: Create a Test Note with URL

1. Open the app
2. Create a new note with the following text:
   ```
   Check out this article about React: https://react.dev/learn
   ```
3. Save the note

### Step 2: Verify URL Processing

Wait 3-12 seconds for processing, then check:

```sql
-- Find the most recent URL
SELECT 
  id,
  url,
  CASE 
    WHEN url_data IS NULL THEN '❌ Not processed'
    WHEN url_data LIKE 'Error:%' THEN '⚠️ Error: ' || LEFT(url_data, 50)
    ELSE '✅ Processed (' || LENGTH(url_data) || ' chars)'
  END as url_data_status,
  CASE 
    WHEN recall_url_embedding IS NULL THEN '❌ No embedding'
    ELSE '✅ Embedded (' || array_length(recall_url_embedding, 1) || ' dims)'
  END as embedding_status,
  created_at
FROM recall_urls
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result:**
```
url_data_status: ✅ Processed (2000-5000 chars)
embedding_status: ✅ Embedded (1536 dims)
```

### Step 3: Test Search

1. Go to the search screen
2. Search for: "React hooks"
3. Verify the note appears in results
4. Check the match percentage (should be > 20%)

### Step 4: Check Logs

```bash
# Check embedding-url logs
supabase functions logs embedding-url --limit 10

# Check search-recalls-v2 logs
supabase functions logs search-recalls-v2 --limit 10
```

**Expected Log Output (embedding-url):**
```
=== Embedding URL Edge Function Started ===
Processing recall_url_id: [uuid]
No existing embedding found, proceeding with generation
URL data length: 4523
Calling OpenAI Embeddings API...
OpenAI embedding received
Decoded embedding array length: 1536
Updating database with embedding...
=== Embedding processing completed successfully ===
Total processing time: 1234 ms
```

## Detailed Testing Scenarios

### Scenario 1: Simple URL

**Input:**
```
My favorite website: https://example.com
```

**Expected:**
- ✅ URL detected and inserted
- ✅ url_data populated with text content
- ✅ recall_url_embedding generated (1536 dimensions)
- ✅ Searchable via search-recalls-v2

**Verification:**
```sql
SELECT url, 
       LENGTH(url_data) as content_length,
       array_length(recall_url_embedding, 1) as embedding_dims
FROM recall_urls
WHERE url = 'https://example.com';
```

### Scenario 2: Multiple URLs in One Note

**Input:**
```
Check these out:
- https://react.dev
- https://nextjs.org
- https://supabase.com
```

**Expected:**
- ✅ 3 separate records in recall_urls
- ✅ All 3 URLs processed independently
- ✅ All 3 URLs embedded independently
- ✅ All 3 URLs searchable

**Verification:**
```sql
SELECT url, 
       CASE WHEN recall_url_embedding IS NOT NULL THEN '✅' ELSE '❌' END as embedded
FROM recall_urls
WHERE recall_id = 'your-recall-id'
ORDER BY created_at;
```

### Scenario 3: Invalid URL

**Input:**
```
This is not a valid URL: htp://broken-url
```

**Expected:**
- ⚠️ URL might not be detected (depends on URL detection logic)
- OR url_data contains error message

**Verification:**
```sql
SELECT url, url_data
FROM recall_urls
WHERE url LIKE '%broken-url%';
```

### Scenario 4: URL with No Content

**Input:**
```
Empty page: https://httpstat.us/204
```

**Expected:**
- ✅ URL processed
- ⚠️ url_data might be empty or contain error
- ❌ No embedding generated (no content)

**Verification:**
```sql
SELECT url, url_data, recall_url_embedding
FROM recall_urls
WHERE url LIKE '%httpstat.us%';
```

### Scenario 5: Large URL Content

**Input:**
```
Long article: https://en.wikipedia.org/wiki/React_(JavaScript_library)
```

**Expected:**
- ✅ URL processed (limited to 10,000 chars)
- ✅ Embedding generated
- ⏱️ Longer processing time (5-10 seconds)

**Verification:**
```sql
SELECT url, 
       LENGTH(url_data) as content_length,
       array_length(recall_url_embedding, 1) as embedding_dims
FROM recall_urls
WHERE url LIKE '%wikipedia.org%';
```

## Performance Testing

### Test 1: Processing Time

**Measure end-to-end time:**
```sql
-- Create a note with URL at time T0
-- Check when embedding is ready

SELECT 
  url,
  created_at as url_inserted,
  EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_ago,
  CASE 
    WHEN recall_url_embedding IS NOT NULL THEN 'Ready'
    ELSE 'Processing'
  END as status
FROM recall_urls
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:** 3-12 seconds

### Test 2: Search Performance

**Measure search time with URLs:**
```bash
# Time the search request
time curl -X POST https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/search-recalls-v2 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "React hooks"}'
```

**Expected:** < 3 seconds

### Test 3: Concurrent Processing

**Create multiple notes with URLs simultaneously:**
1. Create 5 notes with different URLs
2. Wait 15 seconds
3. Check if all are processed

```sql
SELECT 
  COUNT(*) as total,
  COUNT(url_data) as processed,
  COUNT(recall_url_embedding) as embedded
FROM recall_urls
WHERE created_at > NOW() - INTERVAL '1 minute';
```

**Expected:** All processed within 15 seconds

## Error Testing

### Test 1: Network Error

**Simulate:** Use a URL that times out
```
Slow URL: https://httpstat.us/200?sleep=15000
```

**Expected:**
- ⚠️ process-url times out (10 second limit)
- ⚠️ url_data contains error message
- ❌ No embedding generated

### Test 2: Invalid Content

**Simulate:** Use a URL that returns non-HTML
```
Binary file: https://example.com/image.jpg
```

**Expected:**
- ⚠️ url_data might be empty or contain binary data
- ❌ No embedding generated (or error)

### Test 3: Rate Limiting

**Simulate:** Create many URLs quickly (10+ in 1 minute)

**Expected:**
- ⚠️ Some requests might be rate limited
- ✅ Automatic retry logic kicks in
- ✅ All eventually processed

## Monitoring During Testing

### Real-time Log Monitoring

**Terminal 1: embedding-url logs**
```bash
supabase functions logs embedding-url --tail
```

**Terminal 2: search-recalls-v2 logs**
```bash
supabase functions logs search-recalls-v2 --tail
```

**Terminal 3: process-url logs**
```bash
supabase functions logs process-url --tail
```

### Database Monitoring

**Watch processing in real-time:**
```sql
-- Run this query every 5 seconds
SELECT 
  COUNT(*) as total_urls,
  COUNT(url_data) as processed,
  COUNT(recall_url_embedding) as embedded,
  COUNT(*) - COUNT(recall_url_embedding) as pending
FROM recall_urls
WHERE created_at > NOW() - INTERVAL '5 minutes';
```

## Success Criteria

### ✅ All Tests Pass
- [ ] Simple URL test passes
- [ ] Multiple URLs test passes
- [ ] Search returns URL results
- [ ] Processing time < 12 seconds
- [ ] Search time < 3 seconds
- [ ] No errors in logs
- [ ] Embeddings have 1536 dimensions

### ✅ Performance Acceptable
- [ ] 95% of URLs processed within 12 seconds
- [ ] 99% of searches complete within 3 seconds
- [ ] No rate limiting errors
- [ ] No timeout errors

### ✅ Error Handling Works
- [ ] Invalid URLs handled gracefully
- [ ] Network errors logged properly
- [ ] Rate limiting triggers retry logic
- [ ] No crashes or unhandled exceptions

## Troubleshooting Common Issues

### Issue: "No embedding generated"

**Possible Causes:**
1. url_data is null or empty
2. OpenAI API error
3. Trigger not firing

**Debug Steps:**
```sql
-- Check url_data
SELECT url, url_data FROM recall_urls WHERE id = 'uuid';

-- Check trigger
SELECT * FROM pg_trigger WHERE tgname = 'trigger_embedding_url_on_update';

-- Manually trigger
UPDATE recall_urls SET url_data = url_data WHERE id = 'uuid';
```

### Issue: "Search not returning URL results"

**Possible Causes:**
1. Embedding not generated
2. Similarity too low
3. Search function error

**Debug Steps:**
```sql
-- Check embedding exists
SELECT url, recall_url_embedding FROM recall_urls WHERE id = 'uuid';

-- Check search logs
supabase functions logs search-recalls-v2 --limit 20

-- Test with lower threshold (in search function)
```

### Issue: "Processing taking too long"

**Possible Causes:**
1. Large URL content
2. Network latency
3. OpenAI API slow

**Debug Steps:**
```bash
# Check logs for timing
supabase functions logs embedding-url --limit 10

# Check URL size
SELECT url, LENGTH(url_data) FROM recall_urls WHERE id = 'uuid';
```

## Test Report Template

```markdown
# Embedding URL Test Report

**Date:** YYYY-MM-DD
**Tester:** Your Name

## Test Results

### Basic Functionality
- [ ] Simple URL: PASS/FAIL
- [ ] Multiple URLs: PASS/FAIL
- [ ] Search Integration: PASS/FAIL

### Performance
- Average Processing Time: X seconds
- Average Search Time: X seconds
- Success Rate: X%

### Error Handling
- Invalid URLs: PASS/FAIL
- Network Errors: PASS/FAIL
- Rate Limiting: PASS/FAIL

## Issues Found
1. Issue description
2. Issue description

## Recommendations
1. Recommendation
2. Recommendation

## Overall Status
✅ PASS / ❌ FAIL / ⚠️ NEEDS WORK
```

## Next Steps After Testing

1. **If all tests pass:**
   - ✅ Mark deployment as successful
   - ✅ Monitor for 24 hours
   - ✅ Document any edge cases

2. **If tests fail:**
   - ❌ Review logs for errors
   - ❌ Check configuration
   - ❌ Fix issues and re-test

3. **If performance issues:**
   - ⚠️ Optimize query
   - ⚠️ Adjust timeouts
   - ⚠️ Consider caching

---

**Happy Testing! 🚀**
