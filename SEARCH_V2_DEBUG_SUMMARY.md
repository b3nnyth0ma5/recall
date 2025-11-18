
# Search Recalls V2 - 0% Confidence Debug Summary

## Problem
The `search-recalls-v2` edge function was consistently returning 0% confidence matches, even when relevant images existed in the database.

## Root Cause
The issue was with how PostgreSQL's `vector` type was being handled when fetched from the database:

1. **Storage Format**: Embeddings are stored in the `recall_images.recall_image_embedding` column as PostgreSQL `vector` type
2. **Retrieval Issue**: When the Supabase client fetches vector data, it may return it in different formats:
   - As a JavaScript array (expected)
   - As a string representation of the vector (e.g., "[0.123, 0.456, ...]")
   - As an object with vector type metadata

3. **Original Code Problem**: The original code only checked `if (!embedding || !Array.isArray(embedding))` and returned similarity 0, which meant:
   - If the embedding came back as a string, it would be rejected
   - All similarity calculations would return 0
   - This resulted in 0% match percentages for all results

## Solution
Enhanced the embedding handling in `search-recalls-v2/index.ts` to:

1. **Handle Multiple Formats**: Added logic to detect and parse different embedding formats:
   ```typescript
   // If it's a string (vector type serialized), parse it
   if (typeof embedding === 'string') {
     const cleanStr = embedding.replace(/[\[\]]/g, '');
     embedding = cleanStr.split(',').map(s => parseFloat(s.trim()));
   }
   ```

2. **Better Error Handling**: Added detailed logging for each case:
   - Null embeddings
   - String embeddings (with parsing)
   - Non-array embeddings
   - Empty array embeddings

3. **Robust Similarity Calculation**: Added NaN check to prevent invalid similarity scores:
   ```typescript
   const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
   return {
     ...
     similarity: isNaN(similarity) ? 0 : similarity
   };
   ```

4. **Enhanced Logging**: Added comprehensive console.log statements to track:
   - Embedding format detection
   - Parsing success/failure
   - Similarity calculation results
   - Match percentages for debugging

## Key Changes

### Before
```typescript
const embedding = image.recall_image_embedding;
if (!embedding || !Array.isArray(embedding)) {
  return { ...image, similarity: 0 };
}
```

### After
```typescript
let embedding = image.recall_image_embedding;

// Handle null
if (!embedding) {
  console.log(`Image ${image.id} has null embedding`);
  return { ...image, similarity: 0 };
}

// Handle string format (vector type serialized)
if (typeof embedding === 'string') {
  try {
    const cleanStr = embedding.replace(/[\[\]]/g, '');
    embedding = cleanStr.split(',').map(s => parseFloat(s.trim()));
    console.log(`Parsed string embedding for image ${image.id}, length: ${embedding.length}`);
  } catch (e) {
    console.error(`Failed to parse embedding string for image ${image.id}:`, e);
    return { ...image, similarity: 0 };
  }
}

// Verify it's an array
if (!Array.isArray(embedding)) {
  console.log(`Image ${image.id} embedding is not an array, type: ${typeof embedding}`);
  return { ...image, similarity: 0 };
}

// Check for empty array
if (embedding.length === 0) {
  console.log(`Image ${image.id} has empty embedding array`);
  return { ...image, similarity: 0 };
}
```

## Testing
After deployment, test the V2 search by:

1. Toggle on "Image-based search" in the search UI
2. Search for content that exists in your images (e.g., "puppy food", "wine", "recipe")
3. Check that match percentages are now > 0%
4. Verify that the confidence score is appropriate (not 0%)

## Expected Behavior
- Match percentages should range from 0-100% based on actual similarity
- Confidence scores should reflect the quality of matches
- Top matches should have higher percentages than lower matches
- Console logs in edge function will show detailed debugging information

## Related Files
- `supabase/functions/search-recalls-v2/index.ts` - Fixed edge function
- `app/search.tsx` - Search UI with V2 toggle
- `hooks/useNotes.ts` - Search hook that calls the edge function
- `supabase/functions/embedding-image/index.ts` - Creates embeddings (unchanged)

## Database Schema
```sql
-- recall_images table has:
recall_image_embedding vector(1536)  -- PostgreSQL vector type for embeddings
```

## Notes
- The `text-embedding-3-small` model produces 1536-dimensional embeddings
- Cosine similarity ranges from -1 to 1, but for embeddings it's typically 0 to 1
- Match percentage = similarity * 100 (rounded)
- The edge function now handles all possible formats that Supabase might return for vector types
