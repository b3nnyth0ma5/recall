
# Location-Based Search Implementation Summary

## Overview

This implementation adds location-based filtering to the existing AI-powered search functionality. The system uses NLP Named Entity Recognition (NER) to detect location intent in search queries and filters results based on proximity to the detected location.

## Architecture

### Edge Function Chain

```
User Query → search-recalls-with-location → search-recalls → Filtered Results
                    ↓
              NLP NER Analysis
                    ↓
           Google Places API
                    ↓
          Location Filtering
```

### Components

1. **search-recalls-with-location** (New Edge Function)
   - Entry point for all search requests
   - Orchestrates the location-aware search flow
   - Calls the existing `search-recalls` function
   - Applies location filtering when appropriate

2. **NLP NER Analysis** (OpenAI)
   - Analyzes search queries for location intent
   - Extracts location names and proximity requirements
   - Determines search type (exact, near, within)

3. **Google Places API Integration**
   - Resolves location names to coordinates
   - Provides accurate geocoding
   - Supports various location formats

4. **Location Filtering**
   - Calculates distances using Haversine formula
   - Filters recalls within specified proximity
   - Sorts results by distance

## Key Features

### 1. Intelligent Location Detection

The system can detect various types of location queries:

- **Explicit proximity**: "coffee shops near Sydney Opera House"
- **Distance-based**: "restaurants within 10km of Melbourne CBD"
- **Location context**: "photos at the beach"
- **Implicit location**: "notes from downtown"

### 2. Flexible Proximity Handling

- Default proximity: 5km
- Custom distances: "within 10km", "20 kilometers away"
- Proximity keywords: "near", "nearby", "close to", "around"

### 3. Graceful Fallback

If location filtering cannot be applied, the system returns the original AI-powered search results:
- No location intent detected
- Location cannot be resolved
- Recalls lack location data

### 4. Non-Intrusive UX

The existing search UI remains unchanged. Location filtering is indicated with subtle visual cues:
- Location badge showing the resolved place and proximity
- No changes to the search input or flow
- Seamless integration with existing features

## Implementation Details

### Edge Function: search-recalls-with-location

**Location**: `supabase/functions/search-recalls-with-location/index.ts`

**Flow**:
1. Authenticate user
2. Call `search-recalls` function to get AI-powered results
3. Use OpenAI to analyze query for location intent
4. If location detected:
   - Resolve location using Google Places API
   - Filter results by proximity
   - Return filtered results with location metadata
5. If no location detected:
   - Return original results unchanged

**Key Functions**:
- `extractLocationEntities()`: Uses OpenAI for NER analysis
- `searchGooglePlaces()`: Resolves location to coordinates
- `filterByLocation()`: Filters results by proximity
- `calculateDistance()`: Haversine distance calculation

### Client-Side Updates

**hooks/useNotes.ts**:
- Updated to call `search-recalls-with-location` instead of `search-recalls`
- Added `locationInfo` state to store location metadata
- Exposes location info to consuming components

**app/search.tsx**:
- Added location indicator badge
- Shows resolved place name and proximity
- Updated feature list to mention location capabilities
- No changes to search input or interaction flow

## API Requirements

### OpenAI API
- **Model**: gpt-4o-mini
- **Purpose**: NER analysis for location detection
- **Cost**: ~$0.0001-0.0005 per search
- **Required**: Yes (for all searches)

### Google Places API
- **API**: Places API (New) - Text Search
- **Purpose**: Location resolution and geocoding
- **Cost**: ~$0.017 per search (only when location detected)
- **Required**: Yes (for location-based searches)

## Environment Variables

Required in Supabase Edge Functions:

