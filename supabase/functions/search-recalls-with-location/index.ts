
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

/**
 * Use OpenAI to extract location entities from search query using NER
 */
async function extractLocationEntities(query: string, openaiApiKey: string) {
  try {
    console.log('Extracting location entities from query:', query);

    const systemPrompt = `You are a Named Entity Recognition (NER) expert specializing in location and proximity detection.

Your task is to analyze search queries and extract location-based intent.

Detect:
1. Exact location mentions (e.g., "Sydney", "Eiffel Tower", "Central Park")
2. Proximity-based searches (e.g., "near me", "within 5km", "nearby", "close to")
3. Location context (e.g., "at the beach", "in the city", "downtown")

Return a JSON object with this structure:
{
  "hasLocationIntent": true/false,
  "location": "extracted location name or null",
  "proximity": number (in kilometers) or null,
  "type": "exact" | "near" | "within" | null,
  "cleanedQuery": "query with location part removed"
}

Examples:
- "coffee shops near Sydney Opera House" → {"hasLocationIntent": true, "location": "Sydney Opera House", "proximity": 5, "type": "near", "cleanedQuery": "coffee shops"}
- "restaurants within 10km of Melbourne CBD" → {"hasLocationIntent": true, "location": "Melbourne CBD", "proximity": 10, "type": "within", "cleanedQuery": "restaurants"}
- "photos at the beach" → {"hasLocationIntent": true, "location": "beach", "proximity": null, "type": "exact", "cleanedQuery": "photos"}
- "my birthday party" → {"hasLocationIntent": false, "location": null, "proximity": null, "type": null, "cleanedQuery": "my birthday party"}

If no location intent is detected, return hasLocationIntent: false.`;

    const userPrompt = `Analyze this search query for location intent:\n\n"${query}"`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI NER API error:', errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.log('No content in OpenAI NER response');
      return null;
    }

    // Parse JSON response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const nerResult = JSON.parse(jsonContent);
    console.log('NER result:', nerResult);

    if (!nerResult.hasLocationIntent) {
      console.log('No location intent detected');
      return null;
    }

    return {
      location: nerResult.location,
      proximity: nerResult.proximity || 5, // Default to 5km
      type: nerResult.type || 'near',
      cleanedQuery: nerResult.cleanedQuery || query,
    };
  } catch (error) {
    console.error('Error extracting location entities:', error);
    return null;
  }
}

/**
 * Search for a place using Google Places API
 */
async function searchGooglePlaces(locationQuery: string, googleApiKey: string) {
  try {
    console.log('Searching Google Places for:', locationQuery);

    const baseUrl = 'https://places.googleapis.com/v1/places:searchText';

    const requestBody = {
      textQuery: locationQuery,
      languageCode: 'en',
      maxResultCount: 1,
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    if (!data.places || data.places.length === 0) {
      console.log('No places found for:', locationQuery);
      return null;
    }

    const place = data.places[0];
    return {
      placeId: place.id,
      displayName: place.displayName?.text || 'Unknown Place',
      formattedAddress: place.formattedAddress || '',
      latitude: place.location?.latitude || 0,
      longitude: place.location?.longitude || 0,
    };
  } catch (error) {
    console.error('Error searching Google Places:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const startTime = Date.now();
  console.log('=== search-recalls-with-location function invoked ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Authenticated user:', user.id);

    // Parse request body
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Search query:', query);

    // Get API keys
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not set');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!googleApiKey) {
      console.error('GOOGLE_PLACES_API_KEY not set');
      return new Response(
        JSON.stringify({ error: 'Google Places API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Step 1: Apply NLP NER to detect location intent
    console.log('Step 1: Applying NLP NER for location detection...');
    const locationEntity = await extractLocationEntities(query, openaiApiKey);

    // If no location intent detected, return empty results (caller will use regular search)
    if (!locationEntity) {
      console.log('No location intent detected - returning signal to use regular search');
      return new Response(
        JSON.stringify({
          hasLocationIntent: false,
          shouldUseRegularSearch: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Location entity detected:', locationEntity);

    // Step 2: Use Google Places API to get coordinates for the location
    console.log('Step 2: Resolving location with Google Places API...');
    const placeResult = await searchGooglePlaces(locationEntity.location, googleApiKey);

    if (!placeResult) {
      console.log('Could not resolve location - returning signal to use regular search');
      return new Response(
        JSON.stringify({
          hasLocationIntent: true,
          locationResolved: false,
          shouldUseRegularSearch: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Location resolved:', placeResult);

    // Step 3: Fetch all recalls with location data for this user
    console.log('Step 3: Fetching recalls with location data...');
    const { data: recallsData, error: recallsError } = await supabase
      .from('recalls')
      .select('id, latitude, longitude, location, location_primary_type')
      .eq('user_id', user.id)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (recallsError) {
      console.error('Error fetching recalls:', recallsError);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch recalls',
          details: recallsError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${recallsData?.length || 0} recalls with location data`);

    // Step 4: Filter recalls by proximity
    console.log(`Step 4: Filtering recalls within ${locationEntity.proximity}km...`);
    const proximityKm = locationEntity.proximity || 5;
    const filteredRecalls = (recallsData || [])
      .map((recall) => {
        const distance = calculateDistance(
          placeResult.latitude,
          placeResult.longitude,
          recall.latitude!,
          recall.longitude!
        );
        return { ...recall, distance };
      })
      .filter((recall) => recall.distance <= proximityKm)
      .sort((a, b) => a.distance - b.distance);

    console.log(`Found ${filteredRecalls.length} recalls within ${proximityKm}km`);

    if (filteredRecalls.length === 0) {
      console.log('No recalls found within proximity - returning empty results');
      return new Response(
        JSON.stringify({
          hasLocationIntent: true,
          locationResolved: true,
          recallIds: [],
          locationInfo: {
            location: locationEntity.location,
            resolvedPlace: placeResult.displayName,
            proximity: proximityKm,
            coordinates: {
              latitude: placeResult.latitude,
              longitude: placeResult.longitude,
            },
          },
          processingTimeMs: Date.now() - startTime,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Return the filtered recall IDs
    const recallIds = filteredRecalls.map((r) => r.id);
    console.log(`Returning ${recallIds.length} recall IDs for further processing`);

    return new Response(
      JSON.stringify({
        hasLocationIntent: true,
        locationResolved: true,
        recallIds,
        locationInfo: {
          location: locationEntity.location,
          resolvedPlace: placeResult.displayName,
          proximity: proximityKm,
          coordinates: {
            latitude: placeResult.latitude,
            longitude: placeResult.longitude,
          },
        },
        cleanedQuery: locationEntity.cleanedQuery,
        processingTimeMs: Date.now() - startTime,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('=== Error in search-recalls-with-location function ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Processing time before error:', processingTime, 'ms');

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
