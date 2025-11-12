
# Deploy Category Matching Function

## Prerequisites

1. **Supabase Project**: Active Supabase project
2. **OpenAI API Key**: Valid OpenAI API key with access to GPT-4o-mini
3. **Categories**: At least one category in the `recollection_categories` table

## Step 1: Verify Database Schema

Ensure the following tables exist with the correct structure:

### Check `recollection_categories` table
```sql
SELECT * FROM recollection_categories;
```

If empty, add some categories:
```sql
INSERT INTO recollection_categories (category_name) VALUES
  ('Food'),
  ('Dessert'),
  ('Recipes'),
  ('Menus'),
  ('Ideas'),
  ('Travel'),
  ('Work'),
  ('Personal'),
  ('Shopping'),
  ('Health');
```

### Check `recollections` table
```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'recollections';
```

Expected columns:
- `id` (bigint)
- `created_at` (timestamp)
- `user_id` (uuid)
- `category_id` (uuid)
- `recall_id` (uuid)

## Step 2: Configure Environment Variables

In Supabase Dashboard → Settings → Edge Functions → Secrets:

```bash
OPENAI_API_KEY=sk-proj-...your-key-here...
```

Verify other required variables are set:
- `SUPABASE_URL` (auto-configured)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-configured)

## Step 3: Deploy Edge Functions

The edge functions have already been deployed via the tool:

1. ✅ `match-recollection-category` - Main categorization function
2. ✅ `ocr-image` - Updated to trigger categorization

To verify deployment:
```bash
# Check function status in Supabase Dashboard
# Navigate to: Edge Functions → match-recollection-category
# Status should be: ACTIVE
```

## Step 4: Test the Function

### Test 1: Manual Invocation

Use the Supabase Dashboard or curl to test:

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/match-recollection-category' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"recallId": "YOUR_RECALL_ID"}'
```

Expected response:
```json
{
  "success": true,
  "recallId": "...",
  "bestMatch": {
    "categoryName": "Food",
    "score": 85
  },
  "allScores": [
    {"categoryId": "...", "categoryName": "Food", "score": 85},
    {"categoryId": "...", "categoryName": "Travel", "score": 45}
  ],
  "processingTimeMs": 2341
}
```

### Test 2: Create a Recall with Images

1. Open the app
2. Create a new recall with descriptive text
3. Add an image (triggers OCR)
4. Save the recall
5. Check logs in Supabase Dashboard

### Test 3: Verify Database Update

```sql
-- Check if recollection was created
SELECT 
  r.id,
  r.recall_id,
  rc.category_name,
  r.created_at
FROM recollections r
JOIN recollection_categories rc ON r.category_id = rc.id
ORDER BY r.created_at DESC
LIMIT 10;
```

## Step 5: Monitor Logs

### View Edge Function Logs

1. Go to Supabase Dashboard
2. Navigate to Edge Functions
3. Click on `match-recollection-category`
4. View the Logs tab

Look for:
- ✅ "Category matching completed successfully"
- ✅ "Category match found: [category] (score: [score])"
- ❌ Any error messages

### View OCR Function Logs

1. Navigate to Edge Functions → `ocr-image`
2. Check for: "Category matching triggered successfully"

## Step 6: Verify Triggers

### Test OCR Trigger
1. Create a recall
2. Add an image
3. Wait for OCR to complete (~5-10 seconds)
4. Check if category was assigned

### Test Save Trigger
1. Edit an existing recall
2. Update the text
3. Save
4. Check if category was updated

### Test Delete Trigger
1. Edit a recall with images
2. Delete an image
3. Check if category was re-evaluated

## Troubleshooting

### Issue: "OpenAI API key missing"
**Solution**: Set `OPENAI_API_KEY` in Edge Function secrets

### Issue: "No categories found in database"
**Solution**: Add categories to `recollection_categories` table

### Issue: "Failed to fetch recall data"
**Solution**: Verify the recall ID exists and user has access

### Issue: Category not assigned (score < 70)
**Solution**: This is expected behavior. The content may not clearly match any category.

### Issue: Wrong category assigned
**Solution**: Review the content and category definitions. Consider adding more specific categories.

### Issue: Function timeout
**Solution**: 
- Check OpenAI API status
- Verify network connectivity
- Review function logs for specific errors

## Performance Benchmarks

Expected performance:
- **Processing Time**: 2-5 seconds per recall
- **API Calls**: 1 OpenAI API call per categorization
- **Database Queries**: 3-4 queries per categorization
- **Success Rate**: >95% (excluding content with no clear category)

## Cost Estimation

### OpenAI API Costs (GPT-4o-mini)
- **Input**: ~$0.00015 per 1K tokens
- **Output**: ~$0.0006 per 1K tokens
- **Average per recall**: ~$0.001-0.003

### Supabase Costs
- Edge Function invocations: Included in free tier (up to 500K/month)
- Database operations: Minimal impact

### Monthly Cost Example
- 1,000 recalls/month: ~$1-3 in OpenAI costs
- 10,000 recalls/month: ~$10-30 in OpenAI costs

## Rollback Plan

If issues occur, you can disable the feature:

### Option 1: Disable Triggers (Temporary)
Comment out the trigger calls in the code:
- `app/note-editor.tsx`: Comment out `triggerCategoryMatching()` calls
- `supabase/functions/ocr-image/index.ts`: Comment out category matching trigger

### Option 2: Pause Edge Function
In Supabase Dashboard:
1. Go to Edge Functions
2. Select `match-recollection-category`
3. Pause the function

### Option 3: Remove Function (Permanent)
```bash
# Delete the edge function
supabase functions delete match-recollection-category
```

## Support

For issues or questions:
1. Check the logs in Supabase Dashboard
2. Review the implementation summary
3. Test with the provided test cases
4. Check OpenAI API status

## Next Steps

After successful deployment:
1. ✅ Monitor logs for the first few days
2. ✅ Review category assignments for accuracy
3. ✅ Adjust scoring thresholds if needed
4. ✅ Consider adding more categories
5. ✅ Plan UI features to display categories to users

## Success Indicators

The deployment is successful if:
- ✅ Edge function shows "ACTIVE" status
- ✅ Test invocation returns expected response
- ✅ Recalls are being categorized automatically
- ✅ Database updates are occurring
- ✅ No errors in function logs
- ✅ User experience is unaffected
