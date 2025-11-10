
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

const GOOGLE_PLACES_API_KEY = 'AIzaSyBWBDKiE0TRgWvmXtKcsgD_VgE2Xe68y48'; // Replace with your actual API key

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
 * Returns formatted as "place name, suburb"
 * @param latitude - Latitude coordinate
 * @param longitude - Longitude coordinate
 * @returns Formatted location name as "place name, suburb"
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
      throw new Error(`Google Geocoding API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      console.log('No results from reverse geocoding');
      return 'Unknown Location';
    }

    // Extract place name and suburb from the results
    let placeName = '';
    let suburb = '';
    let city = '';

    // Try to find the most specific place first (POI, establishment, etc.)
    for (const result of data.results) {
      const types = result.types || [];
      const addressComponents = result.address_components || [];

      // Look for a specific place (POI, establishment, premise, etc.)
      if (!placeName && (
        types.includes('point_of_interest') ||
        types.includes('establishment') ||
        types.includes('premise') ||
        types.includes('street_address')
      )) {
        // Use the first part of formatted address as place name
        const addressParts = result.formatted_address.split(',');
        if (addressParts.length > 0) {
          placeName = addressParts[0].trim();
        }
      }

      // Extract suburb and city from address components
      for (const component of addressComponents) {
        const componentTypes = component.types || [];
        
        if (componentTypes.includes('locality')) {
          city = component.long_name;
        } else if (componentTypes.includes('sublocality') || componentTypes.includes('sublocality_level_1')) {
          suburb = component.long_name;
        } else if (componentTypes.includes('neighborhood')) {
          if (!suburb) {
            suburb = component.long_name;
          }
        }
      }

      // If we have both place name and suburb, we can stop
      if (placeName && suburb) {
        break;
      }
    }

    // Format the location name as "place name, suburb"
    if (placeName && suburb) {
      console.log('Formatted location:', `${placeName}, ${suburb}`);
      return `${placeName}, ${suburb}`;
    } else if (placeName && city) {
      console.log('Formatted location:', `${placeName}, ${city}`);
      return `${placeName}, ${city}`;
    } else if (suburb && city) {
      console.log('Formatted location:', `${suburb}, ${city}`);
      return `${suburb}, ${city}`;
    } else if (placeName) {
      console.log('Formatted location:', placeName);
      return placeName;
    } else if (suburb) {
      console.log('Formatted location:', suburb);
      return suburb;
    } else if (city) {
      console.log('Formatted location:', city);
      return city;
    } else if (data.results[0].formatted_address) {
      // Fallback to formatted address, but try to shorten it
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
 * Extract a short location name from a formatted address or place result
 * Formats as "place name, suburb"
 * @param formattedAddress - Full formatted address
 * @param displayName - Optional display name (place name)
 * @returns Shortened location name as "place name, suburb"
 */
export function extractShortLocationName(formattedAddress: string, displayName?: string): string {
  const parts = formattedAddress.split(',').map(p => p.trim());
  
  if (parts.length < 2) {
    return formattedAddress;
  }

  const firstPart = parts[0];
  const secondPart = parts[1];
  
  // If we have a display name (place name), use it with the suburb
  if (displayName && displayName !== firstPart) {
    // Try to find the suburb from the address parts
    // Skip the first part if it's a street address
    if (/^\d/.test(firstPart)) {
      // First part is a street number, second part is likely street name
      if (parts.length >= 3) {
        return `${displayName}, ${parts[2]}`;
      }
      return `${displayName}, ${secondPart}`;
    } else {
      // First part might be the place name, use second part as suburb
      return `${displayName}, ${secondPart}`;
    }
  }
  
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
