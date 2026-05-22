
/**
 * URL Processing Utilities
 * 
 * Functions to detect, extract, and manage URLs in note text
 */

import { supabase } from './supabase';

export interface RecallUrlMetadata {
  id: string;
  url: string;
  url_data: string | null;
  og_title: string | null;
  og_description: string | null;
  og_site_name: string | null;
  og_image_url: string | null;
  scraped_at: string | null;
  created_at: string;
}

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

// Module-level in-flight dedup set — prevents double-invoking scrape for the same row
const inFlightScrapes = new Set<string>();

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

      const { data: insertedRows, error: insertError } = await supabase
        .from('recall_urls')
        .upsert(urlRecords, {
          onConflict: 'user_id,recall_id,url',
          ignoreDuplicates: false,
        })
        .select('id, url');

      if (insertError) {
        console.error('Error inserting URLs:', insertError);
        return { success: false, error: insertError.message };
      }

      console.log('New URLs inserted successfully');

      // Fire-and-forget scrape for each newly inserted row (deduped via inFlightScrapes)
      if (insertedRows) {
        for (const row of insertedRows) {
          if (inFlightScrapes.has(row.id)) {
            if (__DEV__) console.log('[urlProcessor] Scrape already in-flight for:', row.id);
            continue;
          }
          console.log('[urlProcessor] Triggering fire-and-forget scrape for URL:', row.url, 'id:', row.id);
          inFlightScrapes.add(row.id);
          supabase.functions
            .invoke('scrape-url-metadata', { body: { recall_url_id: row.id } })
            .catch(err => console.warn('[urlProcessor] scrape invoke failed for', row.url, err))
            .finally(() => inFlightScrapes.delete(row.id));
        }
      }
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
 * Get all URLs for a recall (includes new og_image_url and scraped_at columns)
 * @param recallId - The recall ID
 * @returns Promise with array of URL records including OG metadata
 */
