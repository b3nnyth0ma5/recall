
# Category Matching - Quick Reference

## Automatic Recall Categorization

### How to Enable

**Configure Database Webhook in Supabase Dashboard:**

1. Go to **Database → Webhooks**
2. Click **"Create a new hook"**
3. Set:
   - Table: `recalls`
   - Events: `INSERT`, `UPDATE`
   - URL: `https://[PROJECT_REF].supabase.co/functions/v1/match-recollection-category`
   - Headers: `Authorization: Bearer [SERVICE_ROLE_KEY]`

### How It Works

```
New/Updated Recall
    ↓
Database Trigger
    ↓
Webhook → Edge Function
    ↓
Fetch recall data (text, location, images, people)
    ↓
Generate embeddings
    ↓
Find candidate categories (similarity >= 20%)
    ↓
OpenAI analysis (confidence >= 60%)
    ↓
Update recollections table
```

### What Gets Matched

- ✅ Recall text
- ✅ Location and location type
- ✅ Image OCR text
- ✅ Image explanations
- ✅ Associated persons
- ✅ All embeddings (text + images)

### Thresholds

- **Similarity**: >= 20% (0.20)
- **Confidence**: >= 60%
- **Match Score**: 0-100 (stored in `recollections.match_score`)

### Manual Trigger

```typescript
// Trigger matching for a specific recall
const { data, error } = await supabase.functions.invoke(
  'match-recollection-category',
  { body: { recallId: 'recall-uuid' } }
);
```

### Response Format

```json
{
  "success": true,
  "recallId": "uuid",
  "candidateCount": 5,
  "matchCount": 2,
  "matches": [
    {
      "categoryId": "uuid",
      "confidence": 85,
      "similarity": 75,
      "reason": "Strong match based on text and location"
    }
  ],
  "processingTimeMs": 1234
}
```

### Monitoring

**Check logs:**
- Supabase Dashboard → Edge Functions → match-recollection-category → Logs

**Check recollections:**
```sql
SELECT 
  r.text,
  rc.category_name,
  rec.match_score
FROM recollections rec
JOIN recalls r ON r.id = rec.recall_id
JOIN recollection_categories rc ON rc.id = rec.category_id
WHERE rec.recall_id = 'your-recall-id'
ORDER BY rec.match_score DESC;
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| No matches created | Check if recall has text/embedding and categories exist |
| Wrong matches | Review category names/descriptions for clarity |
| Slow performance | Check number of categories and OpenAI API response time |
| Webhook not firing | Verify webhook configuration in Supabase Dashboard |

### Performance

- **Average processing time**: 1-3 seconds
- **Scales with**: Number of categories, number of images
- **Optimizations**: Parallel embedding generation, text truncation, fallback mechanism

### Database Tables

```
recalls (source)
  ↓
recall_images (OCR, explanations, embeddings)
recall_people → persons (people names)
  ↓
recollections (matches with scores)
  ↓
recollection_categories (target)
```
