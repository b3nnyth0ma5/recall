
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
  primaryTypeDisplayName?: string;
  suburb?: string;
  locality?: string;
}

/**
 * Extract suburb and locality from address components
 * @param addressComponents - Array of address components from Google Places API
 * @returns Object with suburb and locality
 */
function extractSuburbAndLocality(addressComponents: any[]): { suburb?: string; locality?: string } {
  let suburb: string | undefined;
  let locality: string | undefined;

  for (const component of addressComponents) {
    const types = component.types || [];
    
    // Extract suburb (sublocality or neighborhood)
    if (!suburb && (types.includes('sublocality') || types.includes('sublocality_level_1') || types.includes('neighborhood'))) {
      suburb = component.long_name;
    }
    
    // Extract locality (city/town)
    if (!locality && types.includes('locality')) {
      locality = component.long_name;
    }
    
    // If we have both, we can stop
    if (suburb && locality) {
      break;
    }
  }

  return { suburb, locality };
}

/**
 * Get place details including primaryTypeDisplayName and address components
 * @param placeId - The Google Place ID
 * @returns Place details including primary type, suburb, and locality
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
    console.log('Place details response:', data);

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
 * Search for nearby places using Google Places API (Nearby Search)
 * @param userLocation - User's current location
 * @param maxResults - Maximum number of results to return (default: 10)
 * @returns Array of nearby place results
 */
export async function searchNearbyPlaces(
  userLocation: { latitude: number; longitude: number },
  maxResults: number = 10
): Promise<PlaceResult[]> {
  try {
    console.log('Searching for nearby places at:', userLocation);
    
    // Build the request URL for Places API (New) - Nearby Search
    const baseUrl = 'https://places.googleapis.com/v1/places:searchNearby';
    
    const requestBody = {
      locationRestriction: {
        circle: {
          center: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
          radius: 5000.0, // 5km radius for nearby search
        },
      },
      maxResultCount: maxResults,
      languageCode: 'en',
      regionCode: 'AU', // Restrict to Australia
      rankPreference: 'DISTANCE', // Sort by distance
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
    console.log('Google Places API nearby response:', data);

    if (!data.places || data.places.length === 0) {
      console.log('No nearby places found');
      return [];
    }

    // Transform the results
    const results: PlaceResult[] = data.places.map((place: any) => {
      const latitude = place.location?.latitude || 0;
      const longitude = place.location?.longitude || 0;
      
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        latitude,
        longitude
      );

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

    // Already sorted by distance from API, but ensure it
    results.sort((a, b) => {
      const distA = a.distance || Infinity;
      const distB = b.distance || Infinity;
      return distA - distB;
    });

    console.log(`Found ${results.length} nearby places`);
    return results;
  } catch (error) {
    console.error('Error searching nearby places:', error);
    throw error;
  }
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
 * Returns formatted as "DisplayName, Suburb" or "DisplayName, Locality"
 * @param latitude - Latitude coordinate
 * @param longitude - Longitude coordinate
 * @returns Formatted location name as "DisplayName, Suburb" or "DisplayName, Locality"
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

    // Extract place name, suburb, and locality from the results
    let placeName = '';
    let suburb = '';
    let locality = '';

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

      // Extract suburb and locality from address components
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

      // If we have both place name and suburb, we can stop
      if (placeName && suburb) {
        break;
      }
    }

    // Format the location name as "DisplayName, Suburb" or "DisplayName, Locality"
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
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
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
 * Extract a short location name from a place result
 * Formats as "DisplayName, Suburb" or "DisplayName, Locality"
 * @param displayName - The display name of the place
 * @param suburb - Optional suburb name
 * @param locality - Optional locality name
 * @returns Shortened location name as "DisplayName, Suburb" or "DisplayName, Locality"
 */
export function extractShortLocationName(
  displayName: string,
  suburb?: string,
  locality?: string
): string {
  // Format as "DisplayName, Suburb" if suburb is available
  if (suburb) {
    const formatted = `${displayName}, ${suburb}`;
    console.log('Formatted location with suburb:', formatted);
    return formatted;
  }
  
  // Otherwise format as "DisplayName, Locality" if locality is available
  if (locality) {
    const formatted = `${displayName}, ${locality}`;
    console.log('Formatted location with locality:', formatted);
    return formatted;
  }
  
  // Fallback to just the display name
  console.log('Formatted location (no suburb/locality):', displayName);
  return displayName;
}

/**
 * Check if Google Places API key is configured
 * @returns true if API key is set
 */
export function isGooglePlacesConfigured(): boolean {
  return GOOGLE_PLACES_API_KEY !== 'YOUR_GOOGLE_PLACES_API_KEY' && GOOGLE_PLACES_API_KEY.length > 0;
}
