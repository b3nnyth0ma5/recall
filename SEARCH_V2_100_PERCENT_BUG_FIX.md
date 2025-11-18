
# Search Recalls V2 - 100% Match Bug Fix

## Problem
All recall matches in the search-recalls-v2 edge function were showing as 100% match, regardless of the actual similarity between the search query and the stored recalls.

## Root Cause
The bug was in the `calculateCosineSimilarity` function. The function was comparing each stored embedding **with itself** instead of comparing it with the query embedding.

### Buggy Code
```typescript
const calculateCosineSimilarity = (embedding: any): number => {
  // ... parsing code ...
  
  const minLength = Math.min(embeddingArray.length, embeddingArray.length);
  
  for (let i = 0; i < minLength; i++) {
    const a = embeddingArray[i];
    const b = embeddingArray[i];  // BUG: Both a and b are from the same array!
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  
  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return isNaN(similarity) ? 0 : similarity;
};
```

When you calculate cosine similarity of a vector with itself, you always get 1.0 (100% similarity), which is mathematically correct but not what we wanted.

## Solution
The fix involved:

1. **Renamed the query embedding variable** from `embeddingArray` to `queryEmbedding` for clarity
2. **Updated the function signature** to accept `storedEmbedding` as a parameter
3. **Fixed the comparison** to compare `queryEmbedding[i]` with `storedEmbeddingArray[i]`
4. **Added better logging** to help debug dimension mismatches and other issues
5. **Added validation** to ensure both embeddings have the same dimensions

### Fixed Code
```typescript
const calculateCosineSimilarity = (storedEmbedding: any): number => {
  // ... parsing code to convert storedEmbedding to storedEmbeddingArray ...
  
  // Check if dimensions match
  if (storedEmbeddingArray.length !== queryEmbedding.length) {
    console.log(`Dimension mismatch: stored=${storedEmbeddingArray.length}, query=${queryEmbedding.length}`);
    return 0;
  }

  // Cosine similarity calculation: (A · B) / (||A|| * ||B||)
  let dotProduct = 0;
  let normA = 0;  // Norm of query embedding
  let normB = 0;  // Norm of stored embedding

  for (let i = 0; i < queryEmbedding.length; i++) {
    const queryVal = queryEmbedding[i];
    const storedVal = storedEmbeddingArray[i];
    
    dotProduct += queryVal * storedVal;  // Now comparing different vectors!
    normA += queryVal * queryVal;
    normB += storedVal * storedVal;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (denominator === 0) {
    console.log('Denominator is zero, returning 0 similarity');
    return 0;
  }

  const similarity = dotProduct / denominator;
  
  // Clamp to [-1, 1] range
  const clampedSimilarity = Math.max(-1, Math.min(1, similarity));
  
  if (isNaN(clampedSimilarity)) {
    console.log('Similarity calculation resulted in NaN');
    return 0;
  }

  return clampedSimilarity;
};
```

## Expected Behavior After Fix
- Match percentages will now vary based on actual similarity between the query and stored recalls
- Only recalls with >= 70% similarity will be returned
- The match percentages will accurately reflect how similar each recall is to the search query
- You should see a range of percentages (e.g., 95%, 87%, 73%) instead of all 100%

## Testing
To verify the fix works:
1. Create several recalls with different content
2. Search for something specific
3. Check that match percentages vary and reflect actual relevance
4. Verify that irrelevant recalls (< 70% match) are filtered out

## Deployment
The fixed edge function has been deployed as version 5 of search-recalls-v2.
