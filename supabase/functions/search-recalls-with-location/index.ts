
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

interface RecallRecord {
  id: string;
  text: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface SearchResult {
  id: string;
  text: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  relevance_score: number;
  relevance_reason: string;
  created_at: string;
  updated_at: string;
}

interface LocationEntity {
  location: string;
  proximity?: number; // in kilometers
  type: 'in' | 'near' | 'within' | 'close to' | 'around'| 'from';
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

interface PlaceResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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
async function extractLocationEntities(query: string, openaiApiKey: string): Promise<LocationEntity | null> {
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

    const data: OpenAIResponse = await response.json();
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
      proximity: nerResult.proximity || 5, // Default to 5km if not specified
      type: nerResult.type || 'near',
    };
  } catch (error) {
    console.error('Error extracting location entities:', error);
    return null;
  }
}

/**
 * Search for a place using Google Places API
 */
async function searchGooglePlaces(locationQuery: string, googleApiKey: string): Promise<PlaceResult | null> {
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

/**
 * Filter search results based on location proximity
 */
function filterByLocation(
  results: SearchResult[],
  targetLocation: { latitude: number; longitude: number },
  proximityKm: number
): SearchResult[] {
  console.log(`Filtering results within ${proximityKm}km of location:`, targetLocation);

  const filtered = results.filter((result) => {
    // If the recall doesn't have location data, exclude it
    if (!result.latitude || !result.longitude) {
      console.log(`Excluding result ${result.id} - no location data`);
      return false;
    }

    const distance = calculateDistance(
      targetLocation.latitude,
      targetLocation.longitude,
      result.latitude,
      result.longitude
    );

    console.log(`Result ${result.id} distance: ${distance.toFixed(2)}km`);

    return distance <= proximityKm;
  });

  // Sort by distance
  filtered.sort((a, b) => {
    const distA = calculateDistance(
      targetLocation.latitude,
      targetLocation.longitude,
      a.latitude!,
      a.longitude!
    );
    const distB = calculateDistance(
      targetLocation.latitude,
      targetLocation.longitude,
      b.latitude!,
      b.longitude!
    );
    return distA - distB;
  });

  console.log(`Filtered ${filtered.length} results within ${proximityKm}km`);
  return filtered;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    console.log('=== search-recalls-with-location function invoked ===');

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify the user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    console.log('Authenticated user:', user.id);

    // Parse request body
    const { query, limit = 10 } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query parameter is required' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
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
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    if (!googleApiKey) {
      console.error('GOOGLE_PLACES_API_KEY not set');
      return new Response(
        JSON.stringify({ error: 'Google Places API key not configured' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Step 1: Call the existing search-recalls function
    console.log('Step 1: Calling search-recalls function...');
    const searchRecallsResponse = await supabase.functions.invoke('search-recalls', {
      body: { query, limit },
      headers: {
        Authorization: authHeader,
      },
    });

    if (searchRecallsResponse.error) {
      console.error('Error calling search-recalls:', searchRecallsResponse.error);
      return new Response(
        JSON.stringify({ error: 'Failed to search recalls', details: searchRecallsResponse.error }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    const searchRecallsData = searchRecallsResponse.data || {};
    const searchResults = searchRecallsData.results || [];
    const answer = searchRecallsData.answer || null;
    const confidence = searchRecallsData.confidence || 0;
    
    console.log(`search-recalls returned ${searchResults.length} results`);
    console.log('Answer from search-recalls:', answer);
    console.log('Confidence from search-recalls:', confidence);

    // Step 2: Apply NLP NER to detect location intent
    console.log('Step 2: Applying NLP NER for location detection...');
    const locationEntity = await extractLocationEntities(query, openaiApiKey);

    // If no location intent detected, return original results with answer and confidence
    if (!locationEntity) {
      console.log('No location intent detected - returning original results');
      return new Response(
        JSON.stringify({
          answer,
          confidence,
          results: searchResults,
          total: searchResults.length,
          query,
          locationFiltered: false,
        }),
        {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    console.log('Location entity detected:', locationEntity);

    // Step 3: Use Google Places API to get coordinates for the location
    console.log('Step 3: Resolving location with Google Places API...');
    const placeResult = await searchGooglePlaces(locationEntity.location, googleApiKey);

    if (!placeResult) {
      console.log('Could not resolve location - returning original results');
      return new Response(
        JSON.stringify({
          answer,
          confidence,
          results: searchResults,
          total: searchResults.length,
          query,
          locationFiltered: false,
          locationError: 'Could not resolve location',
        }),
        {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    console.log('Location resolved:', placeResult);

    // Step 4: Filter results based on proximity to the location
    console.log('Step 4: Filtering results by location proximity...');
    const filteredResults = filterByLocation(
      searchResults,
      { latitude: placeResult.latitude, longitude: placeResult.longitude },
      locationEntity.proximity || 5
    );

    console.log(`Returning ${filteredResults.length} location-filtered results`);

    return new Response(
      JSON.stringify({
        answer,
        confidence,
        results: filteredResults,
        total: filteredResults.length,
        query,
        locationFiltered: true,
        locationInfo: {
          location: locationEntity.location,
          resolvedPlace: placeResult.displayName,
          proximity: locationEntity.proximity,
          coordinates: {
            latitude: placeResult.latitude,
            longitude: placeResult.longitude,
          },
        },
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Error in search-recalls-with-location function:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