```bash
OPENAI_API_KEY=your_openai_api_key
GOOGLE_PLACES_API_KEY=your_google_places_api_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Example Queries and Behavior

### Query: "coffee shops near Sydney Opera House"

**NER Analysis**:
```json
{
  "hasLocationIntent": true,
  "location": "Sydney Opera House",
  "proximity": 5,
  "type": "near",
  "cleanedQuery": "coffee shops"
}
```

**Google Places Resolution**:
```json
{
  "displayName": "Sydney Opera House",
  "latitude": -33.8568,
  "longitude": 151.2153
}
```

**Result**: Only recalls within 5km of Sydney Opera House are returned

### Query: "my birthday party"

**NER Analysis**:
```json
{
  "hasLocationIntent": false,
  "location": null,
  "proximity": null,
  "type": null,
  "cleanedQuery": "my birthday party"
}
```

**Result**: All matching recalls returned (no location filtering)

### Query: "restaurants within 10km of Melbourne CBD"

**NER Analysis**:
```json
{
  "hasLocationIntent": true,
  "location": "Melbourne CBD",
  "proximity": 10,
  "type": "within",
  "cleanedQuery": "restaurants"
}
```

**Result**: Only recalls within 10km of Melbourne CBD are returned

## Performance Considerations

### Optimization Strategies

1. **Conditional API Calls**:
   - Google Places API only called when location intent detected
   - Reduces unnecessary API costs

2. **Local Filtering**:
   - Distance calculations done locally
   - No additional API calls for filtering

3. **Efficient Distance Calculation**:
   - Haversine formula for accurate distances
   - Optimized for performance

4. **Result Sorting**:
   - Results sorted by distance (closest first)
   - Improves user experience

### Cost Optimization

- Average cost per search: $0.0001-0.0005 (no location) or $0.017-0.018 (with location)
- Only processes location when detected in query
- Caches location resolutions (future enhancement)

## Error Handling

The system handles various error scenarios gracefully:

1. **OpenAI API Failure**:
   - Falls back to original search results
   - Logs error for debugging

2. **Google Places API Failure**:
   - Returns original search results
   - Includes error message in response

3. **No Location Data**:
   - Excludes recalls without coordinates
   - Logs which recalls were excluded

4. **Invalid Proximity**:
   - Uses default 5km proximity
   - Continues with search

## Testing

### Manual Testing

Test various query types:

```bash
# Proximity search
curl -X POST https://your-project.supabase.co/functions/v1/search-recalls-with-location \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"restaurants near Central Park","limit":10}'

# Distance-based search
curl -X POST https://your-project.supabase.co/functions/v1/search-recalls-with-location \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"photos within 20km of Sydney","limit":10}'

# Regular search (no location)
curl -X POST https://your-project.supabase.co/functions/v1/search-recalls-with-location \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"birthday party","limit":10}'
```

### Expected Responses

**With Location Filtering**:
```json
{
  "results": [...],
  "total": 5,
  "query": "restaurants near Central Park",
  "locationFiltered": true,
  "locationInfo": {
    "location": "Central Park",
    "resolvedPlace": "Central Park",
    "proximity": 5,
    "coordinates": {
      "latitude": 40.7829,
      "longitude": -73.9654
    }
  }
}
```

**Without Location Filtering**:
```json
{
  "results": [...],
  "total": 10,
  "query": "birthday party",
  "locationFiltered": false
}
```

## Future Enhancements

Potential improvements for future iterations:

1. **Location Caching**:
   - Cache Google Places API results
   - Reduce API costs for repeated locations

2. **User Location Bias**:
   - Use user's current location for proximity bias
   - Improve relevance for "near me" queries

3. **Multiple Locations**:
   - Support queries with multiple locations
   - "restaurants in Sydney or Melbourne"

4. **Location History**:
   - Remember frequently searched locations
   - Quick access to recent location searches

5. **Advanced Proximity**:
   - Support for polygons and custom boundaries
   - "within this neighborhood"

6. **Location Suggestions**:
   - Auto-suggest locations as user types
   - Improve location query accuracy

## Monitoring and Debugging

### Logs to Monitor

1. **NER Analysis**:
   - Check if location intent is correctly detected
   - Verify extracted location names and proximity

2. **Google Places Resolution**:
   - Ensure locations are resolved correctly
   - Monitor API errors and rate limits

3. **Filtering Results**:
   - Track how many results are filtered out
   - Verify distance calculations

### Common Issues

1. **No results returned**:
   - Check if recalls have location data
   - Verify proximity is not too restrictive

2. **Wrong location resolved**:
   - Location name may be ambiguous
   - Add more context to the query

3. **Location not detected**:
   - Query may not have clear location intent
   - Try more explicit location keywords

## Deployment Checklist

- [ ] Deploy `search-recalls-with-location` edge function
- [ ] Set `OPENAI_API_KEY` environment variable
- [ ] Set `GOOGLE_PLACES_API_KEY` environment variable
- [ ] Verify `search-recalls` function is deployed and working
- [ ] Test with various query types
- [ ] Monitor logs for errors
- [ ] Update client app to use new function
- [ ] Test end-to-end flow in the app

## Related Documentation

- [Deployment Guide](./DEPLOY_SEARCH_WITH_LOCATION_FUNCTION.md)
- [Google Places Setup](./GOOGLE_PLACES_SETUP.md)
- [Search Recalls Function](./DEPLOY_SEARCH_RECALLS_FUNCTION.md)
- [Testing Guide](./TESTING_GUIDE.md)
