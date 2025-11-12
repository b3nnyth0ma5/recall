
# Location-Based Search - Quick Start Guide

## What is Location-Based Search?

The app now supports intelligent location-based filtering in search queries. Simply include location information in your search, and the system will automatically filter results based on proximity to that location.

## How to Use

### Basic Location Search

Just search naturally with location keywords:

```
"coffee shops near Sydney Opera House"
"restaurants at the beach"
"photos from Central Park"
```

### Proximity-Based Search

Specify a distance for more precise filtering:

```
"notes within 5km of Melbourne CBD"
"restaurants within 10 kilometers of Times Square"
"photos near me"
```

### Location Context

Use location context in your queries:

```
"meeting at the office"
"lunch in downtown"
"photos from the park"
```

## Supported Location Keywords

The system recognizes various location-related keywords:

- **Proximity**: near, nearby, close to, around, by
- **Distance**: within, km, kilometers, miles
- **Context**: at, in, from, around

## Examples

### Example 1: Find Nearby Recalls

**Query**: `"restaurants near Circular Quay"`

**What happens**:
1. System detects "near Circular Quay" as location intent
2. Resolves "Circular Quay" to coordinates using Google Places
3. Filters recalls within 5km (default proximity)
4. Returns only matching recalls near Circular Quay

**Result**: You see recalls about restaurants that are within 5km of Circular Quay

### Example 2: Distance-Based Search

**Query**: `"photos within 10km of Sydney CBD"`

**What happens**:
1. System detects "within 10km of Sydney CBD" as location intent
2. Resolves "Sydney CBD" to coordinates
3. Filters recalls within 10km
4. Returns matching photo recalls within that radius

**Result**: You see photo recalls within 10km of Sydney CBD

### Example 3: Regular Search (No Location)

**Query**: `"birthday party"`

**What happens**:
1. System detects no location intent
2. Performs regular AI-powered search
3. Returns all matching recalls (no location filtering)

**Result**: You see all recalls about birthday parties, regardless of location

## Visual Indicators

When location filtering is applied, you'll see:

- **Location badge**: Shows the resolved location and proximity
  - Example: "Near Sydney Opera House (5km)"
- **AI indicator**: Shows that AI-powered search is active
  - Example: "AI-powered search with NER"

## Tips for Best Results

### 1. Be Specific

✅ Good: "restaurants near Sydney Opera House"
❌ Less specific: "restaurants near Sydney"

### 2. Use Well-Known Locations

✅ Good: "photos at Central Park"
❌ Ambiguous: "photos at the park"

### 3. Include Distance When Needed

✅ Good: "notes within 20km of Melbourne"
❌ Vague: "notes around Melbourne"

### 4. Combine with Other Search Terms

✅ Good: "Italian restaurants near Times Square"
✅ Good: "beach photos within 10km of Bondi"

## When Location Filtering is NOT Applied

Location filtering won't be applied in these cases:

1. **No location intent detected**:
   - Query: "my birthday party"
   - Result: Regular search (no filtering)

2. **Location cannot be resolved**:
   - Query: "restaurants near xyz123"
   - Result: Regular search (location not found)

3. **Recalls lack location data**:
   - Some recalls may not have GPS coordinates
   - These will be excluded from location-filtered results

## Troubleshooting

### No Results Found

**Problem**: Search returns no results even though you have matching recalls

**Solutions**:
- Increase the proximity distance (e.g., "within 20km" instead of "within 5km")
- Check if your recalls have location data (GPS coordinates)
- Try a more general location (e.g., "Sydney" instead of "Sydney Opera House")

### Wrong Location Detected

**Problem**: System detects the wrong location

**Solutions**:
- Be more specific with the location name
- Use full location names (e.g., "Sydney Opera House" instead of "Opera House")
- Add more context (e.g., "Sydney Opera House, Australia")

### Location Not Detected

**Problem**: System doesn't detect location in your query

**Solutions**:
- Use explicit location keywords (near, at, in, within)
- Make the location more prominent in the query
- Try different phrasing (e.g., "near Central Park" instead of "Central Park area")

## Privacy Note

Location-based search only uses:
- Location data you've already saved with your recalls
- Public location information from Google Places API
- No real-time location tracking

Your location data is only used to filter search results and is never shared with third parties.

## Technical Details

For developers and advanced users:

- **NER Engine**: OpenAI GPT-4o-mini
- **Location Resolution**: Google Places API (New)
- **Distance Calculation**: Haversine formula
- **Default Proximity**: 5km
- **Maximum Results**: 10 (configurable)

## Related Features

- **AI-Powered Search**: Semantic understanding of queries
- **OCR Search**: Search text within images
- **Location Tagging**: Add GPS coordinates to recalls
- **Google Maps Integration**: View recall locations on maps

## Need Help?

If you encounter issues with location-based search:

1. Check that your recalls have location data
2. Try different location keywords
3. Verify the location name is correct
4. Check the app logs for error messages

For more information, see:
- [Location Search Implementation](./LOCATION_SEARCH_IMPLEMENTATION.md)
- [Deployment Guide](./DEPLOY_SEARCH_WITH_LOCATION_FUNCTION.md)
- [Google Places Setup](./GOOGLE_PLACES_SETUP.md)
