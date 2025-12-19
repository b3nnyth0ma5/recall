
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
 * Calculate bounding box from center point and buffer distance
 */
function calculateBoundingBox(
  centerLat: number,
  centerLon: number,
  bufferKm: number
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const R = 6371; // Earth's radius in kilometers
  
  // Calculate latitude bounds
  const latDelta = (bufferKm / R) * (180 / Math.PI);
  const minLat = centerLat - latDelta;
  const maxLat = centerLat + latDelta;
  
  // Calculate longitude bounds (accounting for latitude)
  const lonDelta = (bufferKm / R) * (180 / Math.PI) / Math.cos(centerLat * Math.PI / 180);
  const minLon = centerLon - lonDelta;
  const maxLon = centerLon + lonDelta;
  
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Extract distance from query (e.g., "10km", "5 km", "2.5km")
 * Returns distance in kilometers or null if not found
 */
function extractDistanceFromQuery(query: string): number | null {
  // Match patterns like "10km", "5 km", "2.5km", "10 km", etc.
  const distancePattern = /(\d+(?:\.\d+)?)\s*km/i;
  const match = query.match(distancePattern);
  
  if (match && match[1]) {
    const distance = parseFloat(match[1]);
    if (!isNaN(distance) && distance > 0) {
      console.log(`Extracted distance from query: ${distance}km`);
      return distance;
    }
  }
  
  return null;
}

/**
 * Use GPT-4o-mini to detect location intent with high precision
 */
async function detectLocationIntent(query: string, openaiApiKey: string) {
  try {
    console.log('Detecting location intent from query:', query);

    const systemPrompt = `You are an expert at detecting location-based search intent with high precision.

Analyze the query and detect:
1. "in [location]" - User wants results WITHIN a specific area (use bounding box with 500m buffer)
2. "near [location]" - User wants results NEAR a specific place (use 1km radius)
3. "near me" or "around me" - User wants results near their current location (use 1km radius)

Return JSON:
{
  "hasLocationIntent": true/false,
  "intentType": "in" | "near" | "near_me" | null,
  "location": "extracted location name" | null,
  "cleanedQuery": "query with location part removed",
  "confidence": 0-100
}

Examples:
- "restaurants in Collingwood" → {"hasLocationIntent": true, "intentType": "in", "location": "Collingwood", "cleanedQuery": "restaurants", "confidence": 95}
- "coffee near Sydney Opera House" → {"hasLocationIntent": true, "intentType": "near", "location": "Sydney Opera House", "cleanedQuery": "coffee", "confidence": 90}
- "photos near me" → {"hasLocationIntent": true, "intentType": "near_me", "location": null, "cleanedQuery": "photos", "confidence": 100}
- "my birthday party" → {"hasLocationIntent": false, "intentType": null, "location": null, "cleanedQuery": "my birthday party", "confidence": 0}

Be precise - only detect location intent when explicitly stated.`;

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
          { role: 'user', content: `Analyze: "${query}"` },
        ],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.log('No content in OpenAI response');
      return null;
    }

    // Parse JSON response
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const result = JSON.parse(jsonContent);
    console.log('Location intent detection result:', result);

    if (!result.hasLocationIntent || result.confidence < 70) {
      console.log('No strong location intent detected');
      return null;
    }

    return result;
  } catch (error) {
    console.error('Error detecting location intent:', error);
    return null;
  }
}

/**
 * Search for a place using Google Places API with enhanced precision
 */
