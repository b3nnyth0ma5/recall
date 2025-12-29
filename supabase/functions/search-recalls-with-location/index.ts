
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

/**
 * Calculate distance between two coordinates using Haversine formula - OPTIMIZED
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
  return R * c;
}

/**
 * Calculate bounding box from center point and buffer distance - OPTIMIZED
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
 * Extract distance from query - OPTIMIZED
 */
function extractDistanceFromQuery(query: string): number | null {
  const distancePattern = /(\d+(?:\.\d+)?)\s*km/i;
  const match = query.match(distancePattern);
  
  if (match && match[1]) {
    const distance = parseFloat(match[1]);
    if (!isNaN(distance) && distance > 0) {
      return distance;
    }
  }
  
  return null;
}

/**
 * Use GPT-4o-mini to detect location intent - OPTIMIZED
 */
async function detectLocationIntent(query: string, openaiApiKey: string) {
  try {
    console.log('Detecting location intent...');

    // Optimized prompt for faster processing
    const systemPrompt = `Detect location intent. Return JSON:
{"hasLocationIntent": true/false, "intentType": "in"|"near"|"near_me"|null, "location": "name"|null, "cleanedQuery": "text", "confidence": 0-100}

"in [location]" = within area (500m buffer)
"near [location]" = near place (1km radius)
"near me" = user location (1km radius)

Be precise - only detect explicit location intent.`;

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
        max_tokens: 100, // Reduced for speed
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
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

    if (!result.hasLocationIntent || result.confidence < 70) {
      return null;
    }

    return result;
  } catch (error) {
    console.error('Error detecting location intent:', error);
    return null;
  }
}

/**
 * Search for a place using Google Places API - OPTIMIZED
 */
async function searchGooglePlaces(locationQuery: string, googleApiKey: string, userLocation?: { latitude: number; longitude: number }) {
  try {
    console.log('Searching Google Places...');

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
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.places || data.places.length === 0) {
      return null;
    }

    const place = data.places[0];
    return {
      placeId: place.id,
      displayName: place.displayName?.text || 'Unknown Place',
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
  console.log('=== search-recalls-with-location started ===');

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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { query, userLocation } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get API keys
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!openaiApiKey || !googleApiKey) {
      return new Response(
        JSON.stringify({ error: 'API keys not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // OPTIMIZATION: Run location intent detection and recall fetching in parallel
    const [locationIntent, recallsResult] = await Promise.all([
      detectLocationIntent(query, openaiApiKey),
      supabase
        .from('recalls')
        .select('id, latitude, longitude, location, location_primary_type')
        .eq('user_id', user.id)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
    ]);

    // If no location intent detected, return early
    if (!locationIntent) {
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

    if (recallsResult.error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch recalls' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const recallsData = recallsResult.data || [];

    // Handle "near me" or "around me"
    if (locationIntent.intentType === 'near_me') {
      if (!userLocation || !userLocation.latitude || !userLocation.longitude) {
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

      const extractedDistance = extractDistanceFromQuery(query);
      const radiusKm = extractedDistance !== null ? extractedDistance : 1;

      // Filter recalls by proximity - OPTIMIZED single pass
      const filteredRecalls = recallsData
        .map((recall) => ({
          ...recall,
          distance: calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            recall.latitude!,
            recall.longitude!
          )
        }))
        .filter((recall) => recall.distance <= radiusKm)
        .sort((a, b) => a.distance - b.distance);

      const recallIds = filteredRecalls.map((r) => r.id);

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

    // Resolve location using Google Places API
    const placeResult = await searchGooglePlaces(
      locationIntent.location,
      googleApiKey,
      userLocation
    );

    if (!placeResult) {
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

    // Determine search strategy
    const searchStrategy = locationIntent.intentType === 'in' ? 'bounding_box' : 'radius';
    const bufferKm = locationIntent.intentType === 'in' ? 0.5 : 1;

    // Filter recalls - OPTIMIZED
    let filteredRecalls: any[];

    if (searchStrategy === 'bounding_box') {
      const bbox = calculateBoundingBox(
        placeResult.latitude,
        placeResult.longitude,
        bufferKm
      );

      filteredRecalls = recallsData
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
        .map((recall) => ({
          ...recall,
          distance: calculateDistance(
            placeResult.latitude,
            placeResult.longitude,
            recall.latitude!,
            recall.longitude!
          )
        }))
        .sort((a, b) => a.distance - b.distance);
    } else {
      filteredRecalls = recallsData
        .map((recall) => ({
          ...recall,
          distance: calculateDistance(
            placeResult.latitude,
            placeResult.longitude,
            recall.latitude!,
            recall.longitude!
          )
        }))
        .filter((recall) => recall.distance <= bufferKm)
        .sort((a, b) => a.distance - b.distance);
    }

    const recallIds = filteredRecalls.map((r) => r.id);

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
    console.error('=== Error in search-recalls-with-location ===');
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');

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
