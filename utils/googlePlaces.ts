
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

const GOOGLE_PLACES_API_KEY = 'YOUR_GOOGLE_PLACES_API_KEY'; // Replace with your actual API key

export interface PlaceResult {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  distance?: number;
}

/**
 * Search for places using Google Places API (Text Search)
 * @param query - The search query
 * @param userLocation - Optional user location for proximity bias
 * @returns Array of place results
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
    
    // Build the request URL for Places API (New) - Text Search
    const baseUrl = 'https://places.googleapis.com/v1/places:searchText';
    
    const requestBody = {
      textQuery: query,
      languageCode: 'en',
      regionCode: 'AU', // Restrict to Australia
      maxResultCount: 10,
      ...(userLocation && {
        locationBias: {
          circle: {
            center: {
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            },
            radius: 50000.0, // 50km radius
          },
        },
      }),
    };

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', response.status, errorText);
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Google Places API response:', data);

    if (!data.places || data.places.length === 0) {
      console.log('No places found');
      return [];
    }

    // Transform the results
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

      return {
        placeId: place.id,
        displayName: place.displayName?.text || 'Unknown Place',
        formattedAddress: place.formattedAddress || '',
        latitude,
        longitude,
        distance,
      };
    });

    // Sort by distance if user location is available
    if (userLocation) {
      results.sort((a, b) => {
        const distA = a.distance || Infinity;
        const distB = b.distance || Infinity;
        return distA - distB;
      });
    }

    console.log(`Found ${results.length} places`);
    return results.slice(0, 5); // Return top 5 results
  } catch (error) {
    console.error('Error searching places:', error);
    throw error;
  }
}

/**
 * Reverse geocode coordinates to get place information
 * @param latitude - Latitude coordinate
 * @param longitude - Longitude coordinate
 * @returns Formatted location name
 */
export async function reverseGeocodeGoogle(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    console.log('Reverse geocoding with Google:', { latitude, longitude });

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_PLACES_API_KEY}&result_type=locality|sublocality|neighborhood`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error('Google Geocoding API error:', response.status);
      throw new Error(`Google Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.log('No results from reverse geocoding');
      return 'Unknown Location';
    }

    // Extract suburb and city from the first result
    const result = data.results[0];
    const addressComponents = result.address_components || [];

    let suburb = '';
    let city = '';

    for (const component of addressComponents) {
      const types = component.types || [];
      
      if (types.includes('locality')) {
        city = component.long_name;
      } else if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
        suburb = component.long_name;
      } else if (types.includes('neighborhood')) {
        if (!suburb) {
          suburb = component.long_name;
        }
      }
    }

    // Format the location name
    if (suburb && city) {
      return `${suburb}, ${city}`;
    } else if (city) {
      return city;
    } else if (suburb) {
      return suburb;
    } else if (result.formatted_address) {
      // Fallback to formatted address, but try to shorten it
      const parts = result.formatted_address.split(',');
      if (parts.length >= 2) {
        return `${parts[0].trim()}, ${parts[1].trim()}`;
      }
      return parts[0].trim();
    }

    return 'Unknown Location';
  } catch (error) {
    console.error('Error in reverse geocoding:', error);
    return 'Unknown Location';
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 - First latitude
 * @param lon1 - First longitude
 * @param lat2 - Second latitude
 * @param lon2 - Second longitude
 * @returns Distance in kilometers
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
 * Extract a short location name from a formatted address
 * @param formattedAddress - Full formatted address
 * @returns Shortened location name
 */
export function extractShortLocationName(formattedAddress: string): string {
  const parts = formattedAddress.split(',').map(p => p.trim());
  
  if (parts.length < 2) {
    return formattedAddress;
  }

  const firstPart = parts[0];
  const secondPart = parts[1];
  
  // If first part is a street number, use second and third parts
  if (firstPart && /^\d/.test(firstPart)) {
    if (parts.length >= 3) {
      return `${secondPart}, ${parts[2]}`;
    }
    return secondPart;
  }
  
  // Otherwise use first and second parts
  return `${firstPart}, ${secondPart}`;
}

/**
 * Check if Google Places API key is configured
 * @returns true if API key is set
 */
export function isGooglePlacesConfigured(): boolean {
  return GOOGLE_PLACES_API_KEY !== 'YOUR_GOOGLE_PLACES_API_KEY' && GOOGLE_PLACES_API_KEY.length > 0;
}
