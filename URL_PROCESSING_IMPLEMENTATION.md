
# URL Processing Implementation

## Overview
This implementation adds automatic URL detection, storage, and processing functionality to the Recalls app. When a note is created or updated, any URLs in the text are automatically detected, stored, and processed to extract their content.

## Components Implemented

### 1. Database Schema Updates

#### Unique Constraint on `recall_urls`
- **Migration**: `add_unique_constraint_recall_urls`
- **Purpose**: Ensures that the combination of `(user_id, recall_id, url)` is unique
- **Benefit**: Prevents duplicate URL entries for the same note

### 2. Edge Function: `process-url`

#### Purpose
Extracts text content from URLs asynchronously without blocking the main application flow.

#### Features
- Fetches HTML content from provided URLs
- Strips HTML tags and extracts plain text
- Handles common HTML entities
- Limits extracted text to 10,000 characters
- Updates `recall_urls.url_data` with extracted content
- Handles errors gracefully (timeouts, invalid URLs, fetch failures)

#### Input
```typescript
{
  url: string;              // Required: The URL to process
  recall_url_id?: string;   // Optional: ID to update in database
}
```

#### Output
```typescript
{
  success: boolean;
  text?: string;           // Extracted text content
  error?: string;          // Error message if failed
}
```

#### Key Features
- 10-second timeout for URL fetching
- User-Agent header for better compatibility
- Automatic database updates when `recall_url_id` is provided
- Error handling with database updates

### 3. Database Trigger: `trigger_process_url_on_insert_update`

#### Purpose
Automatically calls the `process-url` edge function whenever a URL is inserted or updated in the `recall_urls` table.

#### Behavior
- Triggers on `INSERT` or `UPDATE` of the `url` column
- Makes asynchronous HTTP request to `process-url` edge function
- Uses service role key from vault for authentication
- Logs request ID for debugging

#### Implementation Details
- Uses `pg_net` extension for HTTP requests
- Runs with `SECURITY DEFINER` to access vault
- Non-blocking (asynchronous) execution

### 4. Client-Side URL Processing: `utils/urlProcessor.ts`

#### Functions

##### `extractUrls(text: string): string[]`
- Extracts all URLs from text using regex
- Returns array of unique URLs
- Handles empty/null text gracefully

##### `hasUrls(text: string): boolean`
- Quick check if text contains any URLs
- Used for UI rendering decisions

##### `processRecallUrls(userId, recallId, noteText): Promise`
- Main function called when saving notes
- Extracts URLs from note text
- Compares with existing URLs in database
- Inserts new URLs
- Removes URLs no longer in text
- Handles edge cases (no URLs, all URLs removed, etc.)

##### `getRecallUrls(recallId): Promise`
- Retrieves all URLs for a specific recall
- Returns URL data including extracted content
- Useful for displaying URL information in UI

### 5. Integration in Note Editor

#### Changes to `app/note-editor.tsx`
- Imports `processRecallUrls` from URL processor utility
- Calls `processRecallUrls` after note save
- Runs asynchronously to avoid blocking UI
- Logs success/failure for debugging

#### Execution Flow
1. User saves note with text containing URLs
2. Note is saved to database
3. `processRecallUrls` is called with note text
4. URLs are extracted and compared with existing entries
5. Database is updated (insert new, delete removed)
6. Database trigger fires for each new/updated URL
7. `process-url` edge function is called asynchronously
8. URL content is fetched and processed
9. `recall_urls.url_data` is updated with extracted text

## Data Flow

```
User saves note with URLs
         ↓
Note saved to database
         ↓
processRecallUrls() called
         ↓
URLs extracted from text
         ↓
Compare with existing URLs
         ↓
Insert new URLs / Delete removed URLs
         ↓
Database trigger fires
         ↓
process-url edge function called (async)
         ↓
URL content fetched
         ↓
Text extracted from HTML
         ↓
recall_urls.url_data updated
```

## Key Features

### 1. Automatic URL Detection
- Uses regex pattern: `/(https?:\/\/[^\s]+)/g`
- Detects both HTTP and HTTPS URLs
- Handles multiple URLs in single note

### 2. Accurate Representation
- Compares current URLs with database
- Adds new URLs
- Removes URLs no longer in text
- Maintains data consistency

### 3. Unique Constraint
- Prevents duplicate entries
- Uses `(user_id, recall_id, url)` as unique key
- Handles upsert operations gracefully

