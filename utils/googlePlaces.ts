// SECURITY: All Google Places API calls now go through the server-side
// `google-places-proxy` Supabase edge function. The previous client-side
// API key (AIzaSyBWBDKiE0TRgWvmXtKcsgD_VgE2Xe68y48) has been rotated and
// must be revoked in Google Cloud Console. No API key is held on the client.

import { supabase } from './supabase';

export interface PlaceResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  distance?: number;
  primaryTypeDisplayName?: string;
  suburb?: string;
  locality?: string;
}

interface SuburbLocalityResult {
  suburb?: string;
  locality?: string;
}

/**
 * Extract suburb and locality from address components
 */
function extractSuburbAndLocality(addressComponents: any[]): SuburbLocalityResult {
  let suburb: string | undefined;
  let locality: string | undefined;

  console.log('Extracting suburb and locality from address components:', JSON.stringify(addressComponents, null, 2));

  for (const component of addressComponents) {
    const types = component.types || [];
    
    if (!suburb && (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood'))) {
      suburb = component.longText || component.long_name;
      console.log('Found suburb:', suburb, 'from types:', types);
    }
    
    if (!locality && types.includes('locality')) {
      locality = component.longText || component.long_name;
      console.log('Found locality:', locality, 'from types:', types);
    }
    
    if (suburb && locality) {
      break;
    }
  }

  console.log('Extracted suburb:', suburb, 'locality:', locality);
  return { suburb, locality };
}

/**
 * Invoke the google-places-proxy edge function.
 * The proxy forwards Google's JSON verbatim so callers see the same shape.
 */
async function invokeProxy(kind: string, params: Record<string, unknown>): Promise<any> {
  console.log(`[googlePlaces] invokeProxy kind=${kind}`, params);
  const { data, error } = await supabase.functions.invoke('google-places-proxy', {
    body: { kind, ...params },
  });
  if (error) {
    console.error(`[googlePlaces] proxy error for kind=${kind}:`, error);
    throw new Error(error.message || 'google-places-proxy error');
  }
  return data;
}

/**
 * Get place details including primaryTypeDisplayName and address components
 */
export async function getPlaceDetails(placeId: string): Promise<{ 
  primaryTypeDisplayName?: string;
  suburb?: string;
  locality?: string;
} | null> {
  try {
    console.log('[googlePlaces] getPlaceDetails for:', placeId);
    const data = await invokeProxy('details', { placeId });
    console.log('[googlePlaces] place details response:', JSON.stringify(data, null, 2));

    const { suburb, locality } = extractSuburbAndLocality(data.addressComponents || []);

    return {
      primaryTypeDisplayName: data.primaryTypeDisplayName?.text,
      suburb,
      locality,
    };
  } catch (error) {
    console.error('[googlePlaces] Error fetching place details:', error);
    return null;
  }
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
  const R = 6371;
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
 * Search for nearby places using the proxy (Nearby Search)
 */
export async function searchNearbyPlaces(
  userLocation: { latitude: number; longitude: number },
  maxResults: number = 10
): Promise<PlaceResult[]> {
  try {
    console.log('[googlePlaces] searchNearbyPlaces at:', userLocation);
    
    const data = await invokeProxy('nearbysearch', {
      location: { lat: userLocation.latitude, lng: userLocation.longitude },
      maxResults,
      radius: 2000,
      rankPreference: 'DISTANCE',
    });

    console.log('[googlePlaces] nearbysearch response:', JSON.stringify(data, null, 2));

    if (!data.places || data.places.length === 0) {
      console.log('[googlePlaces] No nearby places found');
      return [];
    }

    const results: PlaceResult[] = data.places.map((place: any) => {
      const latitude = place.location?.latitude || 0;
      const longitude = place.location?.longitude || 0;
      
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        latitude,
        longitude
      );

      console.log('[googlePlaces] Processing place:', place.displayName?.text);
      console.log('[googlePlaces] Address components:', JSON.stringify(place.addressComponents, null, 2));
      
      const { suburb, locality } = extractSuburbAndLocality(place.addressComponents || []);

      return {
        placeId: place.id,
        displayName: place.displayName?.text || 'Unknown Place',
        formattedAddress: place.formattedAddress || '',
        latitude,
        longitude,
        distance,
        primaryTypeDisplayName: place.primaryTypeDisplayName?.text,
        suburb,
        locality,
      };
    });

    results.sort((a, b) => {
      const distA = a.distance || Infinity;
      const distB = b.distance || Infinity;
      return distA - distB;
    });

    console.log(`[googlePlaces] Found ${results.length} nearby places with suburb/locality data`);
    results.forEach(r => {
      console.log(`- ${r.displayName}: suburb=${r.suburb}, locality=${r.locality}`);
    });
    
    return results;
  } catch (error) {
    console.error('[googlePlaces] Error searching nearby places:', error);
    throw error;
  }
}

/**
 * Search for places using the proxy (Text Search)
 */
export async function searchPlaces(
  query: string,
  userLocation?: { latitude: number; longitude: number }
): Promise<PlaceResult[]> {
  try {
    if (!query.trim()) {
      return [];
    }

    console.log('[googlePlaces] searchPlaces for:', query);
    
    const data = await invokeProxy('textsearch', {
      query,
      ...(userLocation && {
        location: { lat: userLocation.latitude, lng: userLocation.longitude },
      }),
    });

    console.log('[googlePlaces] textsearch response:', JSON.stringify(data, null, 2));

    if (!data.places || data.places.length === 0) {
      console.log('[googlePlaces] No places found');
      return [];
    }

    const results: PlaceResult[] = data.places.map((place: any) => {
      const latitude = place.location?.latitude || 0;
      const longitude = place.location?.longitude || 0;
      
      let distance: number | undefined;
      if (userLocation) {
        distance = calculateDistance(
          userLocation.latitude,
          userLocation.longitude,
          latitude,
          longitude
        );
      }

      console.log('[googlePlaces] Processing place:', place.displayName?.text);
      console.log('[googlePlaces] Address components:', JSON.stringify(place.addressComponents, null, 2));
      
      const { suburb, locality } = extractSuburbAndLocality(place.addressComponents || []);

      return {
        placeId: place.id,
        displayName: place.displayName?.text || 'Unknown Place',
        formattedAddress: place.formattedAddress || '',
        latitude,
        longitude,
        distance,
        primaryTypeDisplayName: place.primaryTypeDisplayName?.text,
        suburb,
        locality,
      };
    });

    if (userLocation) {
      results.sort((a, b) => {
        const distA = a.distance || Infinity;
        const distB = b.distance || Infinity;
        return distA - distB;
      });
    }

    console.log(`[googlePlaces] Found ${results.length} places with suburb/locality data`);
    results.forEach(r => {
      console.log(`- ${r.displayName}: suburb=${r.suburb}, locality=${r.locality}`);
    });

    return results.slice(0, 5);
  } catch (error) {
    console.error('[googlePlaces] Error searching places:', error);
    throw error;
  }
}

/**
 * Reverse geocode coordinates to get place information with street-level accuracy.
 * Returns formatted as "Street Number Street Name, Suburb" or fallback formats.
 */
export async function reverseGeocodeGoogle(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    console.log('[googlePlaces] reverseGeocodeGoogle:', { latitude, longitude });

    // Reverse-geocode via the proxy's 'geocode' kind (Google Geocoding API)
    const data = await invokeProxy('geocode', {
      latlng: `${latitude},${longitude}`,
      resultType: 'street_address|premise|subpremise|route',
    });

    if (!data || data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
      console.log('[googlePlaces] reverseGeocodeGoogle: no results, status:', data?.status);
      return 'Unknown Location';
    }

    console.log('[googlePlaces] reverseGeocodeGoogle: found', data.results.length, 'results');

    let streetNumber = '';
    let streetName = '';
    let suburb = '';
    let locality = '';

    const bestResult = data.results.find((result: any) => 
      result.types.includes('street_address') || 
      result.types.includes('premise') ||
      result.types.includes('subpremise')
    ) || data.results[0];

    console.log('[googlePlaces] reverseGeocodeGoogle: using result with types:', bestResult.types);

    for (const component of bestResult.address_components) {
      const types = component.types || [];
      
      if (types.includes('street_number')) {
        streetNumber = component.long_name;
      } else if (types.includes('route')) {
        streetName = component.long_name;
      } else if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
        suburb = component.long_name;
      } else if (types.includes('neighborhood') && !suburb) {
        suburb = component.long_name;
      } else if (types.includes('locality')) {
        locality = component.long_name;
      }
    }

    let formattedLocation = '';

    if (streetNumber && streetName && suburb) {
      formattedLocation = `${streetNumber} ${streetName}, ${suburb}`;
    } else if (streetName && suburb) {
      formattedLocation = `${streetName}, ${suburb}`;
    } else if (streetNumber && streetName && locality) {
      formattedLocation = `${streetNumber} ${streetName}, ${locality}`;
    } else if (streetName && locality) {
      formattedLocation = `${streetName}, ${locality}`;
    } else if (suburb && locality) {
      formattedLocation = `${suburb}, ${locality}`;
    } else if (suburb) {
      formattedLocation = suburb;
    } else if (locality) {
      formattedLocation = locality;
    } else if (bestResult.formatted_address) {
      const parts = bestResult.formatted_address.split(',');
      if (parts.length >= 2) {
        formattedLocation = `${parts[0].trim()}, ${parts[1].trim()}`;
      } else {
        formattedLocation = parts[0].trim();
      }
    }

    if (!formattedLocation) {
      console.log('[googlePlaces] reverseGeocodeGoogle: no formatted location');
      return 'Unknown Location';
    }

    console.log('[googlePlaces] reverseGeocodeGoogle: final location:', formattedLocation);
    return formattedLocation;
  } catch (error) {
    console.error('[googlePlaces] reverseGeocodeGoogle exception:', error);
    return 'Unknown Location';
  }
}

/**
 * Extract a short location name from a place result.
 * Formats as "DisplayName, Suburb" or "DisplayName, Locality".
 */
export function extractShortLocationName(
  displayName: string,
  suburb?: string,
  locality?: string
): string {
  console.log('[googlePlaces] extractShortLocationName:', { displayName, suburb, locality });
  
  if (suburb) {
    const formatted = `${displayName}, ${suburb}`;
    console.log('[googlePlaces] formatted with suburb:', formatted);
    return formatted;
  }
  
  if (locality) {
    const formatted = `${displayName}, ${locality}`;
    console.log('[googlePlaces] formatted with locality:', formatted);
    return formatted;
  }
  
  console.log('[googlePlaces] formatted (no suburb/locality):', displayName);
  return displayName;
}

/**
 * Check if the Google Places proxy is available (always true — key is server-side).
 */
export function isGooglePlacesConfigured(): boolean {
  return true;
}