async function searchGooglePlaces(locationQuery: string, googleApiKey: string, userLocation?: { latitude: number; longitude: number }) {
  try {
    console.log('Searching Google Places for:', locationQuery);

    const baseUrl = 'https://places.googleapis.com/v1/places:searchText';

    const requestBody: any = {
      textQuery: locationQuery,
      languageCode: 'en',
      maxResultCount: 1,
    };

    // Add location bias if user location is provided
    if (userLocation) {
      requestBody.locationBias = {
        circle: {
          center: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
          radius: 50000.0, // 50km bias
        },
      };
    }

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.viewport',
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
      viewport: place.viewport || null,
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
    const { query, userLocation } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Search query:', query);
    console.log('User location:', userLocation);

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

    // Step 1: Detect location intent with high precision
    console.log('Step 1: Detecting location intent with GPT-4o-mini...');
    const locationIntent = await detectLocationIntent(query, openaiApiKey);

    // If no location intent detected, return early
    if (!locationIntent) {
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

    console.log('Location intent detected:', locationIntent);

    // Step 2: Handle "near me" or "around me"
    if (locationIntent.intentType === 'near_me') {
      if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
        console.log('User location not provided for "near me" query');
        return new Response(
          JSON.stringify({
            hasLocationIntent: true,
            locationResolved: false,
            shouldUseRegularSearch: true,
            error: 'User location required for "near me" queries',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log('Step 2: Using user location for "near me" query');
      
      // Extract distance from query if specified, otherwise use default 1km
      const extractedDistance = extractDistanceFromQuery(query);
      const radiusKm = extractedDistance !== null ? extractedDistance : 1;
      
      console.log(`Using radius: ${radiusKm}km ${extractedDistance !== null ? '(extracted from query)' : '(default)'}`);

      // Fetch all recalls with location data for this user
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

      // Filter recalls by proximity
      console.log(`Step 4: Filtering recalls within ${radiusKm}km of user location...`);
      const filteredRecalls = (recallsData || [])
        .map((recall) => {
          const distance = calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            recall.latitude!,
            recall.longitude!
          );
          return { ...recall, distance };
        })
        .filter((recall) => recall.distance <= radiusKm)
        .sort((a, b) => a.distance - b.distance);

      console.log(`Found ${filteredRecalls.length} recalls within ${radiusKm}km`);

      if (filteredRecalls.length === 0) {
        console.log('No recalls found within proximity');
        return new Response(
          JSON.stringify({
            hasLocationIntent: true,
            locationResolved: true,
            recallIds: [],
            locationInfo: {
              location: 'Your current location',
              resolvedPlace: 'Your current location',
              proximity: radiusKm,
              intentType: 'near_me',
              coordinates: {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
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
            location: 'Your current location',
            resolvedPlace: 'Your current location',
            proximity: radiusKm,
            intentType: 'near_me',
            coordinates: {
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            },
          },
          cleanedQuery: locationIntent.cleanedQuery,
          processingTimeMs: Date.now() - startTime,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Step 2: Resolve location using Google Places API
    console.log('Step 2: Resolving location with Google Places API...');
    const placeResult = await searchGooglePlaces(
      locationIntent.location,
      googleApiKey,
      userLocation
    );

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

    // Step 3: Determine search strategy based on intent type
    let searchStrategy: 'bounding_box' | 'radius';
    let bufferKm: number;

    if (locationIntent.intentType === 'in') {
      // "in [location]" - use bounding box with 500m buffer
      searchStrategy = 'bounding_box';
      bufferKm = 0.5; // 500m
      console.log('Using bounding box strategy with 500m buffer');
    } else {
      // "near [location]" - use 1km radius
      searchStrategy = 'radius';
      bufferKm = 1; // 1km
      console.log('Using radius strategy with 1km radius');
    }

    // Step 4: Fetch all recalls with location data for this user
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

    // Step 5: Filter recalls based on strategy
    console.log(`Step 4: Filtering recalls using ${searchStrategy} strategy...`);
    let filteredRecalls: any[];

    if (searchStrategy === 'bounding_box') {
      // Calculate bounding box with buffer
      const bbox = calculateBoundingBox(
        placeResult.latitude,
        placeResult.longitude,
        bufferKm
      );

      console.log('Bounding box:', bbox);

      // Filter recalls within bounding box
      filteredRecalls = (recallsData || [])
        .filter((recall) => {
          const lat = recall.latitude!;
          const lon = recall.longitude!;
          return (
            lat >= bbox.minLat &&
            lat <= bbox.maxLat &&
            lon >= bbox.minLon &&
            lon <= bbox.maxLon
          );
        })
        .map((recall) => {
          const distance = calculateDistance(
            placeResult.latitude,
            placeResult.longitude,
            recall.latitude!,
            recall.longitude!
          );
          return { ...recall, distance };
        })
        .sort((a, b) => a.distance - b.distance);
    } else {
      // Use radius-based filtering
      filteredRecalls = (recallsData || [])
        .map((recall) => {
          const distance = calculateDistance(
            placeResult.latitude,
            placeResult.longitude,
            recall.latitude!,
            recall.longitude!
          );
          return { ...recall, distance };
        })
        .filter((recall) => recall.distance <= bufferKm)
        .sort((a, b) => a.distance - b.distance);
    }

    console.log(`Found ${filteredRecalls.length} recalls using ${searchStrategy} strategy`);

    if (filteredRecalls.length === 0) {
      console.log('No recalls found within search area');
      return new Response(
        JSON.stringify({
          hasLocationIntent: true,
          locationResolved: true,
          recallIds: [],
          locationInfo: {
            location: locationIntent.location,
            resolvedPlace: placeResult.displayName,
            proximity: bufferKm,
            intentType: locationIntent.intentType,
            searchStrategy,
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
          location: locationIntent.location,
          resolvedPlace: placeResult.displayName,
          proximity: bufferKm,
          intentType: locationIntent.intentType,
          searchStrategy,
          coordinates: {
            latitude: placeResult.latitude,
            longitude: placeResult.longitude,
          },
        },
        cleanedQuery: locationIntent.cleanedQuery,
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
