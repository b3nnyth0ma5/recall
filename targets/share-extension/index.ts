
/**
 * iOS Share Extension Entry Point
 * 
 * This file handles incoming shared content from other apps and saves it to the
 * App Group shared container for the main app to process.
 * 
 * Supported content types:
 * - Text (plain text, notes)
 * - URLs (web links, file URLs)
 * - Images (JPEG, PNG, HEIC, GIF, etc.)
 * - Videos (MP4, MOV, etc.)
 * - Files (PDFs, documents)
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

// App Group identifier - must match the one in app.json
const APP_GROUP_IDENTIFIER = 'group.com.anonymous.Natively';

// Shared container path
const SHARED_CONTAINER_PATH = Platform.OS === 'ios' 
  ? `${FileSystem.documentDirectory}../../Shared/AppGroup/${APP_GROUP_IDENTIFIER}/`
  : FileSystem.documentDirectory;

// Shared data file path
const SHARED_DATA_FILE = `${SHARED_CONTAINER_PATH}shared-data.json`;

interface SharedData {
  text?: string;
  urls?: string[];
  images?: string[];
  videos?: string[];
  files?: string[];
  timestamp: number;
}

/**
 * Main entry point for the Share Extension
 * This function is called when the extension is activated
 */
export default async function ShareExtension() {
  console.log('[ShareExtension] Extension activated');
  
  try {
    // Get the shared items from the extension context
    const sharedItems = await getSharedItems();
    
    if (!sharedItems || Object.keys(sharedItems).length === 0) {
      console.log('[ShareExtension] No shared items found');
      return;
    }
    
    console.log('[ShareExtension] Processing shared items:', sharedItems);
    
    // Save shared data to App Group container
    await saveSharedData(sharedItems);
    
    // Open the main app with deep link
    await openMainApp();
    
    console.log('[ShareExtension] Successfully processed shared content');
  } catch (error) {
    console.error('[ShareExtension] Error processing shared content:', error);
  }
}

/**
 * Get shared items from the extension context
 * This is a placeholder - the actual implementation will be handled by @bacons/apple-targets
 */
async function getSharedItems(): Promise<SharedData> {
  // This will be implemented by the native Share Extension
  // For now, return empty data
  return {
    timestamp: Date.now()
  };
}

/**
 * Save shared data to App Group container
 */
async function saveSharedData(data: SharedData): Promise<void> {
  try {
    // Ensure shared container directory exists
    const dirInfo = await FileSystem.getInfoAsync(SHARED_CONTAINER_PATH);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(SHARED_CONTAINER_PATH, { intermediates: true });
    }
    
    // Write shared data to file
    await FileSystem.writeAsStringAsync(
      SHARED_DATA_FILE,
      JSON.stringify(data),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
    
    console.log('[ShareExtension] Shared data saved to:', SHARED_DATA_FILE);
  } catch (error) {
    console.error('[ShareExtension] Error saving shared data:', error);
    throw error;
  }
}

/**
 * Open the main app with a deep link
 */
async function openMainApp(): Promise<void> {
  try {
    const deepLink = 'natively://share-intent';
    console.log('[ShareExtension] Opening main app with deep link:', deepLink);
    
    // This will be handled by the native Share Extension
    // The extension will call extensionContext.completeRequest and open the URL
  } catch (error) {
    console.error('[ShareExtension] Error opening main app:', error);
    throw error;
  }
}
