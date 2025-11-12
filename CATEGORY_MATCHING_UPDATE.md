
# Category Matching Update - Multiple Categories Support

## Overview
The `match-recollection-category` edge function has been updated to support matching a recall to **multiple categories** instead of just one. This allows recalls to be properly categorized when they are relevant to more than one category.

## What Changed

### Previous Behavior
- The function would find the **single best matching category** with the highest score
- Only one category would be stored in the `recollections` table per recall
- The `match_score` column was not being populated

### New Behavior
- The function now finds **ALL categories** with a score >= 70
- Multiple entries are created in the `recollections` table for each matching category
- The `match_score` column is now populated with the actual relevance score (0-100)
- If no categories match (all scores < 70), any existing recollections are removed

## Technical Details

### Database Structure
The `recollections` table supports multiple entries per recall:
- **No unique constraint** on `recall_id`, allowing multiple rows per recall
- Each row represents one category match
- The `match_score` column stores the relevance score (0-100)

### Edge Function Logic

1. **Fetch Data**: Retrieves recall text, location, and all associated images with OCR data
2. **Score Categories**: Uses OpenAI to score ALL categories (0-100) based on relevance
3. **Filter Matches**: Identifies all categories with score >= 70
4. **Update Database**:
   - Deletes all existing recollections for the recall
   - Inserts new entries for each matching category with their scores
   - If no matches found, leaves the recall uncategorized

### Example Response
```json
{
  "success": true,
  "recallId": "abc-123",
  "matchCount": 2,
  "matches": [
    {
      "categoryName": "Food",
      "score": 85
    },
    {
      "categoryName": "Travel",
      "score": 72
    }
  ],
  "allScores": [
    { "categoryId": "...", "categoryName": "Food", "score": 85 },
    { "categoryId": "...", "categoryName": "Travel", "score": 72 },
    { "categoryId": "...", "categoryName": "Work", "score": 45 }
  ],
  "processingTimeMs": 5234
}
```

## Scoring Criteria

The OpenAI prompt instructs the model to score categories as follows:
- **0-30**: Not relevant or barely related
- **31-50**: Somewhat related but not a good match
- **51-69**: Related but not the best category
- **70-85**: Good match, clearly relevant ✅
- **86-100**: Excellent match, highly relevant ✅

Only categories scoring **70 or above** are stored in the database.

## Triggers

The function is automatically triggered when:
1. **OCR processing completes** on an image
2. **An image is deleted** from a recall
3. **A note is saved or updated**

## Database Query Examples

### Get all categories for a recall
```sql
SELECT 
  rc.category_name,
  r.match_score
FROM recollections r
JOIN recollection_categories rc ON r.category_id = rc.id
WHERE r.recall_id = 'your-recall-id'
ORDER BY r.match_score DESC;
```

### Get all recalls in a category
```sql
SELECT 
  recalls.*,
  r.match_score
FROM recollections r
JOIN recalls ON r.recall_id = recalls.id
JOIN recollection_categories rc ON r.category_id = rc.id
WHERE rc.category_name = 'Food'
ORDER BY r.match_score DESC;
```

### Get recalls matching multiple categories
```sql
SELECT 
  recalls.id,
  recalls.text,
  array_agg(rc.category_name) as categories,
  array_agg(r.match_score) as scores
FROM recollections r
JOIN recalls ON r.recall_id = recalls.id
JOIN recollection_categories rc ON r.category_id = rc.id
GROUP BY recalls.id, recalls.text
HAVING COUNT(DISTINCT r.category_id) > 1
ORDER BY COUNT(DISTINCT r.category_id) DESC;
```

## Benefits

1. **More Accurate Categorization**: Recalls can belong to multiple relevant categories
2. **Better Search/Filtering**: Users can find recalls through multiple category paths
3. **Score Transparency**: The match_score shows how confident the categorization is
4. **Flexible Queries**: Can filter by minimum score threshold or category combinations

## No UI/UX Changes

As requested, **no changes were made to the UI or UX**. The app will continue to function exactly as before, but the backend now supports richer categorization data that can be leveraged in future UI updates.

## Deployment

The edge function has been successfully deployed as **version 2** and is now active.

Function URL: `https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/match-recollection-category`

## Testing

To test the new functionality:

1. Create or update a recall with text/images that could match multiple categories
2. Check the `recollections` table to see multiple entries for the same recall
3. Verify that the `match_score` column contains values between 70-100
4. Try creating a recall that doesn't match any category well (all scores < 70) and verify no recollections are created

## Future Enhancements

Potential UI improvements that could leverage this new functionality:
- Display all matching categories on a recall card
- Show match scores as confidence indicators
- Filter recalls by category combinations
- Sort by match score within a category
- Suggest categories to users based on their content