### 4. Asynchronous Processing
- URL content extraction runs in background
- Doesn't block note saving
- Uses database triggers for automation
- Edge function handles all processing

### 5. Error Handling
- Validates URL format
- Handles fetch failures
- Manages timeouts (10 seconds)
- Updates database with error messages
- Logs all operations for debugging

## Usage Examples

### Saving a Note with URLs
```typescript
// User types note with URLs
const noteText = "Check out https://example.com and https://github.com";

// Note is saved (existing flow)
await addNote({ text: noteText, ... });

// URLs are automatically processed
// No additional code needed in UI
```

### Updating a Note
```typescript
// User edits note, removes one URL
const updatedText = "Check out https://example.com";

// Note is updated (existing flow)
await updateNote(noteId, { text: updatedText, ... });

// URL processing automatically:
// - Keeps https://example.com
// - Removes https://github.com entry
```

### Retrieving URL Data
```typescript
import { getRecallUrls } from '@/utils/urlProcessor';

const urls = await getRecallUrls(recallId);
// Returns: [
//   {
//     id: "uuid",
//     url: "https://example.com",
//     url_data: "Extracted text content...",
//     created_at: "2024-01-01T00:00:00Z"
//   }
// ]
```

## Database Schema

### `recall_urls` Table
```sql
CREATE TABLE recall_urls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_id UUID REFERENCES recalls(id),
  user_id UUID REFERENCES auth.users(id),
  url TEXT NOT NULL,
  url_data TEXT,  -- Extracted content from URL
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT recall_urls_user_recall_url_unique 
    UNIQUE (user_id, recall_id, url)
);
```

## Security Considerations

### Row Level Security (RLS)
- Existing RLS policies on `recall_urls` table
- Users can only access their own URLs
- Authenticated users required for insert/update
- Delete restricted to own records

### Edge Function Security
- Uses JWT verification
- Service role key stored in vault
- CORS headers configured
- Input validation on all requests

### Database Trigger Security
- Runs with `SECURITY DEFINER`
- Accesses vault for service role key
- Grants limited to necessary roles

## Performance Considerations

### Asynchronous Processing
- URL fetching doesn't block note saving
- Database trigger fires after commit
- Edge function runs independently
- User experience remains smooth

### Text Limiting
- Extracted text limited to 10,000 characters
- Prevents excessive database storage
- Maintains reasonable processing time

### Timeout Handling
- 10-second timeout for URL fetching
- Prevents hanging requests
- Error recorded in database

## Testing

### Manual Testing Steps
1. Create a note with a URL
2. Verify URL appears in `recall_urls` table
3. Wait for processing (check `url_data` column)
4. Update note to add another URL
5. Verify both URLs in database
6. Remove one URL from note
7. Verify removed URL deleted from database
8. Create note without URLs
9. Verify no entries in `recall_urls`

### Edge Cases Handled
- Empty text
- Text with no URLs
- Multiple URLs in single note
- Duplicate URLs in same note
- Invalid URL formats
- URLs that fail to fetch
- URLs with no text content
- Timeout scenarios

## Future Enhancements

### Potential Improvements
1. **URL Preview Cards**: Display rich previews in UI
2. **Metadata Extraction**: Extract title, description, images
3. **Link Validation**: Check if URLs are still valid
4. **Content Summarization**: Use AI to summarize URL content
5. **Search Integration**: Include URL content in search results
6. **Batch Processing**: Process multiple URLs in parallel
7. **Caching**: Cache URL content to avoid re-fetching

### UI Enhancements
1. Show URL processing status in note editor
2. Display extracted content in expandable sections
3. Add manual refresh button for URL content
4. Show error states for failed URL processing
5. Add URL preview thumbnails

## Troubleshooting

### URLs Not Being Detected
- Check regex pattern in `extractUrls()`
- Verify URL format (must start with http:// or https://)
- Check console logs for extraction results

### URL Content Not Updating
- Verify database trigger is enabled
- Check edge function logs
- Verify service role key in vault
- Check `pg_net` extension is enabled

### Duplicate URL Errors
- Verify unique constraint is in place
- Check upsert logic in `processRecallUrls()`
- Review database logs for constraint violations

## Conclusion

This implementation provides a robust, automatic URL processing system that:
- Detects URLs in note text
- Stores URLs with unique constraints
- Extracts content asynchronously
- Maintains data consistency
- Handles errors gracefully
- Doesn't impact user experience

The system is fully integrated into the existing note-saving flow and requires no additional user interaction.
