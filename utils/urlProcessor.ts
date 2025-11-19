
/**
 * URL Processing Utilities
 * 
 * Functions to detect, extract, and manage URLs in note text
 */

import { supabase } from './supabase';

/**
 * Extract all URLs from text
 * @param text - The text to extract URLs from
 * @returns Array of unique URLs found in the text
 */
export function extractUrls(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  
  if (!matches) {
    return [];
  }

  // Remove duplicates and return
  return [...new Set(matches)];
}

/**
 * Check if text contains any URLs
 * @param text - The text to check
 * @returns True if text contains at least one URL
 */
export function hasUrls(text: string): boolean {
  return extractUrls(text).length > 0;
}

/**
 * Process URLs for a recall
 * This function:
 * 1. Extracts URLs from the note text
 * 2. Inserts new URLs into recall_urls table
 * 3. Removes URLs that are no longer in the text
 * 
 * @param userId - The user ID
 * @param recallId - The recall ID
 * @param noteText - The note text to extract URLs from
 * @returns Promise with success status
 */
export async function processRecallUrls(
  userId: string,
  recallId: string,
  noteText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('=== Processing URLs for recall ===');
    console.log('Recall ID:', recallId);
    console.log('User ID:', userId);

    // Extract URLs from text
    const urls = extractUrls(noteText);
    console.log('URLs found in text:', urls.length);

    if (urls.length === 0) {
      // No URLs in text, delete all existing URLs for this recall
      console.log('No URLs found, deleting existing URLs for this recall');
      
      const { error: deleteError } = await supabase
        .from('recall_urls')
        .delete()
        .eq('user_id', userId)
        .eq('recall_id', recallId);

      if (deleteError) {
        console.error('Error deleting URLs:', deleteError);
        return { success: false, error: deleteError.message };
      }

      console.log('Existing URLs deleted successfully');
      return { success: true };
    }

    // Get existing URLs for this recall
    const { data: existingUrls, error: fetchError } = await supabase
      .from('recall_urls')
      .select('id, url')
      .eq('user_id', userId)
      .eq('recall_id', recallId);

    if (fetchError) {
      console.error('Error fetching existing URLs:', fetchError);
      return { success: false, error: fetchError.message };
    }

    console.log('Existing URLs in database:', existingUrls?.length || 0);

    // Create sets for comparison
    const existingUrlSet = new Set((existingUrls || []).map(u => u.url));
    const newUrlSet = new Set(urls);

    // Find URLs to add (in text but not in database)
    const urlsToAdd = urls.filter(url => !existingUrlSet.has(url));
    
    // Find URLs to remove (in database but not in text)
    const urlsToRemove = (existingUrls || []).filter(u => !newUrlSet.has(u.url));

    console.log('URLs to add:', urlsToAdd.length);
    console.log('URLs to remove:', urlsToRemove.length);

    // Insert new URLs
    if (urlsToAdd.length > 0) {
      const urlRecords = urlsToAdd.map(url => ({
        user_id: userId,
        recall_id: recallId,
        url: url,
      }));

      const { error: insertError } = await supabase
        .from('recall_urls')
        .upsert(urlRecords, {
          onConflict: 'user_id,recall_id,url',
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error('Error inserting URLs:', insertError);
        return { success: false, error: insertError.message };
      }

      console.log('New URLs inserted successfully');
    }

    // Delete removed URLs
    if (urlsToRemove.length > 0) {
      const idsToRemove = urlsToRemove.map(u => u.id);

      const { error: deleteError } = await supabase
        .from('recall_urls')
        .delete()
        .in('id', idsToRemove);

      if (deleteError) {
        console.error('Error deleting URLs:', deleteError);
        return { success: false, error: deleteError.message };
      }

      console.log('Removed URLs deleted successfully');
    }

    console.log('=== URL processing completed successfully ===');
    return { success: true };
  } catch (error) {
    console.error('Exception in processRecallUrls:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get all URLs for a recall
 * @param recallId - The recall ID
 * @returns Promise with array of URL records
 */
export async function getRecallUrls(recallId: string): Promise<{
  id: string;
  url: string;
  url_data: string | null;
  created_at: string;
}[]> {
  try {
    const { data, error } = await supabase
      .from('recall_urls')
      .select('id, url, url_data, created_at')
      .eq('recall_id', recallId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching recall URLs:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception in getRecallUrls:', error);
    return [];
  }
}
