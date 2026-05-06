import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBoundingBox(lat: number, lon: number, km: number) {
  const R = 6371;
  const latDelta = (km / R) * (180 / Math.PI);
  const lonDelta = latDelta / Math.cos((lat * Math.PI) / 180);
  return { minLat: lat - latDelta, maxLat: lat + latDelta, minLon: lon - lonDelta, maxLon: lon + lonDelta };
}

function extractDistanceFromQuery(query: string): number | null {
  const m = query.match(/(\d+(?:\.\d+)?)\s*km/i);
  return m ? parseFloat(m[1]) || null : null;
}

async function detectLocationIntents(query: string, claudeApiKey: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': claudeApiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: `Detect ALL location intents. Return JSON array only:
[{"hasLocationIntent":true/false,"intentType":"in"|"near"|"near_me"|null,"location":"name"|null,"confidence":0-100}]
"in [loc]"=within area (500m), "near [loc]"=near place (1km), "near me"=user location (1km).
Extract ALL locations. JSON array only, no markdown.`,
      messages: [{ role: 'user', content: `Analyze: "${query}"` }]
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.content?.[0]?.text?.trim();
  if (!text) return null;
  try {
    const results = JSON.parse(text);
    const valid = Array.isArray(results) ? results.filter((r: any) => r.hasLocationIntent && r.confidence >= 70) : [];
    return valid.length ? valid : null;
  } catch {
    return null;
  }
}

async function searchGooglePlaces(locationQuery: string, googleApiKey: string, userLocation?: { latitude: number; longitude: number }) {
  const body: any = { textQuery: locationQuery, languageCode: 'en', maxResultCount: 1 };
  if (userLocation) {
    body.locationBias = { circle: { center: { latitude: userLocation.latitude, longitude: userLocation.longitude }, radius: 50000.0 } };
  }
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleApiKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.location' },
    body: JSON.stringify(body)
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.places?.length) return null;
  const p = data.places[0];
  return { placeId: p.id, displayName: p.displayName?.text || 'Unknown Place', latitude: p.location?.latitude || 0, longitude: p.location?.longitude || 0 };
}

function filterRecallsByLocation(recalls: any[], place: any, strategy: string, bufferKm: number): any[] {
  if (strategy === 'bounding_box') {
    const bbox = calculateBoundingBox(place.latitude, place.longitude, bufferKm);
    return recalls
      .filter(r => r.latitude >= bbox.minLat && r.latitude <= bbox.maxLat && r.longitude >= bbox.minLon && r.longitude <= bbox.maxLon)
      .map(r => ({ ...r, distance: calculateDistance(place.latitude, place.longitude, r.latitude, r.longitude) }))
      .sort((a, b) => a.distance - b.distance);
  }
  return recalls
    .map(r => ({ ...r, distance: calculateDistance(place.latitude, place.longitude, r.latitude, r.longitude) }))
    .filter(r => r.distance <= bufferKm)
    .sort((a, b) => a.distance - b.distance);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const startTime = Date.now();
  console.log('=== search-recalls-with-location started ===', new Date().toISOString());

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { query, userLocation } = await req.json();
    if (!query || typeof query !== 'string' || !query.trim()) {
      return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Query: "${query}"`);

    const claudeApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!claudeApiKey || !googleApiKey) {
      return new Response(JSON.stringify({ error: 'API keys not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Location intent detection + DB fetch in parallel
    const [locationIntents, recallsResult] = await Promise.all([
      detectLocationIntents(query, claudeApiKey),
      supabase
        .from('recalls')
        .select('id, latitude, longitude, location, location_primary_type')
        .eq('user_id', user.id)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
    ]);

    if (!locationIntents?.length) {
      return new Response(JSON.stringify({ hasLocationIntent: false, shouldUseRegularSearch: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (recallsResult.error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch recalls' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const recallsData = recallsResult.data ?? [];
    console.log(`Processing ${locationIntents.length} location(s) against ${recallsData.length} recalls`);

    // Process all locations in parallel
    const locationResults = await Promise.all(
      locationIntents.map(async (intent: any) => {
        if (intent.intentType === 'near_me') {
          if (!userLocation?.latitude || !userLocation?.longitude) {
            return { hasLocationIntent: true, locationResolved: false, error: 'User location required' };
          }
          const radiusKm = extractDistanceFromQuery(query) ?? 1;
          const filtered = recallsData
            .map(r => ({ ...r, distance: calculateDistance(userLocation.latitude, userLocation.longitude, r.latitude!, r.longitude!) }))
            .filter(r => r.distance <= radiusKm)
            .sort((a, b) => a.distance - b.distance);
          return {
            hasLocationIntent: true, locationResolved: true,
            recallIds: filtered.map(r => r.id),
            locationInfo: { location: 'Your current location', resolvedPlace: 'Your current location', proximity: radiusKm, intentType: 'near_me', coordinates: { latitude: userLocation.latitude, longitude: userLocation.longitude } }
          };
        }

        const place = await searchGooglePlaces(intent.location, googleApiKey, userLocation);
        if (!place) return { hasLocationIntent: true, locationResolved: false, location: intent.location };

        const strategy = intent.intentType === 'in' ? 'bounding_box' : 'radius';
        const bufferKm = intent.intentType === 'in' ? 0.5 : 1;
        const filtered = filterRecallsByLocation(recallsData, place, strategy, bufferKm);

        return {
          hasLocationIntent: true, locationResolved: true,
          recallIds: filtered.map(r => r.id),
          locationInfo: { location: intent.location, resolvedPlace: place.displayName, proximity: bufferKm, intentType: intent.intentType, searchStrategy: strategy, coordinates: { latitude: place.latitude, longitude: place.longitude } }
        };
      })
    );

    const resolved = locationResults.filter((r: any) => r.locationResolved);
    if (!resolved.length) {
      return new Response(JSON.stringify({
        hasLocationIntent: true, locationResolved: false,
        shouldUseRegularSearch: true, attemptedLocations: locationIntents.length
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const allRecallIds = new Set<string>();
    for (const r of resolved) for (const id of r.recallIds) allRecallIds.add(id);

    const locationNames = resolved.map((r: any) => r.locationInfo.resolvedPlace).join(', ');
    const primary = resolved[0].locationInfo;

    const processingTime = Date.now() - startTime;
    console.log(`Found ${allRecallIds.size} recalls across ${resolved.length} location(s) | ${processingTime}ms`);

    return new Response(JSON.stringify({
      hasLocationIntent: true, locationResolved: true,
      recallIds: Array.from(allRecallIds),
      locationInfo: {
        location: locationNames, resolvedPlace: locationNames,
        proximity: primary.proximity, intentType: primary.intentType,
        searchStrategy: primary.searchStrategy, coordinates: primary.coordinates,
        multipleLocations: resolved.length > 1, locationCount: resolved.length,
        locations: resolved.map((r: any) => r.locationInfo)
      },
      cleanedQuery: query,
      processingTimeMs: processingTime
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Error in search-recalls-with-location:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      processingTimeMs: processingTime
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
