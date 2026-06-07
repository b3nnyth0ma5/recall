
import { useState, useEffect, useCallback, useRef } from 'react';
import { Note } from '@/types/Note';
import { Document } from '@/types/Document';
import { supabase, getImageDataUrl, saveSearchHistory, updateSearchHistoryCollage } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { noteCache, imageCache, peopleCache, CostCalculator } from '@/utils/memoryCache';
import { getRecallUrlsForRecalls, triggerScrapeIfMissing, RecallUrlMetadata } from '@/utils/urlProcessor';
import { coalesce } from '@/utils/requestCoalescer';

export type { RecallUrlMetadata };

export type SearchStage = 'idle' | 'resolving' | 'people' | 'keywords' | 'searching' | 'complete';

// Module-level location cache (outside the hook) — 5-minute TTL
let cachedLocation: { latitude: number; longitude: number } | null = null;
let locationCacheTime = 0;
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PersonInfo {
  detectedNames: string[];
  matchedNames: string[];
}

export interface SearchTimings {
  entitySearchMs?: number;
  aiAnswerMs?: number;
  totalMs?: number;
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [locationInfo, setLocationInfo] = useState<any>(null);
  const [personInfo, setPersonInfo] = useState<PersonInfo | null>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState<string | null>(null);
  const [searchConfidence, setSearchConfidence] = useState<number | undefined>(undefined);
  const [searchStage, setSearchStage] = useState<SearchStage>('idle');
  const [searchLocationName, setSearchLocationName] = useState<string | undefined>(undefined);
  const [searchPersonNames, setSearchPersonNames] = useState<string[] | undefined>(undefined);
  const [searchExtractedKeywords, setSearchExtractedKeywords] = useState<string[] | undefined>(undefined);
  const [searchTimeMs, setSearchTimeMs] = useState<number | undefined>(undefined);
  const [searchTimings, setSearchTimings] = useState<SearchTimings>({});
  const [urlMetadataByRecallId, setUrlMetadataByRecallId] = useState<Record<string, RecallUrlMetadata[]>>({});
  const urlRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user } = useAuth();

  const ITEMS_PER_PAGE = 7;

  // Function to get cached note data using MemoryCache
  const getCachedNote = useCallback((noteId: string): Note | null => {
    const cached = noteCache.get(noteId);
    if (cached) {
      if (__DEV__) console.log(`[useNotes] Cache HIT for note ${noteId}`);
      return cached;
    }
    if (__DEV__) console.log(`[useNotes] Cache MISS for note ${noteId}`);
    return null;
  }, []);

  // Function to update note cache using MemoryCache
  const updateNoteCache = useCallback((note: Note) => {
    const cost = CostCalculator.forNote(note);
    noteCache.set(note.id, note, cost);
    if (__DEV__) console.log(`[useNotes] Updated cache for note ${note.id} (cost: ${(cost / 1024).toFixed(2)} KB)`);
  }, []);

  // Optimized helper function to load people for recalls in batch
  const loadPeopleForRecalls = useCallback(async (recallIds: string[]) => {
    if (!recallIds || recallIds.length === 0) {
      return {};
    }

    try {
      // Check cache first using MemoryCache
      const uncachedIds: string[] = [];
      const result: { [key: string]: any[] } = {};
      
      recallIds.forEach(id => {
        const cached = peopleCache.get(id);
        if (cached) {
          result[id] = cached;
        } else {
          uncachedIds.push(id);
        }
      });
      
      if (uncachedIds.length === 0) {
        // All data is cached
        if (__DEV__) console.log(`[useNotes] All people data cached for ${recallIds.length} recalls`);
        return result;
      }

      // Fetch only uncached data with optimized query using composite index
      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('recall_id, person_id, persons!inner(id, person_name, photo_url)')
        .in('recall_id', uncachedIds);

      if (recallPeopleError) {
        console.error('Error loading recall_people:', recallPeopleError);
        return result;
      }

      // Group people by recall_id
      const peopleByRecallId: { [key: string]: any[] } = {};
      
      (recallPeopleData || []).forEach((rp: any) => {
        if (!peopleByRecallId[rp.recall_id]) {
          peopleByRecallId[rp.recall_id] = [];
        }
        
        // Extract person data from the nested persons object
        if (rp.persons) {
          peopleByRecallId[rp.recall_id].push({
            id: rp.persons.id,
            person_name: rp.persons.person_name,
            photo_url: rp.persons.photo_url,
          });
        }
      });

      // Update cache with cost calculation
      uncachedIds.forEach(id => {
        const people = peopleByRecallId[id] || [];
        const cost = CostCalculator.forPeople(people);
        peopleCache.set(id, people, cost);
        result[id] = people;
      });

      if (__DEV__) console.log(`Loaded people for ${Object.keys(peopleByRecallId).length} recalls (${uncachedIds.length} from DB, ${recallIds.length - uncachedIds.length} from cache)`);
      return result;
    } catch (error) {
      console.error('Error loading people for recalls:', error);
      return {};
    }
  }, []);

  // Optimized image loading with better error handling and caching
  const loadImagesForRecalls = useCallback(async (recalls: any[]) => {
    // First, load people for all recalls in one batch
    const recallIds = recalls.map(r => r.id);
    const peopleByRecallId = await loadPeopleForRecalls(recallIds);

    // Batch fetch images and documents in parallel
    const [imagesResult, documentsResult] = await Promise.all([
      supabase
        .from('recall_images')
        .select('id, recall_id, cdn_url')
        .in('recall_id', recallIds)
        .order('created_at', { ascending: true }),
      supabase
        .from('recall_documents')
        .select('id, recall_id, cdn_url, thumbnail_url, file_name, file_size, content_type, page_count, extracted_text, doc_explanation, processed_at, created_at')
        .in('recall_id', recallIds)
        .order('created_at', { ascending: true }),
    ]);

    const allImagesData = imagesResult.data;
    const allImagesError = imagesResult.error;
    const allDocumentsData = documentsResult.data;

    if (allImagesError) {
      console.error('Error fetching images:', allImagesError);
    }
    if (documentsResult.error) {
      console.error('Error fetching documents:', documentsResult.error);
    }

    // Group images by recall_id
    const imagesByRecallId = new Map<string, any[]>();
    (allImagesData || []).forEach(img => {
      if (!imagesByRecallId.has(img.recall_id)) {
        imagesByRecallId.set(img.recall_id, []);
      }
      imagesByRecallId.get(img.recall_id)!.push(img);
    });

    // Group documents by recall_id
    const documentsByRecallId = new Map<string, Document[]>();
    (allDocumentsData || []).forEach((doc: any) => {
      if (!documentsByRecallId.has(doc.recall_id)) {
        documentsByRecallId.set(doc.recall_id, []);
      }
      documentsByRecallId.get(doc.recall_id)!.push({
        id: doc.id,
        cdn_url: doc.cdn_url,
        thumbnail_url: doc.thumbnail_url,
        file_name: doc.file_name,
        file_size: doc.file_size,
        content_type: doc.content_type,
        page_count: doc.page_count,
        extracted_text: doc.extracted_text,
        doc_explanation: doc.doc_explanation,
        processed_at: doc.processed_at,
        created_at: doc.created_at,
        upload_state: 'uploaded' as const,
      });
    });

    // Process recalls with their images
    const processedNotes = await Promise.all(
      recalls.map(async (recall) => {
        try {
          const recallImages = imagesByRecallId.get(recall.id) || [];
          
          // Load first TWO images immediately for better UX
          const imageResults = await Promise.all(
            recallImages.map(async (img, index) => {
              try {
                // Load first two images, others will be lazy loaded
                if (index < 2) {
                  // Check MemoryCache first
                  const cachedImage = imageCache.get(img.id);
                  if (cachedImage) {
                    return { url: cachedImage, id: img.id };
                  }
                  
                  // Prefer CDN URL if available (much faster)
                  if (img.cdn_url) {
                    const cost = CostCalculator.forImage(img.cdn_url);
                    imageCache.set(img.id, img.cdn_url, cost);
                    return { url: img.cdn_url, id: img.id };
                  }
                  
                  // Fallback to base64 data
                  const dataUrl = await getImageDataUrl(img.id);
                  if (dataUrl) {
                    const cost = CostCalculator.forImage(dataUrl);
                    imageCache.set(img.id, dataUrl, cost);
                    return { url: dataUrl, id: img.id };
                  }
                  return { url: '', id: img.id };
                } else {
                  // Return placeholder for lazy loading
                  return { url: '', id: img.id };
                }
              } catch (error) {
                console.error(`Exception processing image ${img.id}:`, error);
                return { url: '', id: img.id };
              }
            })
          );

          const validImageUrls = imageResults.map(result => result.url);
          const imageIds = imageResults.map(result => result.id);
          
          const processedNote = { 
            ...recall, 
            images: validImageUrls, 
            imageIds: imageIds,
            people: peopleByRecallId[recall.id] || [],
            documents: documentsByRecallId.get(recall.id) || [],
          };

          // Update note cache with processed note
          updateNoteCache(processedNote);

          return processedNote;
        } catch (error) {
          console.error(`Exception processing recall ${recall.id}:`, error);
          return { 
            ...recall, 
            images: [], 
            imageIds: [],
            people: [],
            documents: [],
          };
        }
      })
    );

    return processedNotes;
  }, [loadPeopleForRecalls, updateNoteCache]);

  /**
   * Fetches one page of the feed via the `get_recall_feed_page` RPC.
   * Returns notes in the existing Note shape plus a urlMetadataByRecallId map.
   * In-flight requests with the same key are coalesced via requestCoalescer.
   */
  const loadFeedPage = useCallback(async (pageNum: number) => {
    if (!user) return { notes: [], urlMetadataByRecallId: {} as Record<string, RecallUrlMetadata[]> };

    const limit = ITEMS_PER_PAGE;
    const offset = (pageNum - 1) * ITEMS_PER_PAGE;
    const key = `feed:${user.id}:${pageNum}`;

    if (__DEV__) console.log(`[useNotes] loadFeedPage: RPC get_recall_feed_page page=${pageNum} offset=${offset}`);

    const { data, error } = await coalesce(key, () =>
      Promise.resolve(supabase.rpc('get_recall_feed_page', { p_user_id: user.id, p_limit: limit, p_offset: offset }))
    );

    if (error) {
      console.error('[useNotes] loadFeedPage RPC error:', error);
      return { notes: [], urlMetadataByRecallId: {} as Record<string, RecallUrlMetadata[]> };
    }

    const urlMetadataByRecallId: Record<string, RecallUrlMetadata[]> = {};

    const notes = ((data ?? []) as any[]).map((row: any) => {
      const recall = row.recall ?? {};

      // Prime image cache for each image in this row
      const imageRows: any[] = row.images ?? [];
      imageRows.forEach((img: any) => {
        if (img.id && img.cdn_url) {
          const cost = CostCalculator.forImage(img.cdn_url);
          imageCache.set(img.id, img.cdn_url, cost);
        }
      });

      // Collect URL metadata keyed by recall id
      if (row.url_metadata && (row.url_metadata as any[]).length > 0) {
        urlMetadataByRecallId[recall.id] = row.url_metadata as RecallUrlMetadata[];
      }

      const note: Note = {
        ...recall,
        images: imageRows.map((i: any) => i.cdn_url).filter(Boolean),
        imageIds: imageRows.map((i: any) => i.id),
        documents: ((row.documents ?? []) as any[]).map((d: any) => ({
          ...d,
          upload_state: 'uploaded' as const,
        })),
        people: row.people ?? [],
      };

      // Keep in-memory note cache warm
      updateNoteCache(note);

      return note;
    });

    if (__DEV__) console.log(`[useNotes] loadFeedPage: mapped ${notes.length} notes from RPC`);
    return { notes, urlMetadataByRecallId };
  }, [user, updateNoteCache]);

  const loadNotes = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!user) {
      setNotes([]);
      setLoading(false);
      return;
    }

    try {
      if (!append) {
        setLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      if (__DEV__) console.log(`[useNotes] loadNotes: page=${pageNum} append=${append}`);

      const { notes: pageNotes, urlMetadataByRecallId: pageUrlMeta } = await loadFeedPage(pageNum);

      if (pageNotes.length === 0) {
        setHasMore(false);
        if (!append) {
          setNotes([]);
        }
        return;
      }

      if (pageNotes.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }

      if (append) {
        setNotes(prevNotes => {
          const existingIds = new Set(prevNotes.map(note => note.id));
          const newUniqueNotes = pageNotes.filter(note => !existingIds.has(note.id));
          if (__DEV__) console.log(`[useNotes] Adding ${newUniqueNotes.length} new unique notes (filtered ${pageNotes.length - newUniqueNotes.length} duplicates)`);
          return [...prevNotes, ...newUniqueNotes];
        });
      } else {
        setNotes(pageNotes);
      }

      // Merge URL metadata from RPC into state
      if (Object.keys(pageUrlMeta).length > 0) {
        setUrlMetadataByRecallId(prev => ({ ...prev, ...pageUrlMeta }));
      }

      // Trigger lazy scrape for any unscraped URL rows that came back from the RPC
      const unscrapedIds: string[] = [];
      for (const rows of Object.values(pageUrlMeta)) {
        for (const row of rows) {
          if (row.scraped_at === null) unscrapedIds.push(row.id);
        }
      }
      if (unscrapedIds.length > 0) {
        console.log('[useNotes] loadNotes: lazy scrape for', unscrapedIds.length, 'unscraped rows');
        unscrapedIds.forEach(id => triggerScrapeIfMissing(id));
        if (urlRefreshTimerRef.current) clearTimeout(urlRefreshTimerRef.current);
        const pageIds = pageNotes.map(n => n.id);
        urlRefreshTimerRef.current = setTimeout(() => {
          getRecallUrlsForRecalls(pageIds).then(updated => {
            setUrlMetadataByRecallId(prev => ({ ...prev, ...updated }));
          });
        }, 6000);
      }

      if (__DEV__) console.log(`[useNotes] loadNotes: loaded ${pageNotes.length} notes for page ${pageNum}`);
    } catch (error) {
      console.error('[useNotes] Error loading notes:', error);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [user, loadFeedPage]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    loadNotes(1, false);
    setPage(1);
    setHasMore(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  /* eslint-enable react-hooks/exhaustive-deps */

  // Realtime subscription: patch category_matching_at / category_matched_at into
  // in-memory notes so NoteCard spinners react live without a full reload.
  // Use a unique channel name per mount to avoid the "cannot add postgres_changes
  // callbacks after subscribe()" crash under StrictMode / Fast Refresh.
  const categoryMatchingChannelRef = useRef<string>(
    `recalls:category_matching:${Math.random().toString(36).slice(2)}`
  );
  useEffect(() => {
    if (!user) return;

    const channelName = `realtime:${user.id}:${categoryMatchingChannelRef.current}`;
    console.log('[useNotes] Setting up realtime subscription for recall category matching, channel:', channelName);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'recalls',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;
          console.log('[useNotes] Realtime UPDATE on recall:', updated.id, '— category_matching_at:', updated.category_matching_at, 'category_matched_at:', updated.category_matched_at);
          setNotes(prev =>
            prev.map(note =>
              note.id === updated.id
                ? {
                    ...note,
                    ...(updated.category_matching_at !== undefined && { category_matching_at: updated.category_matching_at }),
                    ...(updated.category_matched_at !== undefined && { category_matched_at: updated.category_matched_at }),
                    ...(updated.updated_at !== undefined && { updated_at: updated.updated_at }),
                  }
                : note,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      console.log('[useNotes] Cleaning up realtime recall category matching subscription');
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const loadMoreNotes = useCallback(() => {
    if (!isLoadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadNotes(nextPage, true);
    }
  }, [page, hasMore, isLoadingMore, loading, loadNotes]);

  const refreshNotes = useCallback(async () => {
    if (__DEV__) {
      console.log('[useNotes] Targeted cache invalidation on refresh');
    }

    // Only invalidate the first page of notes (most likely to have changed)
    // rather than wiping the entire cache
    const firstPageIds = notes.slice(0, ITEMS_PER_PAGE).map(n => n.id);
    firstPageIds.forEach(id => {
      noteCache.remove(id);
      peopleCache.remove(id);
      // Do NOT clear imageCache — CDN images don't change
    });

    setPage(1);
    setHasMore(true);
    await loadNotes(1, false);
  }, [loadNotes, notes]);

  const refreshSingleNote = useCallback(async (noteId: string) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    try {
      if (__DEV__) console.log('Refreshing single note:', noteId);
      
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .select('id, user_id, text, latitude, longitude, location, location_primary_type, created_at, updated_at')
        .eq('id', noteId)
        .eq('user_id', user.id)
        .single();

      if (recallError || !recallData) {
        console.error('Error loading recall:', recallError);
        return;
      }

      // Clear cache for this recall
      peopleCache.remove(noteId);
      noteCache.remove(noteId);

      // Load images and people for this recall
      const [updatedNote] = await loadImagesForRecalls([recallData]);

      // Update the note in the list
      setNotes(prevNotes => 
        prevNotes.map(note => note.id === noteId ? updatedNote : note)
      );

      // Refresh URL metadata for this note
      getRecallUrlsForRecalls([noteId]).then(fetched => {
        setUrlMetadataByRecallId(prev => ({ ...prev, ...fetched }));
      });
      
      if (__DEV__) console.log('Single note refreshed successfully');
    } catch (error) {
      console.error('Error refreshing single note:', error);
    }
  }, [user, loadImagesForRecalls]);

  const addNote = useCallback(async (note: Omit<Note, 'id' | 'created_at' | 'updated_at'>) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    try {
      if (__DEV__) console.log('Adding recall to Supabase with location_primary_type:', note.location_primary_type);
      
      const plainText = note.text || '';

      console.log('[useNotes] addNote: writing text, plain text length:', plainText.length);

      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert([{
          text: plainText,
          latitude: note.latitude,
          longitude: note.longitude,
          location: note.location,
          location_primary_type: note.location_primary_type,
          user_id: user.id,
        }])
        .select()
        .single();

      if (recallError) {
        console.error('Error adding recall:', recallError);
        throw recallError;
      }

      if (__DEV__) console.log('Recall added successfully with location_primary_type:', recallData.location_primary_type);
      
      await refreshNotes();
      return recallData.id;
    } catch (error) {
      console.error('Error adding recall:', error);
      throw error;
    }
  }, [refreshNotes, user]);

  const updateNote = useCallback(async (noteId: string, updates: Partial<Note>) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    try {
      if (__DEV__) console.log('Updating recall in Supabase with location_primary_type:', updates.location_primary_type);
      
      const updatedPlainText = updates.text;

      console.log('[useNotes] updateNote: writing text, plain text length:', updatedPlainText?.length ?? 0);

      const updatePayload: Record<string, any> = {
        text: updatedPlainText,
        latitude: updates.latitude,
        longitude: updates.longitude,
        location: updates.location,
        location_primary_type: updates.location_primary_type,
        updated_at: new Date().toISOString(),
      };

      const { error: recallError } = await supabase
        .from('recalls')
        .update(updatePayload)
        .eq('id', noteId)
        .eq('user_id', user.id);

      if (recallError) {
        console.error('Error updating recall:', recallError);
        throw recallError;
      }

      if (__DEV__) console.log('Recall updated successfully with location_primary_type');
      
      // Clear cache for this note
      noteCache.remove(noteId);
      
      // Refresh only the single note that was updated
      await refreshSingleNote(noteId);
    } catch (error) {
      console.error('Error updating recall:', error);
      throw error;
    }
  }, [refreshSingleNote, user]);

  const deleteNote = useCallback(async (noteId: string) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    try {
      if (__DEV__) console.log('[useNotes] ===== OPTIMIZED DELETION STARTED =====');
      if (__DEV__) console.log('[useNotes] Deleting recall:', noteId);
      
      // Clear caches for this recall immediately
      peopleCache.remove(noteId);
      noteCache.remove(noteId);
      if (__DEV__) console.log('[useNotes] Caches invalidated for recall:', noteId);
      
      // Remove from UI immediately (optimistic update)
      setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
      if (__DEV__) console.log('[useNotes] Recall removed from UI (optimistic update)');
      
      // Perform actual deletion ASYNCHRONOUSLY (fire and forget)
      if (__DEV__) console.log('[useNotes] Starting async deletion process...');
      (async () => {
        try {
          if (__DEV__) console.log('[useNotes] [ASYNC] Getting images for recall:', noteId);
          
          // Get all images for this recall
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('id, cdn_url')
            .eq('recall_id', noteId);

          // Delete images from CDN and clear image cache
          if (imagesData && imagesData.length > 0) {
            if (__DEV__) console.log(`[useNotes] [ASYNC] Deleting ${imagesData.length} images for recall ${noteId}`);
            
            for (const img of imagesData) {
              // Clear image cache
              imageCache.remove(img.id);
              
              // Delete from CDN if URL exists
              if (img.cdn_url) {
                if (__DEV__) console.log(`[useNotes] [ASYNC] Deleting image from CDN:`, img.cdn_url);
                const { deleteImageFromCloudflare } = await import('@/utils/cloudflareCDN');
                await deleteImageFromCloudflare(img.cdn_url);
              }
            }
            
            if (__DEV__) console.log(`[useNotes] [ASYNC] All ${imagesData.length} images deleted and caches cleared`);
          }

          // Delete the recall itself (cascading will handle recall_images, recall_people, etc.)
          if (__DEV__) console.log('[useNotes] [ASYNC] Deleting recall from database:', noteId);
          const { error } = await supabase
            .from('recalls')
            .delete()
            .eq('id', noteId)
            .eq('user_id', user.id);

          if (error) {
            console.error('[useNotes] [ASYNC] Error deleting recall:', error);
          } else {
            if (__DEV__) console.log('[useNotes] [ASYNC] Recall deleted successfully from database');
            if (__DEV__) console.log('[useNotes] [ASYNC] Cascading deletions (recall_images, recall_people, etc.) handled by database');
          }
          
          if (__DEV__) console.log('[useNotes] ===== OPTIMIZED DELETION COMPLETE =====');
        } catch (asyncError) {
          console.error('[useNotes] [ASYNC] Exception during async deletion:', asyncError);
        }
      })();
      
      if (__DEV__) console.log('[useNotes] Deletion initiated asynchronously, returning control to caller');
    } catch (error) {
      console.error('[useNotes] Error initiating recall deletion:', error);
      throw error;
    }
  }, [user]);

  const searchNotes = useCallback(async (query: string, useV2: boolean = false) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    setSearchQuery(query);
    
    // Clear search results when query is empty
    if (!query.trim()) {
      console.log('Empty search query - clearing results');
      setSearchAnswer(null);
      setSearchConfidence(undefined);
      setLocationInfo(null);
      setPersonInfo(null);
      setSearchStage('idle');
      setSearchLocationName(undefined);
      setSearchPersonNames(undefined);
      setSearchExtractedKeywords(undefined);
      setSearchTimeMs(undefined);
      setSearchTimings({});
      await refreshNotes();
      return;
    }
    
    try {
      const searchStartTime = Date.now();
      if (__DEV__) console.log('=== STARTING UNIFIED ENTITY SEARCH ===');
      if (__DEV__) console.log('Search query:', query);
      setLoading(true);
      
      // Clear previous search results when starting a new search
      if (__DEV__) console.log('[useNotes] Clearing previous search results');
      setNotes([]); // Clear existing recalls immediately
      setSearchAnswer(null);
      setSearchConfidence(undefined);
      setLocationInfo(null);
      setPersonInfo(null);
      setSearchStage('resolving');
      setSearchLocationName(undefined);
      setSearchPersonNames(undefined);
      setSearchExtractedKeywords(undefined);
      setSearchTimeMs(undefined);
      setSearchTimings({});
      
      // Save search history
      saveSearchHistory(user.id, query);
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session');
        return;
      }

      // Add a small delay to ensure "resolving" stage is visible
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 1: Call the unified entity extraction function
      if (__DEV__) console.log('Step 1: Calling unified entity extraction...');
      const entitySearchStart = Date.now();
      
      const { data: entityResult, error: entityError } = await supabase.functions.invoke('search-recalls-v3', {
        body: { 
          query: query.trim(),
        },
      });

      const entitySearchTime = Date.now() - entitySearchStart;
      if (__DEV__) console.log(`[TIMING] Entity search completed in ${entitySearchTime}ms`);

      if (entityError || !entityResult) {
        console.error('Error in entity extraction:', entityError);
        
        // Fallback to basic search
        const { data: recallsData } = await supabase
          .from('recalls')
          .select('id, user_id, text, latitude, longitude, location, location_primary_type, created_at, updated_at')
          .eq('user_id', user.id)
          .or(`text.ilike.%${query}%,location.ilike.%${query}%`)
          .order('created_at', { ascending: false });

        const notesWithImages = await loadImagesForRecalls(recallsData || []);
        setNotes(notesWithImages);
        setSearchAnswer(null);
        setSearchConfidence(undefined);
        setSearchStage('complete');
        
        const totalSearchTime = Date.now() - searchStartTime;
        setSearchTimeMs(totalSearchTime);
        setSearchTimings({
          totalMs: totalSearchTime,
        });
        
        return;
      }

      if (__DEV__) console.log('[Entity Search] Results:', entityResult);
      if (__DEV__) console.log('[Entity Search] Matching recalls:', entityResult.results?.length || 0);
      if (__DEV__) console.log('[Entity Search] Extracted keywords:', entityResult.extractedKeywords);

      // Set people info from v3 response
      if (entityResult.personInfo?.matchedNames?.length > 0) {
        setSearchStage('people');
        const personInfoData: PersonInfo = {
          detectedNames: entityResult.personInfo.detectedNames || [],
          matchedNames: entityResult.personInfo.matchedNames,
        };
        setPersonInfo(personInfoData);
        setSearchPersonNames(entityResult.personInfo.matchedNames);
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        setPersonInfo(null);
        setSearchPersonNames(undefined);
      }

      // Set keywords from v3 response
      if (entityResult.extractedKeywords?.length > 0) {
        setSearchStage('keywords');
        setSearchExtractedKeywords(entityResult.extractedKeywords);
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        setSearchExtractedKeywords(undefined);
      }

      // Set location info from v3 response
      if (entityResult.locationInfo) {
        setSearchStage('resolving');
        setSearchLocationName(entityResult.locationInfo.resolvedPlace);
        setLocationInfo(entityResult.locationInfo);
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        setLocationInfo(null);
        setSearchLocationName(undefined);
      }

      // Step 2: Use entity search results directly (v3 already generates the answer)
      setSearchStage('searching');

      const aiAnswerTime = entityResult.timings?.answerMs ?? 0;

      const matchedRecallIds = entityResult.results?.map((r: any) => r.id) || [];
      const answer = entityResult.answer || null;
      const confidence = entityResult.confidence || 0;

      if (__DEV__) console.log(`Found ${matchedRecallIds.length} AI-ranked results`);
      if (__DEV__) console.log('Answer:', answer);
      if (__DEV__) console.log('Confidence:', confidence);

      if (matchedRecallIds.length > 0) {
        // Check noteCache first, only fetch uncached IDs from Supabase
        const cachedRecalls: any[] = [];
        const uncachedIds: string[] = [];

        matchedRecallIds.forEach((id: string) => {
          const cached = noteCache.get(id);
          if (cached) {
            cachedRecalls.push(cached);
          } else {
            uncachedIds.push(id);
          }
        });

        let fetchedRecalls: any[] = [];
        if (uncachedIds.length > 0) {
          const { data: recallsData } = await supabase
            .from('recalls')
            .select('id, user_id, text, latitude, longitude, location, location_primary_type, created_at, updated_at')
            .in('id', uncachedIds)
            .eq('user_id', user.id);
          fetchedRecalls = await loadImagesForRecalls(recallsData || []);
        }

        // Merge and order by matchedRecallIds order
        const allRecalls = [...cachedRecalls, ...fetchedRecalls];
        const orderedRecalls = (entityResult.results as any[])
          .map((matchInfo: any) => {
            const recall = allRecalls.find((r: any) => r.id === matchInfo.id);
            if (!recall) return null;
            return {
              ...recall,
              relevance_score: matchInfo.matchPercentage || 0,
              used_for_answer: matchInfo.usedForAnswer || false,
            };
          })
          .filter((recall: any) => recall !== null);

        const notesWithImages = orderedRecalls;
        setNotes(notesWithImages);
        setSearchAnswer(answer);
        setSearchConfidence(confidence);

        // Fire-and-forget: fetch URL metadata for search result recalls
        const searchResultIds = notesWithImages.map((n: any) => n.id).filter(Boolean);
        if (searchResultIds.length > 0) {
          getRecallUrlsForRecalls(searchResultIds).then(fetched => {
            setUrlMetadataByRecallId(prev => ({ ...prev, ...fetched }));
            const unscrapedIds: string[] = [];
            for (const rows of Object.values(fetched)) {
              for (const row of rows) {
                if (row.scraped_at === null) unscrapedIds.push(row.id);
              }
            }
            if (unscrapedIds.length > 0) {
              unscrapedIds.forEach(id => triggerScrapeIfMissing(id));
              if (urlRefreshTimerRef.current) clearTimeout(urlRefreshTimerRef.current);
              urlRefreshTimerRef.current = setTimeout(() => {
                getRecallUrlsForRecalls(searchResultIds).then(updated => {
                  setUrlMetadataByRecallId(prev => ({ ...prev, ...updated }));
                });
              }, 6000);
            }
          });
        }

        // Fire-and-forget: generate a collage for the recent-searches thumbnail.
        (async () => {
          try {
            if (__DEV__) console.log('[searchNotes] Starting collage generation for query:', query.trim());

            // Only use recalls that were actually used to construct the answer (not just
            // top-scoring matches). If no recalls were used in the answer, the IIFE
            // early-returns and the row keeps its clock icon.
            const answerRecalls = orderedRecalls.filter((n: any) => n?.used_for_answer === true);
            const topRecalls = answerRecalls.slice(0, 4);

            if (topRecalls.length === 0) {
              if (__DEV__) console.log('[searchNotes] No used_for_answer recalls; skipping collage generation');
              return;
            }

            const recallsMissingImages = topRecalls.filter(
              (n: any) => !n?.images || n.images.length === 0 || !n.images[0]?.cdn_url,
            );
            const recallIdsMissingImages = recallsMissingImages.map((n: any) => n.id).filter(Boolean);

            const imagesByRecallId = new Map<string, string>();

            if (recallIdsMissingImages.length > 0) {
              if (__DEV__) console.log(
                `[searchNotes] ${recallIdsMissingImages.length} of top-${topRecalls.length} recalls missing images; fetching fallbacks from recall_images and recall_urls`,
              );

              // Run both fallback queries in parallel.
              const [imagesRes, urlsRes] = await Promise.all([
                supabase
                  .from('recall_images')
                  .select('recall_id, cdn_url, created_at')
                  .in('recall_id', recallIdsMissingImages)
                  .order('created_at', { ascending: true }),
                supabase
                  .from('recall_urls')
                  .select('recall_id, og_image_url, created_at')
                  .in('recall_id', recallIdsMissingImages)
                  .not('og_image_url', 'is', null)
                  .order('created_at', { ascending: true }),
              ]);

              // Build a map of recall_id -> first uploaded photo URL.
              const photoMap = new Map<string, string>();
              if (imagesRes.error) {
                console.error('[searchNotes] Error fetching recall_images for collage fallback:', imagesRes.error);
              } else if (imagesRes.data) {
                for (const img of imagesRes.data) {
                  if (!photoMap.has(img.recall_id) && img.cdn_url) {
                    photoMap.set(img.recall_id, img.cdn_url as string);
                  }
                }
              }

              // Build a map of recall_id -> first OG image URL.
              const ogMap = new Map<string, string>();
              if (urlsRes.error) {
                console.error('[searchNotes] Error fetching recall_urls for collage fallback:', urlsRes.error);
              } else if (urlsRes.data) {
                for (const row of urlsRes.data) {
                  if (!ogMap.has(row.recall_id) && row.og_image_url) {
                    ogMap.set(row.recall_id, row.og_image_url as string);
                  }
                }
              }

              // Merge — uploaded photo wins; OG image as fallback.
              for (const id of recallIdsMissingImages) {
                const url = photoMap.get(id) ?? ogMap.get(id);
                if (url) imagesByRecallId.set(id, url);
              }
            }

            const topImageUrls = topRecalls
              .map((n: any) => {
                if (n?.images && n.images.length > 0 && n.images[0]?.cdn_url) {
                  return n.images[0].cdn_url as string;
                }
                return imagesByRecallId.get(n.id) ?? null;
              })
              .filter((url): url is string => typeof url === 'string' && url.length > 0);

            if (__DEV__) console.log(
              `[searchNotes] Collage source URLs prepared: ${topImageUrls.length} of top-${topRecalls.length} recalls`,
            );

            if (topImageUrls.length === 0) {
              if (__DEV__) console.log('[searchNotes] No image-bearing recalls in answer set (after fill-in); skipping collage generation');
              return;
            }

            // Look up the previous collage URL so the edge function can clean it up.
            const { data: prevRow } = await supabase
              .from('search_history')
              .select('collage_cdn_url')
              .eq('user_id', user.id)
              .eq('search_text', query.trim())
              .maybeSingle();
            const previousCollageCdnUrl = prevRow?.collage_cdn_url ?? null;

            if (__DEV__) console.log(`[searchNotes] Generating collage from ${topImageUrls.length} top images`);

            const { data: collageResult, error: collageError } = await supabase.functions.invoke(
              'generate-search-collage',
              {
                body: {
                  userId: user.id,
                  searchText: query.trim(),
                  imageUrls: topImageUrls,
                  previousCollageCdnUrl,
                },
              },
            );

            if (collageError) {
              console.error('[searchNotes] Collage edge function error:', collageError);
              return;
            }
            if (!collageResult?.success || !collageResult?.collageCdnUrl) {
              if (__DEV__) console.log('[searchNotes] Collage edge function returned no-op:', collageResult?.reason);
              return;
            }

            await updateSearchHistoryCollage(user.id, query.trim(), collageResult.collageCdnUrl);
            if (__DEV__) console.log('[searchNotes] Collage saved:', collageResult.collageCdnUrl);
          } catch (collageErr) {
            console.error('[searchNotes] Collage generation failed (non-fatal):', collageErr);
          }
        })();
      } else {
        setNotes([]);
        setSearchAnswer(answer);
        setSearchConfidence(confidence);
      }

      setSearchStage('complete');

      const totalSearchTime = Date.now() - searchStartTime;
      setSearchTimeMs(totalSearchTime);
      setSearchTimings({
        entitySearchMs: entitySearchTime,
        aiAnswerMs: aiAnswerTime,
        totalMs: totalSearchTime,
      });

      if (__DEV__) console.log('=== UNIFIED ENTITY SEARCH COMPLETE ===');
      if (__DEV__) console.log(`Total search time: ${totalSearchTime}ms`);
    } catch (error) {
      console.error('=== SEARCH EXCEPTION ===');
      console.error('Error searching recalls:', error);
      
      // Fallback to refresh
      await refreshNotes();
      setSearchAnswer(null);
      setSearchConfidence(undefined);
      setLocationInfo(null);
      setPersonInfo(null);
      setSearchStage('idle');
      setSearchLocationName(undefined);
      setSearchPersonNames(undefined);
      setSearchExtractedKeywords(undefined);
      setSearchTimeMs(undefined);
      setSearchTimings({});
    } finally {
      setLoading(false);
      // Reset stage after a delay
      setTimeout(() => {
        setSearchStage('idle');
      }, 1000);
    }
  }, [refreshNotes, user, loadImagesForRecalls]);

  /**
   * Fetch URL metadata for the given recall IDs (or all current notes if omitted)
   * and merge into state. Triggers lazy scrape for any unscraped rows.
   */
  const refreshUrlMetadata = useCallback(async (recallIds?: string[]) => {
    const ids = recallIds ?? notes.map(n => n.id);
    if (ids.length === 0) return;

    if (__DEV__) console.log('[useNotes] refreshUrlMetadata for', ids.length, 'recalls');

    const fetched = await getRecallUrlsForRecalls(ids);

    setUrlMetadataByRecallId(prev => ({ ...prev, ...fetched }));

    // Trigger lazy scrape for any rows with scraped_at IS NULL
    const unscrapedIds: string[] = [];
    for (const rows of Object.values(fetched)) {
      for (const row of rows) {
        if (row.scraped_at === null) {
          unscrapedIds.push(row.id);
        }
      }
    }

    if (unscrapedIds.length > 0) {
      console.log('[useNotes] Triggering lazy scrape for', unscrapedIds.length, 'unscraped URL rows');
      unscrapedIds.forEach(id => triggerScrapeIfMissing(id));

      // Schedule a single follow-up refresh to pick up newly scraped rows
      if (urlRefreshTimerRef.current) {
        clearTimeout(urlRefreshTimerRef.current);
      }
      urlRefreshTimerRef.current = setTimeout(() => {
        console.log('[useNotes] Follow-up URL metadata refresh after scrape delay');
        getRecallUrlsForRecalls(ids).then(updated => {
          setUrlMetadataByRecallId(prev => ({ ...prev, ...updated }));
        });
      }, 6000);
    }
  }, [notes]);

  /**
   * Returns the first URL metadata row for a given recall, or null if none.
   */
  const getUrlMetadataForRecall = useCallback((recallId: string): RecallUrlMetadata | null => {
    const rows = urlMetadataByRecallId[recallId];
    if (!rows || rows.length === 0) return null;
    return rows[0];
  }, [urlMetadataByRecallId]);

  const getSearchHistory = useCallback(async () => {
    if (!user) {
      return [];
    }

    try {
      if (__DEV__) console.log('[useNotes] Fetching search history for user:', user.id);
      
      const { data, error } = await supabase
        .from('search_history')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading search history:', error);
        return [];
      }

      if (__DEV__) console.log(`[useNotes] Loaded ${data?.length || 0} search history items`);
      return data || [];
    } catch (error) {
      console.error('Error loading search history:', error);
      return [];
    }
  }, [user]);

  return {
    notes,
    loading,
    searchQuery,
    isLoadingMore,
    hasMore,
    locationInfo,
    personInfo,
    isDeletingNote,
    searchAnswer,
    searchConfidence,
    searchStage,
    searchLocationName,
    searchPersonNames,
    searchExtractedKeywords,
    searchTimeMs,
    searchTimings,
    urlMetadataByRecallId,
    addNote,
    updateNote,
    deleteNote,
    searchNotes,
    refreshNotes,
    loadMoreNotes,
    refreshSingleNote,
    refreshUrlMetadata,
    getUrlMetadataForRecall,
    getSearchHistory,
    getCachedNote,
  };
}
