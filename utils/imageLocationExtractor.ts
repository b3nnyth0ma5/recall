
import * as ImagePicker from 'expo-image-picker';
import { reverseGeocode } from './supabase';

export interface ImageLocationData {
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  suburb: string | null;
}

/**
 * Extract location data from an image asset
 * Attempts to get GPS coordinates from EXIF data and reverse geocode to get location name
 * 
 * @param asset - ImagePicker asset containing EXIF data
 * @returns Promise with location data or null values if not available
 */
export async function extractLocationFromImage(
  asset: ImagePicker.ImagePickerAsset
): Promise<ImageLocationData> {
  const result: ImageLocationData = {
    latitude: null,
    longitude: null,
    locationName: null,
    suburb: null,
  };

  try {
    console.log('=== Extracting location from image ===');
    console.log('Asset URI:', asset.uri);
    console.log('Has EXIF:', !!asset.exif);

    // Check if EXIF data exists
    if (!asset.exif) {
      console.log('No EXIF data available in image');
      return result;
    }

    // Extract GPS coordinates from EXIF data
    // EXIF GPS data can be in different formats depending on the platform
    const exif = asset.exif;
    
    // Try to get latitude and longitude from EXIF
    let latitude: number | null = null;
    let longitude: number | null = null;

    // Check for GPS coordinates in various EXIF formats
    if (exif.GPSLatitude !== undefined && exif.GPSLongitude !== undefined) {
      // Format 1: Direct decimal values
      if (typeof exif.GPSLatitude === 'number' && typeof exif.GPSLongitude === 'number') {
        latitude = exif.GPSLatitude;
        longitude = exif.GPSLongitude;
        
        // Adjust for hemisphere
        if (exif.GPSLatitudeRef === 'S') {
          latitude = -latitude;
        }
        if (exif.GPSLongitudeRef === 'W') {
          longitude = -longitude;
        }
        
        console.log('Found GPS coordinates (decimal):', { latitude, longitude });
      }
      // Format 2: DMS (Degrees, Minutes, Seconds) array format
      else if (Array.isArray(exif.GPSLatitude) && Array.isArray(exif.GPSLongitude)) {
        latitude = convertDMSToDecimal(exif.GPSLatitude);
        longitude = convertDMSToDecimal(exif.GPSLongitude);
        
        // Adjust for hemisphere
        if (exif.GPSLatitudeRef === 'S') {
          latitude = -latitude;
        }
        if (exif.GPSLongitudeRef === 'W') {
          longitude = -longitude;
        }
        
        console.log('Found GPS coordinates (DMS):', { latitude, longitude });
      }
    }
    // iOS sometimes stores coordinates differently
    else if (exif['{GPS}']) {
      const gpsData = exif['{GPS}'];
      if (gpsData.Latitude !== undefined && gpsData.Longitude !== undefined) {
        latitude = gpsData.Latitude;
        longitude = gpsData.Longitude;
        
        // Adjust for hemisphere
        if (gpsData.LatitudeRef === 'S') {
          latitude = -latitude;
        }
        if (gpsData.LongitudeRef === 'W') {
          longitude = -longitude;
        }
        
        console.log('Found GPS coordinates (iOS format):', { latitude, longitude });
      }
    }

    // Validate coordinates
    if (latitude !== null && longitude !== null) {
      // Check if coordinates are valid
      if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
        result.latitude = latitude;
        result.longitude = longitude;
        
        console.log('Valid GPS coordinates found:', { latitude, longitude });
        
        // Reverse geocode to get location name
        try {
          console.log('Reverse geocoding coordinates...');
          const locationName = await reverseGeocode(latitude, longitude);
          
          if (locationName && locationName !== 'Unknown Location') {
            result.locationName = locationName;
            
            // Try to extract suburb from location name
            // Format is typically "Place Name, Suburb" or "Suburb, City"
            const parts = locationName.split(',').map(p => p.trim());
            if (parts.length >= 2) {
              result.suburb = parts[1]; // Second part is usually suburb or city
            } else if (parts.length === 1) {
              result.suburb = parts[0];
            }
            
            console.log('Reverse geocoding successful:', {
              locationName: result.locationName,
              suburb: result.suburb,
            });
          } else {
            console.log('Reverse geocoding returned unknown location');
          }
        } catch (geocodeError) {
          console.error('Error during reverse geocoding:', geocodeError);
          // Don't throw - we still have coordinates
        }
      } else {
        console.log('Invalid GPS coordinates:', { latitude, longitude });
      }
    } else {
      console.log('No GPS coordinates found in EXIF data');
    }

    return result;
  } catch (error) {
    console.error('Error extracting location from image:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    // Return empty result instead of throwing
    return result;
  }
}

/**
 * Convert DMS (Degrees, Minutes, Seconds) to decimal degrees
 * 
 * @param dms - Array of [degrees, minutes, seconds]
 * @returns Decimal degrees
 */
function convertDMSToDecimal(dms: number[]): number {
  if (!Array.isArray(dms) || dms.length < 3) {
    return 0;
  }
  
  const degrees = dms[0] || 0;
  const minutes = dms[1] || 0;
  const seconds = dms[2] || 0;
  
  return degrees + minutes / 60 + seconds / 3600;
}

/**
 * Check if an image has location data
 * Quick check without full extraction
 * 
 * @param asset - ImagePicker asset
 * @returns True if image has GPS data
 */
export function hasLocationData(asset: ImagePicker.ImagePickerAsset): boolean {
  if (!asset.exif) {
    return false;
  }
  
  const exif = asset.exif;
  
  // Check various GPS data formats
  if (exif.GPSLatitude !== undefined && exif.GPSLongitude !== undefined) {
    return true;
  }
  
  if (exif['{GPS}'] && exif['{GPS}'].Latitude !== undefined) {
    return true;
  }
  
  return false;
}
