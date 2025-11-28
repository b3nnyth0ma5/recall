
# People Finder Implementation Summary

## Overview
Successfully implemented a Supabase edge function called "people-finder" that extracts person names from text and images using OpenAI's NLP Named Entity Recognition (NER).

## What Was Implemented

### 1. Database Schema Updates
Added unique constraints to ensure data integrity:

**persons table:**
- Unique constraint on `(user_id, person_name)` to prevent duplicate person entries per user

**recall_people table:**
- Unique constraint on `(user_id, recall_id, person_id)` to prevent duplicate associations

### 2. People Finder Edge Function
Created a new edge function at `supabase/functions/people-finder/index.ts` with the following features:

**Functionality:**
- Accepts `recall_id`, `user_id`, `text`, and `image_explanation` as input
- Combines text from `recalls.text` and `recall_images.image_explanation`
- Uses OpenAI GPT-4o-mini model for cost-effective Named Entity Recognition
- Extracts person names from the combined text
- Eliminates duplicate names (case-insensitive comparison)
- Capitalizes first letter of each name part (first name and/or last name)
- Upserts records into `persons` table (respecting unique constraint)
- Upserts records into `recall_people` table (respecting unique constraint)

**Key Features:**
- Robust error handling with detailed logging
- Retry logic with exponential backoff for transient failures
- Proper name capitalization (e.g., "john smith" → "John Smith")
- Duplicate elimination across variations (e.g., "John Smith" and "john smith" treated as same)
- Graceful handling of edge cases (no names found, API failures, etc.)
- Comprehensive response with processing statistics

**OpenAI NER System Prompt:**
The function uses a specialized system prompt that:
- Extracts ALL person names (first names, last names, or full names)
- Excludes titles (Mr., Mrs., Dr., etc.)
- Excludes fictional characters and brand names
- Returns "NO_NAMES_FOUND" when no person names are detected

### 3. OCR Image Function Update
Updated `supabase/functions/ocr-image/index.ts` to trigger the people-finder function:

**Integration:**
- After OCR processing completes successfully
- Fetches the recall text from the database
- Triggers people-finder function **asynchronously** (non-blocking)
- Passes combined text from recall and image explanation
- Continues execution without waiting for people-finder response

**Asynchronous Execution:**
The people-finder function is called using `fetch()` without `await`, making it truly asynchronous:
```typescript
fetch(`${supabaseUrl}/functions/v1/people-finder`, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ ... }),
})
  .then(async (response) => { ... })
  .catch((error) => { ... });
```

## Workflow

1. **Image Upload** → User uploads an image with a recall
2. **OCR Processing** → `ocr-image` function extracts text and generates explanation
3. **Database Update** → OCR results saved to `recall_images` table
4. **Embedding Generation** → Image embeddings created for search
5. **People Finder Trigger** → `people-finder` function called asynchronously
6. **Name Extraction** → OpenAI NER extracts person names from text
7. **Database Updates** → Names saved to `persons` and `recall_people` tables

## Database Tables

### persons
```sql
- id (uuid, primary key)
- user_id (uuid, foreign key to auth.users)
- person_name (text)
- created_at (timestamp)
- UNIQUE CONSTRAINT: (user_id, person_name)
```

### recall_people
```sql
- id (uuid, primary key)
- user_id (uuid, foreign key to auth.users)
- recall_id (uuid, foreign key to recalls)
- person_id (uuid, foreign key to persons)
- created_at (timestamp)
- UNIQUE CONSTRAINT: (user_id, recall_id, person_id)
```

## Example Usage

### Input
```json
{
  "recall_id": "123e4567-e89b-12d3-a456-426614174000",
  "user_id": "987fcdeb-51a2-43f7-8b9c-123456789abc",
  "text": "Had lunch with john smith and sarah johnson today",
  "image_explanation": "Photo shows Dr. Michael Brown at the conference"
}
```

### Output
```json
{
  "success": true,
  "recall_id": "123e4567-e89b-12d3-a456-426614174000",
  "names": ["John Smith", "Sarah Johnson", "Michael Brown"],
  "totalNamesFound": 3,
  "successfullyProcessed": 3,
  "processingTimeMs": 1234
}
```

## Benefits

1. **Automatic Person Detection** - No manual tagging required
2. **Duplicate Prevention** - Unique constraints ensure data integrity
3. **Smart Capitalization** - Names are properly formatted
4. **Asynchronous Processing** - Doesn't slow down OCR workflow
5. **Cost-Effective** - Uses GPT-4o-mini for optimal cost/performance
6. **Robust Error Handling** - Gracefully handles API failures and edge cases
7. **Comprehensive Logging** - Easy debugging and monitoring

## Environment Variables Required

The following environment variables must be set in Supabase:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin access
- `OPENAI_API_KEY` - OpenAI API key for NER

## Testing

To test the people-finder function manually:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/people-finder \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recall_id": "your-recall-id",
    "user_id": "your-user-id",
    "text": "Met with Alice Johnson and Bob Smith",
    "image_explanation": "Photo of the team meeting"
  }'
```

## Future Enhancements

Potential improvements for future iterations:
- Add person disambiguation (same name, different people)
- Support for nicknames and aliases
- Relationship extraction (e.g., "my friend John")
- Person entity linking to external databases
- Confidence scores for extracted names
- Support for non-English names
- Batch processing for multiple recalls

## Deployment Status

✅ Database migration applied successfully
✅ people-finder edge function deployed (version 1)
✅ ocr-image edge function updated (version 20)
✅ All edge functions active and operational

## Notes

- The function runs asynchronously and does not block the OCR workflow
- Names are case-insensitive for duplicate detection but properly capitalized in output
- The function gracefully handles cases where no names are found
- Upsert operations ensure idempotency (safe to run multiple times)
- RLS policies are already in place for both tables
