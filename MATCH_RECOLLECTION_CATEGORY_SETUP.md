
# Match Recollection Category - Setup Guide

## Overview

The `match-recollection-category` edge function has been updated to automatically categorize recalls (notes) when they are created or updated. This function uses a sophisticated two-step matching process similar to the `new-category-matching` algorithm.

## What's Been Implemented

### 1. Enhanced Edge Function

The edge function now:

- **Triggers on recall creation or update** (via database webhook)
- **Fetches comprehensive recall data** including:
  - Text content
  - Location and location type
  - Image OCR text
  - Image explanations
  - Associated persons
  - Embeddings (text and images)

- **Uses a two-step matching algorithm**:
  1. **Embedding-based similarity search** (>= 0.20 threshold) to find candidate categories
  2. **OpenAI GPT-4o-mini analysis** to rank candidates and assign confidence scores

- **Updates the recollections table** with high-confidence matches (>= 60% confidence)

### 2. Database Triggers

Two triggers have been created on the `recalls` table:

- `on_recall_insert_log` - Fires when a new recall is created
- `on_recall_update_log` - Fires when a recall is updated (only if relevant fields change)

These triggers currently just log the event. The actual matching is triggered via a Supabase Database Webhook.

## Required Setup Steps

### Configure Database Webhook in Supabase Dashboard

You need to manually configure a Database Webhook in the Supabase Dashboard:

1. **Navigate to Database → Webhooks** in your Supabase project dashboard
2. **Click "Create a new hook"**
3. **Configure the webhook**:
   - **Name**: `Match Recollection Category`
   - **Table**: `recalls`
   - **Events**: Select both `INSERT` and `UPDATE`
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/match-recollection-category`
   - **HTTP Headers**:
     - `Content-Type`: `application/json`
     - `Authorization`: `Bearer [YOUR_SERVICE_ROLE_KEY]`
   - **HTTP Params**: Leave empty
   - **Timeout**: `5000` (5 seconds is sufficient for the webhook call; the actual processing happens asynchronously)

4. **Save the webhook**

### Alternative: Manual Triggering

If you prefer not to use automatic webhooks, you can manually trigger the function:

```typescript
// From your app code
const { data, error } = await supabase.functions.invoke('match-recollection-category', {
  body: { recallId: 'your-recall-id' }
});
```

## How It Works

### Step-by-Step Process

1. **User creates or updates a recall** in the app
2. **Database trigger fires** and logs the event
3. **Webhook calls the edge function** with the recall data
4. **Edge function fetches recall details**:
   - Text, location, location type
   - Images with OCR text and explanations
   - Associated persons
   - Embeddings

5. **Generate embeddings if needed**:
   - If recall doesn't have an embedding, generate one from the text

6. **Fetch all user's categories**:
   - Generate embeddings for each category from `category_name`

7. **Calculate similarity scores**:
   - Compare recall text embedding with category embeddings
   - Compare recall image embeddings with category embeddings
   - Take the maximum similarity score

8. **Filter candidates**:
   - Only keep categories with similarity >= 0.20 (20%)

9. **OpenAI analysis**:
   - Send recall context (text, location, images, people) to GPT-4o-mini
   - Send candidate categories with similarity scores
   - GPT-4o-mini analyzes and assigns confidence scores (0-100)
   - Only matches with confidence >= 60 are kept

10. **Update recollections table**:
    - Delete existing recollections for this recall
    - Insert new recollections with match scores

### Matching Algorithm Details

The matching algorithm considers:

- **Text similarity**: Cosine similarity between recall text embedding and category name embedding
- **Image similarity**: Cosine similarity between recall image embeddings and category name embedding
- **Location context**: Passed to OpenAI for semantic understanding
- **Location type**: Passed to OpenAI for semantic understanding
- **Image OCR text**: Passed to OpenAI for semantic understanding
- **Image explanations**: Passed to OpenAI for semantic understanding
- **Associated persons**: Passed to OpenAI for semantic understanding

### Thresholds

- **Similarity threshold**: 0.20 (20%) - Categories below this are not considered
- **Confidence threshold**: 60 - Only matches with 60% or higher confidence are saved
- **Match score**: The confidence score (0-100) is stored in the `recollections.match_score` field

## Performance Optimizations

The function includes several optimizations:

1. **Base64 encoding for embeddings**: Reduces API payload size
2. **Parallel embedding generation**: Categories are processed in parallel
3. **Early exit conditions**: Skips processing if no embeddings or categories exist
4. **Text sanitization**: Truncates long text to reduce OpenAI token usage
5. **Fallback mechanism**: If OpenAI fails, uses similarity-based scoring
6. **Efficient database queries**: Fetches only necessary fields

## Monitoring and Debugging

### Check Edge Function Logs

```bash
# View logs in Supabase Dashboard
# Navigate to Edge Functions → match-recollection-category → Logs
```

### Check Database Logs

```sql
-- Check if triggers are firing
SELECT * FROM pg_stat_user_functions 
WHERE funcname = 'log_recall_modification';
```

### Test the Function Manually

```bash
curl -X POST 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/match-recollection-category' \
  -H 'Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]' \
  -H 'Content-Type: application/json' \
  -d '{"recallId": "your-recall-id"}'
```

## Troubleshooting

### No matches are being created

1. Check if the recall has an embedding (or text to generate one)
2. Check if categories exist for the user
3. Check if similarity scores are above 0.20
4. Check OpenAI API logs for errors
5. Verify webhook is configured correctly

### Matches are incorrect

1. Review the OpenAI analysis in the logs
2. Adjust the confidence threshold if needed
3. Check if category names and descriptions are clear
4. Verify recall content is complete

### Performance issues

1. Check the number of categories (many categories = more embeddings to generate)
2. Monitor OpenAI API response times
3. Consider caching category embeddings (future optimization)

## Future Enhancements

Potential improvements:

1. **Cache category embeddings**: Store embeddings in the database to avoid regenerating
2. **Batch processing**: Process multiple recalls at once
3. **Incremental updates**: Only reprocess if relevant fields changed
4. **User feedback loop**: Allow users to confirm/reject matches to improve accuracy
5. **Custom thresholds**: Allow users to adjust similarity and confidence thresholds

## Database Schema

### Tables Involved

- **recalls**: Source table with recall data
- **recall_images**: Images associated with recalls (OCR, explanations, embeddings)
- **recall_people**: Junction table linking recalls to persons
- **persons**: People mentioned in recalls
- **recollection_categories**: User-defined categories
- **recollections**: Junction table storing recall-category matches with scores

### Key Fields

- `recalls.recall_embedding`: Vector embedding of recall text
- `recall_images.recall_image_embedding`: Vector embedding of image
- `recall_images.ocr_text`: Extracted text from image
- `recall_images.image_explanation`: AI-generated image description
- `recollections.match_score`: Confidence score (0-100) of the match

## Summary

The match-recollection-category edge function is now fully implemented and ready to use. Once you configure the database webhook in the Supabase Dashboard, it will automatically categorize all new and updated recalls based on their content, location, images, and associated people.

The function uses state-of-the-art embedding similarity combined with GPT-4o-mini analysis to ensure accurate and meaningful categorization.
