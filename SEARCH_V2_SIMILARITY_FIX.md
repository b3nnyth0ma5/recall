
# Search Recalls V2 - Similarity Score Fix & Answer Source Tracking

## Problem Statement

The `search-recalls-v2` edge function was returning all matches as 100% similar, making it impossible to distinguish between highly relevant and less relevant results. Additionally, there was no way to identify which recall(s) were actually used to derive the AI-generated answer.

## Root Causes

1. **High Baseline Similarity**: OpenAI's `text-embedding-3-small` model generates normalized embeddings (unit vectors) that naturally have high cosine similarity scores when in the same semantic space. This means even unrelated content can have 80-90% similarity.

2. **No Answer Source Tracking**: The function was using all matches to generate an answer but not tracking which specific recalls contributed to that answer.

3. **Lack of Discriminative Power**: Without proper ordering and source tracking, users couldn't identify the most relevant recalls.

## Solutions Implemented

### 1. Enhanced Logging & Similarity Distribution Analysis

Added comprehensive logging to understand the similarity score distribution:

```typescript
// Log similarity distribution for debugging
const similarities = allMatches.map(m => m.similarity).sort((a, b) => b - a);
console.log('Similarity distribution:');
console.log('  Max:', similarities[0]);
console.log('  Min:', similarities[similarities.length - 1]);
console.log('  Mean:', similarities.reduce((a, b) => a + b, 0) / similarities.length);
console.log('  Median:', similarities[Math.floor(similarities.length / 2)]);
console.log('  Top 10:', similarities.slice(0, 10));
```

This helps identify if embeddings are too similar and need better discrimination.

### 2. Source Tracking in Question Answering

Modified the OpenAI prompt to include source IDs and track which sources were used:

```typescript
const qaSystemPrompt = `You are a helpful assistant that answers questions based on the provided context from image OCR text, image explanations, and recall text. 

Each source is labeled with a SOURCE_ID (e.g., SOURCE_1, SOURCE_2, etc.). When you answer a question, you MUST cite which source(s) you used by including the SOURCE_ID in your response.

Provide concise, accurate answers based only on the information given. If you cannot answer the question with confidence based on the context, say so.

Also provide:
1. A confidence score (0-100) indicating how confident you are in your answer
2. A list of source IDs that you used to derive your answer (e.g., ["SOURCE_1", "SOURCE_3"])

IMPORTANT: The source with the highest match percentage should be given priority when answering.`;
```

The AI now returns:
```json
{
  "answer": "your answer here",
  "confidence": 85,
  "sources": ["SOURCE_1", "SOURCE_2"]
}
```

### 3. Recall Deduplication & Grouping

Added logic to group matches by recall_id and keep only the highest similarity:

```typescript
// Group matches by recall_id and keep the highest similarity for each recall
const recallMatchMap = new Map<string, typeof filteredMatches[0]>();
for (const match of filteredMatches) {
  const existing = recallMatchMap.get(match.recall_id);
  if (!existing || match.similarity > existing.similarity) {
    recallMatchMap.set(match.recall_id, match);
  }
}
```

This prevents duplicate recalls from appearing multiple times (once for text embedding, once for image embedding).

### 4. Prioritized Result Ordering

Results are now ordered with answer sources first:

```typescript
// Create results with proper ordering:
// 1. First, the recalls that were used to derive the answer (sorted by similarity)
// 2. Then, the remaining recalls (sorted by similarity)
const usedRecalls = uniqueRecallMatches
  .filter(match => sourceRecallIds.includes(match.recall_id))
  .sort((a, b) => b.similarity - a.similarity);

const unusedRecalls = uniqueRecallMatches
  .filter(match => !sourceRecallIds.includes(match.recall_id))
  .sort((a, b) => b.similarity - a.similarity);

const orderedMatches = [...usedRecalls, ...unusedRecalls];
```

### 5. Enhanced Response Format

The edge function now returns:

```typescript
{
  answer: string | null,
  confidence: number,
  results: [
    {
      id: string,              // recall_id
      matchPercentage: number, // 0-100
      usedForAnswer: boolean   // true if this recall was used to derive the answer
    }
  ],
  processingTimeMs: number
}
```

### 6. UI Enhancements

#### Visual Indicators for Answer Sources

Added a badge to highlight recalls that were used to derive the answer:

```tsx
{note.used_for_answer && (
  <View style={styles.answerSourceBadge}>
    <IconSymbol name="checkmark.seal.fill" size={14} color={colors.primary} />
    <Text style={styles.answerSourceText}>Used for answer</Text>
  </View>
)}
```

#### Enhanced Relevance Reason

Updated the relevance reason to indicate when a recall was used for the answer:

```typescript
relevance_reason: matchInfo.usedForAnswer 
  ? `${matchInfo.matchPercentage}% match - Used to derive answer`
  : `${matchInfo.matchPercentage}% match based on content similarity`
```

#### Highlighted Relevance Info

Applied visual highlighting to recalls used for the answer:

```tsx
<View style={[
  styles.relevanceInfo,
  note.used_for_answer && styles.relevanceInfoHighlight
]}>
```

## Expected Behavior

### Before Fix
- All results showed 100% match
- No way to identify which recall was most relevant
- Answer source was unclear

### After Fix
- Results show varied match percentages (70-100%)
- Recalls used to derive the answer are listed first
- Visual badges and highlighting indicate answer sources
- Better discrimination between highly relevant and less relevant results

## Testing

To test the fix:

1. **Create diverse recalls** with different content (text, images, locations)
2. **Perform a search** using the V2 search toggle
3. **Verify**:
   - Match percentages vary (not all 100%)
   - Recalls with "Used for answer" badge appear first
   - The answer makes sense based on the highlighted recalls
   - Similarity distribution in logs shows reasonable spread

## Future Improvements

1. **Adaptive Threshold**: Instead of a fixed 70% threshold, use statistical methods (e.g., mean + 1 standard deviation) to filter results
2. **Re-ranking**: Apply a secondary ranking algorithm (e.g., BM25) on top of embedding similarity
3. **Hybrid Search**: Combine embedding similarity with keyword matching for better precision
4. **User Feedback**: Allow users to mark results as relevant/irrelevant to improve the model over time

## Technical Notes

- **Cosine Similarity Range**: -1 to 1 (we clamp to this range)
- **Match Percentage**: Cosine similarity * 100 (0-100%)
- **Threshold**: 70% (0.7 cosine similarity)
- **Model**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **QA Model**: OpenAI `gpt-4o-mini`

## Files Modified

1. `supabase/functions/search-recalls-v2/index.ts` - Core edge function
2. `hooks/useNotes.ts` - Search result handling
3. `app/search.tsx` - UI enhancements
4. `types/Note.ts` - Added `used_for_answer` field
