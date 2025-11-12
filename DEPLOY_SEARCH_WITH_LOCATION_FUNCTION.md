
# Deploy search-recalls-with-location Edge Function

This guide explains how to deploy the `search-recalls-with-location` Supabase Edge Function.

## Prerequisites

1. Supabase CLI installed (`npm install -g supabase`)
2. Logged into Supabase CLI (`supabase login`)
3. Project linked (`supabase link --project-ref cesmsdnblkdjkskmiqib`)

## Required Environment Variables

The edge function requires the following environment variables to be set in your Supabase project:

1. **OPENAI_API_KEY** - Your OpenAI API key for NLP/NER processing
2. **GOOGLE_PLACES_API_KEY** - Your Google Places API key for location resolution

### Setting Environment Variables

You can set these using the Supabase CLI:

```bash
# Set OpenAI API Key
supabase secrets set OPENAI_API_KEY=your_openai_api_key_here

# Set Google Places API Key
supabase secrets set GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

Or via the Supabase Dashboard:
1. Go to your project settings
2. Navigate to Edge Functions → Secrets
3. Add the required secrets

## Deployment Steps

### 1. Deploy the Edge Function

From your project root directory, run:

```bash
supabase functions deploy search-recalls-with-location
```

### 2. Verify Deployment

Check that the function is deployed successfully:

```bash
supabase functions list
```

You should see `search-recalls-with-location` in the list.

### 3. Test the Function

You can test the function using curl:

```bash
curl -i --location --request POST 'https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/search-recalls-with-location' \
  --header 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"query":"coffee shops near Sydney Opera House","limit":10}'
```

## How It Works

The `search-recalls-with-location` edge function enhances the existing search functionality with location-based filtering:

1. **Calls search-recalls**: First, it invokes the existing `search-recalls` function to get AI-powered search results
2. **NLP NER Analysis**: Uses OpenAI to analyze the search query for location/proximity intent
3. **Location Resolution**: If location intent is detected, uses Google Places API to resolve the location to coordinates
4. **Proximity Filtering**: Filters the search results to only include recalls within the specified proximity (default 5km)
5. **Returns Results**: Returns either the filtered results (if location intent detected) or original results (if no location intent)

## Example Queries

The function can handle various types of location-based queries:

- **Proximity searches**: "restaurants near Central Park"
- **Distance-based**: "photos within 10km of Melbourne CBD"
- **Location context**: "notes at the beach"
- **Regular searches**: "my birthday party" (no location filtering applied)

## Location Intent Detection

The NER system detects:
- Exact location mentions (e.g., "Sydney", "Eiffel Tower")
- Proximity keywords (e.g., "near", "nearby", "close to")
- Distance specifications (e.g., "within 5km", "10 kilometers")
- Location context (e.g., "at the", "in the")

## Troubleshooting

### Function not found
- Ensure you've deployed the function: `supabase functions deploy search-recalls-with-location`
- Check the function list: `supabase functions list`

### API Key errors
- Verify environment variables are set: `supabase secrets list`
- Check that the keys are valid and have the necessary permissions

### No location filtering applied
- The function will return original results if:
  - No location intent is detected in the query
  - The location cannot be resolved via Google Places API
  - The recalls don't have location data (latitude/longitude)

### Location not resolved
- Ensure your Google Places API key has the Places API (New) enabled
- Check that the location query is specific enough
- Try using more well-known location names

## Monitoring

View function logs:

```bash
supabase functions logs search-recalls-with-location
```

Or via the Supabase Dashboard:
1. Go to Edge Functions
2. Select `search-recalls-with-location`
3. View the Logs tab

## Cost Considerations

This function makes API calls to:
- OpenAI API (for NER analysis) - ~$0.0001-0.0005 per search
- Google Places API (for location resolution) - ~$0.017 per search (when location detected)

The function is optimized to only call these APIs when necessary:
- OpenAI is called for every search (to detect location intent)
- Google Places is only called when location intent is detected
- Results are filtered locally without additional API calls

## Related Documentation

- [Google Places API Setup](./GOOGLE_PLACES_SETUP.md)
- [Search Recalls Function](./DEPLOY_SEARCH_RECALLS_FUNCTION.md)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Google Places API Documentation](https://developers.google.com/maps/documentation/places/web-service/overview)
