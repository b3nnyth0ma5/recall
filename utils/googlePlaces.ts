
/**
 * Google Places API utilities
 * 
 * Note: You need to set up a Google Cloud Project and enable the Places API
 * Get your API key from: https://console.cloud.google.com/
 * 
 * Required APIs:
 * - Places API (New)
 * - Geocoding API
 */

const GOOGLE_PLACES_API_KEY = 'AIzaSyBWBDKiE0TRgWvmXtKcsgD_VgE2Xe68y48';

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
 * Get place details including primaryTypeDisplayName and address components
 */
export async function getPlaceDetails(placeId: string): Promise<{ 
  primaryTypeDisplayName?: string;
  suburb?: string;
  locality?: string;
} | null> {
  try {
    console.log('Fetching place details for:', placeId);
    
    const baseUrl = `https://places.googleapis.com/v1/places/${placeId}`;
    
    const response = await fetch(baseUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'primaryTypeDisplayName,addressComponents',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('Place details response:', JSON.stringify(data, null, 2));

    const { suburb, locality } = extractSuburbAndLocality(data.addressComponents || []);

    return {
      primaryTypeDisplayName: data.primaryTypeDisplayName?.text,
      suburb,
      locality,
    };
  } catch (error) {
    console.error('Error fetching place details:', error);
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
 * Search for nearby places using Google Places API (Nearby Search)
 */
export async function searchNearbyPlaces(
  userLocation: { latitude: number; longitude: number },
  maxResults: number = 10
): Promise<PlaceResult[]> {
  try {
    console.log('Searching for nearby places at:', userLocation);
    
    const baseUrl = 'https://places.googleapis.com/v1/places:searchNearby';
    
    const requestBody = {
      locationRestriction: {
        circle: {
          center: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
          radius: 5000.0,
        },
      },
      maxResultCount: maxResults,
      languageCode: 'en',
      regionCode: 'AU',
      rankPreference: 'DISTANCE',
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.addressComponents',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', response.status, errorText);
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Google Places API nearby response:', JSON.stringify(data, null, 2));

    if (!data.places || data.places.length === 0) {
      console.log('No nearby places found');
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

      console.log('Processing place:', place.displayName?.text);
      console.log('Address components:', JSON.stringify(place.addressComponents, null, 2));
      
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

    console.log(`Found ${results.length} nearby places with suburb/locality data`);
    results.forEach(r => {
      console.log(`- ${r.displayName}: suburb=${r.suburb}, locality=${r.locality}`);
    });
    
    return results;
  } catch (error) {
    console.error('Error searching nearby places:', error);
    throw error;
  }
}

/**
 * Search for places using Google Places API (Text Search)
 */
export async function searchPlaces(
  query: string,
  userLocation?: { latitude: number; longitude: number }
): Promise<PlaceResult[]> {
  try {
    if (!query.trim()) {
      return [];
    }

    console.log('Searching Google Places for:', query);
    
    const baseUrl = 'https://places.googleapis.com/v1/places:searchText';
    
    const requestBody = {
      textQuery: query,
      languageCode: 'en',
      regionCode: 'AU',
      maxResultCount: 10,
      ...(userLocation && {
        locationBias: {
          circle: {
            center: {
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            },
            radius: 50000.0,
          },
        },
      }),
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName,places.addressComponents',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', response.status, errorText);
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Google Places API response:', JSON.stringify(data, null, 2));

    if (!data.places || data.places.length === 0) {
      console.log('No places found');
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

      console.log('Processing place:', place.displayName?.text);
      console.log('Address components:', JSON.stringify(place.addressComponents, null, 2));
      
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

    console.log(`Found ${results.length} places with suburb/locality data`);
    results.forEach(r => {
      console.log(`- ${r.displayName}: suburb=${r.suburb}, locality=${r.locality}`);
    });

    return results.slice(0, 5);
  } catch (error) {
    console.error('Error searching places:', error);
    throw error;
  }
}

/**
 * Reverse geocode coordinates to get place information
 * Returns formatted as "DisplayName, Suburb" or "DisplayName, Locality"
 */
export async function reverseGeocodeGoogle(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    console.log('Reverse geocoding with Google:', { latitude, longitude });

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_PLACES_API_KEY}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Google Geocoding API error:', response.status);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return 'Unknown Location';
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.log('No results from reverse geocoding, status:', data.status);
      return 'Unknown Location';
    }

    let placeName = '';
    let suburb = '';
    let locality = '';

    for (const result of data.results) {
      const types = result.types || [];
      const addressComponents = result.address_components || [];

      if (!placeName && (
        types.includes('point_of_interest') ||
        types.includes('establishment') ||
        types.includes('premise') ||
        types.includes('street_address')
      )) {
        const addressParts = result.formatted_address.split(',');
        if (addressParts.length > 0) {
          placeName = addressParts[0].trim();
        }
      }

      for (const component of addressComponents) {
        const componentTypes = component.types || [];
        
        if (componentTypes.includes('locality')) {
          locality = component.long_name;
        } else if (componentTypes.includes('sublocality') || componentTypes.includes('sublocality_level_1')) {
          suburb = component.long_name;
        } else if (componentTypes.includes('neighborhood')) {
          if (!suburb) {
            suburb = component.long_name;
          }
        }
      }

      if (placeName && suburb) {
        break;
      }
    }

    if (placeName && suburb) {
      const formatted = `${placeName}, ${suburb}`;
      console.log('Formatted location:', formatted);
      return formatted;
    } else if (placeName && locality) {
      const formatted = `${placeName}, ${locality}`;
      console.log('Formatted location:', formatted);
      return formatted;
    } else if (suburb && locality) {
      const formatted = `${suburb}, ${locality}`;
      console.log('Formatted location:', formatted);
      return formatted;
    } else if (placeName) {
      console.log('Formatted location:', placeName);
      return placeName;
    } else if (suburb) {
      console.log('Formatted location:', suburb);
      return suburb;
    } else if (locality) {
      console.log('Formatted location:', locality);
      return locality;
    } else if (data.results[0].formatted_address) {
      const parts = data.results[0].formatted_address.split(',');
      if (parts.length >= 2) {
        const formatted = `${parts[0].trim()}, ${parts[1].trim()}`;
        console.log('Formatted location (fallback):', formatted);
        return formatted;
      }
      console.log('Formatted location (fallback):', parts[0].trim());
      return parts[0].trim();
    }

    return 'Unknown Location';
  } catch (error) {
    console.error('Error in reverse geocoding:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return 'Unknown Location';
  }
}

/**
 * Extract a short location name from a place result
 * Formats as "DisplayName, Suburb" or "DisplayName, Locality"
 */
export function extractShortLocationName(
  displayName: string,
  suburb?: string,
  locality?: string
): string {
  console.log('extractShortLocationName called with:', { displayName, suburb, locality });
  
  if (suburb) {
    const formatted = `${displayName}, ${suburb}`;
    console.log('Formatted location with suburb:', formatted);
    return formatted;
  }
  
  if (locality) {
    const formatted = `${displayName}, ${locality}`;
    console.log('Formatted location with locality:', formatted);
    return formatted;
  }
  
  console.log('Formatted location (no suburb/locality):', displayName);
  return displayName;
}

/**
 * Check if Google Places API key is configured
 */
export function isGooglePlacesConfigured(): boolean {
  return GOOGLE_PLACES_API_KEY !== 'YOUR_GOOGLE_PLACES_API_KEY' && GOOGLE_PLACES_API_KEY.length > 0;
}