export async function getRecallUrls(recallId: string): Promise<RecallUrlMetadata[]> {
  try {
    const { data, error } = await supabase
      .from('recall_urls')
      .select('id, url, url_data, og_title, og_description, og_site_name, og_image_url, scraped_at, created_at')
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

/**
 * Batched fetch of URL metadata for multiple recalls in a single query.
 * Returns a map of recall_id → array of URL rows (ordered by created_at ascending).
 * @param recallIds - Array of recall IDs to fetch URLs for
 */
export async function getRecallUrlsForRecalls(
  recallIds: string[]
): Promise<Record<string, RecallUrlMetadata[]>> {
  if (recallIds.length === 0) {
    return {};
  }

  try {
    const BATCH_SIZE = 200;
    const result: Record<string, RecallUrlMetadata[]> = {};

    // Chunk into batches of 200 to avoid Supabase URL length limits
    for (let i = 0; i < recallIds.length; i += BATCH_SIZE) {
      const chunk = recallIds.slice(i, i + BATCH_SIZE);

      const { data, error } = await supabase
        .from('recall_urls')
        .select('id, url, url_data, og_title, og_description, og_site_name, og_image_url, scraped_at, created_at, recall_id')
        .in('recall_id', chunk)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[urlProcessor] Error in getRecallUrlsForRecalls batch:', error);
        continue;
      }

      for (const row of data || []) {
        const recallId = (row as any).recall_id as string;
        if (!result[recallId]) {
          result[recallId] = [];
        }
        result[recallId].push({
          id: row.id,
          url: row.url,
          url_data: row.url_data,
          og_title: row.og_title,
          og_description: row.og_description,
          og_site_name: row.og_site_name,
          og_image_url: row.og_image_url,
          scraped_at: row.scraped_at,
          created_at: row.created_at,
        });
      }
    }

    console.log('[urlProcessor] getRecallUrlsForRecalls: fetched metadata for', Object.keys(result).length, 'recalls');
    return result;
  } catch (error) {
    console.error('[urlProcessor] Exception in getRecallUrlsForRecalls:', error);
    return {};
  }
}

/**
 * Fire-and-forget trigger to scrape OG metadata for a recall_url row.
 * Deduped via inFlightScrapes set.
 * @param recallUrlId - The recall_urls row id
 */
export function triggerScrapeIfMissing(recallUrlId: string): void {
  if (inFlightScrapes.has(recallUrlId)) {
    if (__DEV__) console.log('[urlProcessor] triggerScrapeIfMissing: already in-flight for', recallUrlId);
    return;
  }
  console.log('[urlProcessor] triggerScrapeIfMissing for recall_url_id:', recallUrlId);
  inFlightScrapes.add(recallUrlId);
  supabase.functions
    .invoke('scrape-url-metadata', { body: { recall_url_id: recallUrlId } })
    .catch(err => console.warn('[urlProcessor] triggerScrapeIfMissing invoke failed for', recallUrlId, err))
    .finally(() => inFlightScrapes.delete(recallUrlId));
}

/**
 * Await scraping for a list of recall_url row IDs with a hard timeout.
 * Uses Promise.allSettled so one slow URL doesn't block the rest.
 * Deduped via inFlightScrapes set.
 * @param recallUrlIds - Array of recall_url row IDs to scrape
 * @param timeoutMs - Hard timeout in ms (default 8000)
 */
export async function awaitScrapeForRecallUrls(
  recallUrlIds: string[],
  timeoutMs: number = 8000
): Promise<void> {
  if (recallUrlIds.length === 0) return;

  console.log('[urlProcessor] awaitScrapeForRecallUrls: awaiting scrape for', recallUrlIds.length, 'URLs');

  const scrapePromises = recallUrlIds.map(id => {
    if (inFlightScrapes.has(id)) {
      if (__DEV__) console.log('[urlProcessor] awaitScrapeForRecallUrls: already in-flight for', id);
      // Still return a promise that resolves quickly — the in-flight one will finish
      return Promise.resolve();
    }
    inFlightScrapes.add(id);
    return supabase.functions
      .invoke('scrape-url-metadata', { body: { recall_url_id: id } })
      .catch(err => console.warn('[urlProcessor] awaitScrapeForRecallUrls invoke failed for', id, err))
      .finally(() => inFlightScrapes.delete(id));
  });

  const timeoutPromise = new Promise<void>(resolve => {
    setTimeout(() => {
      console.log('[urlProcessor] awaitScrapeForRecallUrls: timeout reached after', timeoutMs, 'ms');
      resolve();
    }, timeoutMs);
  });

  await Promise.race([
    Promise.allSettled(scrapePromises).then(() => undefined),
    timeoutPromise,
  ]);

  console.log('[urlProcessor] awaitScrapeForRecallUrls: complete');
}

/**
 * Process URLs for a recall AND await scraping for newly inserted rows.
 * Use this in the save flow when you want to wait for scraping before showing the card.
 * @param userId - The user ID
 * @param recallId - The recall ID
 * @param noteText - The note text to extract URLs from
 * @param timeoutMs - Hard timeout for scraping (default 8000)
 */
export async function processRecallUrlsAndAwaitScrape(
  userId: string,
  recallId: string,
  noteText: string,
  timeoutMs: number = 8000
): Promise<{ success: boolean; error?: string }> {
  const result = await processRecallUrls(userId, recallId, noteText);

  if (!result.success) {
    return result;
  }

  const urls = extractUrls(noteText);
  if (urls.length === 0) {
    return result;
  }

  // Find rows that still need scraping (scraped_at IS NULL)
  const rows = await getRecallUrls(recallId);
  const unscrapedIds = rows
    .filter(row => row.scraped_at === null)
    .map(row => row.id);

  if (unscrapedIds.length > 0) {
    console.log('[urlProcessor] processRecallUrlsAndAwaitScrape: awaiting scrape for', unscrapedIds.length, 'unscraped rows');
    await awaitScrapeForRecallUrls(unscrapedIds, timeoutMs);
  } else {
    console.log('[urlProcessor] processRecallUrlsAndAwaitScrape: all rows already scraped');
  }

  return result;
}
