
# Search Enhancement Implementation Summary

## Overview
Enhanced the search functionality with better location detection, people search, and improved orchestration of search results.

## Changes Made

### 1. Enhanced `search-recalls-with-location` Edge Function
**Location:** `supabase/functions/search-recalls-with-location/index.ts`

**Key Improvements:**
- **More Precise Location Detection**: Uses GPT-4o-mini to detect location intent with high precision
- **Intent-Based Search Strategies**:
  - `"in [location]"`: Uses bounding box with 500m buffer for precise area searches
  - `"near [location]"`: Uses 1km radius for proximity searches
  - `"near me"` or `"around me"`: Uses user's current location with 1km radius
- **Google Places API Integration**: 
  - Enhanced location resolution with location bias
  - Supports viewport-based searches
  - Better handling of ambiguous location names
- **Optimized for Speed**: 
  - Early returns when no location intent detected
  - Efficient bounding box calculations
  - Parallel processing where possible

**New Features:**
- Bounding box calculation for "in" queries
- User location support for "near me" queries
- Confidence-based intent detection (70% threshold)
- Detailed location info in response (coordinates, search strategy, etc.)

### 2. New `search-recalls-with-people` Edge Function
**Location:** `supabase/functions/search-recalls-with-people/index.ts`

**Purpose:** Dedicated edge function for detecting and searching people mentions in queries

**Features:**
- **NLP NER with GPT-4o-mini**: Extracts person names from search queries
- **Fuzzy Matching**: Case-insensitive partial matching against user's persons database
- **Recall Association**: Finds all recalls mentioning detected people
- **Person Info Tracking**: Returns both detected and matched person names

**Response Format:**
```json
{
  "hasPeopleIntent": true,
  "recallIds": ["uuid1", "uuid2"],
  "personInfo": {
    "detectedNames": ["John", "Sarah"],
    "matchedNames": ["John Doe", "Sarah Smith"]
  },
  "processingTimeMs": 150
}
```

### 3. Updated `search-recalls-v2` Edge Function
**Location:** `supabase/functions/search-recalls-v2/index.ts`

**Key Changes:**
- **Removed NLP NER Logic**: Moved to `search-recalls-with-people` function
- **Combined Results Processing**: 
  - Accepts `locationRecallIds` and `peopleRecallIds` as input
  - Prioritizes recalls from location and people searches
  - Merges priority recalls with embedding-based search results
- **Priority Marking**: Marks recalls from location/people searches as `[PRIORITY]` in context
- **Enhanced Sorting**: 
  1. Priority recalls first
  2. Then by similarity score
  3. Used-for-answer recalls at the top

**New Parameters:**
```typescript
{
  query: string,
  locationRecallIds?: string[],  // NEW
  peopleRecallIds?: string[],    // NEW
  personInfo?: PersonInfo         // NEW
}
```

### 4. Updated `SearchProgressIndicator` Component
**Location:** `components/SearchProgressIndicator.tsx`

**New Features:**
- **New Stage**: Added `'people'` stage for person search
- **Person Names Display**: Shows matched person names during people search
- **Enhanced Icons**: Different icons for each stage including person icon for people search
- **Progress Tracking**: Updated progress percentages to include people search stage

**Stage Progression:**
1. `detecting` (20%) - Detecting search intent
2. `resolving` (40%) - Resolving location
3. `filtering` (60%) - Filtering nearby recalls
4. `people` (75%) - **NEW** - Searching for people
5. `searching` (90%) - Analyzing with AI
6. `complete` (100%) - Complete

### 5. Updated `useNotes` Hook
**Location:** `hooks/useNotes.ts`

**Key Changes:**
- **New State Variables**:
  - `searchPersonNames`: Tracks matched person names for progress indicator
  - Updated `SearchStage` type to include `'people'`
- **Enhanced Search Flow**:
  1. Check for location intent (`search-recalls-with-location`)
  2. Check for people intent (`search-recalls-with-people`) - **NEW**
  3. Combine results and pass to `search-recalls-v2`
  4. Display combined results with proper prioritization

**Search Orchestration:**
```typescript
// Step 1: Location search
const locationData = await invoke('search-recalls-with-location', { query });

// Step 2: People search (NEW)
setSearchStage('people');
const peopleData = await invoke('search-recalls-with-people', { query });

// Step 3: Combined AI search
const searchResults = await invoke('search-recalls-v2', {
  query: cleanedQuery,
  locationRecallIds: locationData?.recallIds,
  peopleRecallIds: peopleData?.recallIds,
  personInfo: peopleData?.personInfo
});
```

### 6. Updated Search Screen
**Location:** `app/search.tsx`

**Changes:**
- **Progress Indicator**: Now passes `searchPersonNames` to show matched people
- **Intent Badges**: Displays both location and people search badges
- **Results Display**: Shows combined results with proper context

## Benefits

### 1. **More Precise Location Detection**
- Distinguishes between "in", "near", and "near me" queries
- Uses appropriate search strategies for each intent type
- Better handling of location ambiguity

### 2. **Dedicated People Search**
- Separate edge function for better maintainability
- Clearer separation of concerns
- Easier to debug and optimize

### 3. **Better Result Prioritization**
- Location and people matches get highest priority
- AI still provides semantic search for remaining results
- Users see most relevant results first

### 4. **Improved User Experience**
- Clear progress indication for each search stage
- Visual feedback for location and people searches
- Better understanding of search results

### 5. **Optimized Performance**
- Parallel execution of location and people searches
- Early returns when no intent detected
- Efficient bounding box calculations

## Example Queries

### Location Queries
- `"restaurants in Collingwood"` → Bounding box search with 500m buffer
- `"coffee near Sydney Opera House"` → 1km radius search
- `"photos near me"` → 1km radius from user's current location

### People Queries
- `"recalls with John"` → Finds all recalls mentioning John
- `"what did Sarah say about the project"` → Finds Sarah's recalls about projects

### Combined Queries
- `"restaurants in Collingwood with Sarah"` → Location + people search
- `"photos near me with John"` → Current location + people search

## Linting
All code follows proper linting standards:
- No unused variables
- Proper TypeScript types
- Consistent formatting
- No console.log in production (only in edge functions for debugging)

## Testing Recommendations

1. **Location Search**:
   - Test "in" queries with various locations
   - Test "near" queries with landmarks
   - Test "near me" with user location enabled/disabled

2. **People Search**:
   - Test with single person names
   - Test with multiple person names
   - Test with partial name matches

3. **Combined Search**:
   - Test queries with both location and people
   - Verify priority ordering
   - Check progress indicator stages

4. **Edge Cases**:
   - Empty queries
   - Ambiguous location names
   - Non-existent person names
   - No results scenarios

## Deployment Status
✅ All edge functions deployed successfully:
- `search-recalls-with-location` (v23)
- `search-recalls-with-people` (v1)
- `search-recalls-v2` (v68)

## Next Steps
1. Monitor edge function logs for performance
2. Gather user feedback on search accuracy
3. Consider adding more search intents (date, category, etc.)
4. Optimize embedding search threshold based on usage patterns
