
# AI-Powered Search Implementation

## Overview

This implementation adds OpenAI-powered search with Named Entity Recognition (NER) to the recalls app. The search analyzes the "text", "latitude", "longitude", and "location" columns in the "recalls" Supabase table to find the top 10 best matching recalls.

## Architecture

### 1. Supabase Edge Function: `search-recalls`

**Location**: Deployed as a Supabase Edge Function

**Purpose**: Performs AI-powered analysis of recalls using OpenAI's GPT-4o-mini model

**Key Features**:
- Authenticates users via Supabase Auth
- Fetches all user's recalls from the database
- Uses OpenAI Chat Completions API with structured prompts
- Implements Named Entity Recognition (NER) on both search query and recall data
- Analyzes semantic meaning and context
- Scores recalls based on relevance (0-100)
- Returns top 10 results sorted by relevance

**API Endpoint**: `POST /functions/v1/search-recalls`

**Request Body**:
```json
{
  "query": "search text",
  "limit": 10
}
```

**Response**:
```json
{
  "results": [
    {
      "id": "recall-id",
      "text": "recall text",
      "location": "location name",
      "latitude": 123.456,
      "longitude": 789.012,
      "relevance_score": 95,
      "relevance_reason": "Exact match for product name and location"
    }
  ],
  "total": 10,
  "query": "search text"
}
```

### 2. Frontend Integration

**Modified Files**:
- `hooks/useNotes.ts`: Updated `searchNotes` function to call the edge function
- `app/search.tsx`: Enhanced UI to show AI-powered search indicators and relevance scores
- `types/Note.ts`: Added `relevance_score` and `relevance_reason` fields

**Key Features**:
- Calls the `search-recalls` edge function for AI-powered search
- Falls back to basic SQL search if edge function fails
- Displays relevance scores and reasons for each result
- Shows "AI-powered search with NER" indicator
- Enhanced loading state with "Analyzing with AI..." message

## How It Works

### 1. Search Flow

1. User enters a search query
2. Frontend calls `searchNotes(query)` from `useNotes` hook
3. Hook invokes the `search-recalls` edge function with the query
4. Edge function:
   - Fetches all user's recalls from database
   - Constructs a detailed prompt for OpenAI
   - Sends recall data and query to OpenAI for analysis
   - Receives scored results with relevance explanations
5. Frontend receives scored results and loads images
6. Results are displayed with relevance scores and reasons

### 2. NER Analysis

The OpenAI model performs:
- **Entity Extraction**: Identifies people, places, organizations, dates, products, etc.
- **Semantic Analysis**: Understands context and meaning beyond keywords
- **Location Matching**: Considers geographic proximity if coordinates are present
- **Relevance Scoring**: Assigns 0-100 score based on multiple factors
- **Explanation Generation**: Provides human-readable reason for each match

### 3. Scoring Criteria

The AI considers:
- Exact text matches (highest priority)
- Semantic similarity and related concepts
- Location name matches
- Geographic proximity (latitude/longitude)
- Named entity matches (same person, place, product, etc.)
- Contextual relevance

## Environment Variables

Required in Supabase Edge Functions:
- `OPENAI_API_KEY`: Your OpenAI API key
- `SUPABASE_URL`: Automatically provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Automatically provided by Supabase

## UI Enhancements

### Search Screen Features

1. **AI Indicator**: Shows "AI-powered search with NER" badge when using AI search
2. **Sparkles Icon**: Visual indicator for AI-powered functionality
3. **Relevance Cards**: Each result shows:
   - Star icon with percentage match score
   - Brief explanation of why it matched
4. **Enhanced Empty States**: 
   - Lists AI search capabilities before first search
   - Helpful suggestions when no results found
5. **Loading State**: "Analyzing with AI..." message during search

### Search Results Display

```
┌─────────────────────────────────┐
│ [Note Card]                     │
├─────────────────────────────────┤
│ ⭐ 95% match                    │
│ Exact match for product name    │
│ and location                    │
└─────────────────────────────────┘
```

## Fallback Mechanism

If the AI search fails (e.g., API error, timeout):
1. System automatically falls back to basic SQL search
2. Uses PostgreSQL `ILIKE` for text and location matching
3. Results still displayed, but without relevance scores
4. User experience remains smooth with no error messages

## Performance Considerations

- **Caching**: Search history is saved for quick re-searches
- **Limit**: Results limited to top 10 to reduce API costs
- **Model**: Uses `gpt-4o-mini` for cost-effective performance
- **Temperature**: Set to 0.3 for consistent, focused results
- **Timeout**: Edge function has built-in timeout handling

## Cost Optimization

- Only analyzes user's own recalls (not entire database)
- Limits results to top 10
- Uses efficient `gpt-4o-mini` model
- Structured JSON output reduces token usage
- Single API call per search (no iterative refinement)

## Security

- User authentication required via Supabase Auth
- Row Level Security (RLS) ensures users only see their own recalls
- Service role key used securely in edge function
- No sensitive data exposed in responses

## Future Enhancements

Potential improvements:
1. **Caching**: Cache AI results for repeated queries
2. **Batch Processing**: Analyze multiple queries in parallel
3. **User Feedback**: Allow users to rate relevance scores
4. **Fine-tuning**: Train custom model on user feedback
5. **Multi-language**: Support searches in multiple languages
6. **Voice Search**: Integrate speech-to-text for voice queries
7. **Image Search**: Analyze images in recalls for visual matching

## Testing

To test the implementation:

1. **Basic Search**: Enter a simple keyword (e.g., "coffee")
2. **Location Search**: Search for a place name (e.g., "downtown")
3. **Entity Search**: Search for a person or organization name
4. **Semantic Search**: Use related terms (e.g., "caffeine" for coffee recalls)
5. **Complex Query**: Combine multiple concepts (e.g., "coffee shop downtown yesterday")

Expected behavior:
- Results should be ranked by relevance
- Each result should have a score and explanation
- Top results should clearly match the query
- Location-based queries should prioritize nearby recalls

## Troubleshooting

### Common Issues

1. **No Results**: 
   - Check if OPENAI_API_KEY is set in Supabase
   - Verify edge function is deployed
   - Check browser console for errors

2. **Slow Performance**:
   - Normal for first search (cold start)
   - Subsequent searches should be faster
   - Consider reducing number of recalls to analyze

3. **Incorrect Scores**:
   - AI model may need more context
   - Try more specific search terms
   - Check if recall data is complete

4. **Fallback to Basic Search**:
   - Check Supabase logs for edge function errors
   - Verify OpenAI API key is valid
   - Check API rate limits

## Monitoring

Monitor the following:
- Edge function invocation count
- OpenAI API usage and costs
- Search response times
- Error rates and types
- User search patterns

Access logs via:
- Supabase Dashboard → Edge Functions → Logs
- OpenAI Dashboard → Usage
