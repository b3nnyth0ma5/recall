
import { useState, useEffect, useCallback, useRef } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, deleteImageRecord, saveSearchHistory } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { noteCache, imageCache, peopleCache, CostCalculator } from '@/utils/memoryCache';
import { getCachedImage, setCachedImage, removeCachedImage, clearImageCache } from '@/utils/imageCache';

export type SearchStage = 'idle' | 'detecting' | 'resolving' | 'filtering' | 'searching' | 'complete';

export interface PersonInfo {
  detectedNames: string[];
  matchedNames: string[];
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
  const { user } = useAuth();

  const ITEMS_PER_PAGE = 7;

  // Function to get cached note data using MemoryCache
  const getCachedNote = useCallback((noteId: string): Note | null => {
    const cached = noteCache.get(noteId);
    if (cached) {
      console.log(`[useNotes] Cache HIT for note ${noteId}`);
      return cached;
    }
    console.log(`[useNotes] Cache MISS for note ${noteId}`);
    return null;
  }, []);

  // Function to update note cache using MemoryCache
  const updateNoteCache = useCallback((note: Note) => {
    const cost = CostCalculator.forNote(note);
    noteCache.set(note.id, note, cost);
    console.log(`[useNotes] Updated cache for note ${note.id} (cost: ${(cost / 1024).toFixed(2)} KB)`);
  }, []);

  // OPTIMIZED: Batch load people for recalls with better caching
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
        console.log(`[useNotes] All people data cached for ${recallIds.length} recalls`);
        return result;
      }

      // OPTIMIZED: Fetch only uncached data using optimized index
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

      console.log(`Loaded people for ${Object.keys(peopleByRecallId).length} recalls (${uncachedIds.length} from DB, ${recallIds.length - uncachedIds.length} from cache)`);
      return result;
    } catch (error) {
      console.error('Error loading people for recalls:', error);
      return {};
    }
  }, []);

  // OPTIMIZED: Image loading with global cache and better performance
  const loadImagesForRecalls = useCallback(async (recalls: any[]) => {
    const startTime = performance.now();
    
    // First, load people for all recalls in one batch
    const recallIds = recalls.map(r => r.id);
    const peopleByRecallId = await loadPeopleForRecalls(recallIds);

    // OPTIMIZED: Batch fetch all images using new covering index
    const { data: allImagesData, error: allImagesError } = await supabase
      .from('recall_images')
      .select('id, recall_id, cdn_url')
      .in('recall_id', recallIds)
      .order('created_at', { ascending: true });

    if (allImagesError) {
      console.error('Error fetching images:', allImagesError);
    }

    const fetchTime = performance.now() - startTime;
    console.log(`[useNotes] Fetched ${allImagesData?.length || 0} images in ${fetchTime.toFixed(2)}ms`);

    // Group images by recall_id
    const imagesByRecallId = new Map<string, any[]>();
    (allImagesData || []).forEach(img => {
      if (!imagesByRecallId.has(img.recall_id)) {
        imagesByRecallId.set(img.recall_id, []);
      }
      imagesByRecallId.get(img.recall_id)!.push(img);
    });

    // OPTIMIZED: Process recalls with global image cache
    const processedNotes = await Promise.all(
      recalls.map(async (recall) => {
        try {
          const recallImages = imagesByRecallId.get(recall.id) || [];
          
          // OPTIMIZED: Load first TWO images using global cache
          const imageResults = await Promise.all(
            recallImages.map(async (img, index) => {
              try {
                // Load first two images immediately
                if (index < 2) {
                  // Prefer CDN URL if available (much faster)
                  if (img.cdn_url) {
                    setCachedImage(img.id, img.cdn_url);
                    return { url: img.cdn_url, id: img.id };
                  }
                  
                  // Use global cache for base64 data
                  const dataUrl = await getCachedImage(img.id);
                  if (dataUrl) {
                    return { url: dataUrl, id: img.id };
                  }
                  return { url: '', id: img.id };
                } else {
                  // Placeholder for lazy loading (will be loaded by NoteCard)
                  // But pre-cache CDN URLs if available
                  if (img.cdn_url) {
                    setCachedImage(img.id, img.cdn_url);
                  }
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
          };

          // Update note cache
          updateNoteCache(processedNote);

          return processedNote;
        } catch (error) {
          console.error(`Exception processing recall ${recall.id}:`, error);
          return { 
            ...recall, 
            images: [], 
            imageIds: [],
            people: [],
          };
        }
      })
    );

    const totalTime = performance.now() - startTime;
    console.log(`[useNotes] Processed ${processedNotes.length} notes in ${totalTime.toFixed(2)}ms`);

    return processedNotes;
  }, [loadPeopleForRecalls, updateNoteCache]);

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
      
      console.log(`Loading notes page ${pageNum} from Supabase for user:`, user.id);
      
      const from = (pageNum - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // OPTIMIZED: Query using idx_recalls_user_created composite index
      const { data: recallsData, error: recallsError } = await supabase
        .from('recalls')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (recallsError) {
        console.error('Error loading recalls:', recallsError);
        return;
      }

      if (!recallsData || recallsData.length === 0) {
        setHasMore(false);
        if (!append) {
          setNotes([]);
        }
        return;
      }

      if (recallsData.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }

      // OPTIMIZED: Load images and people with global cache
      const notesWithImagesAndPeople = await loadImagesForRecalls(recallsData);

      if (append) {
        // Prevent duplicates
        setNotes(prevNotes => {
          const existingIds = new Set(prevNotes.map(note => note.id));
          const newUniqueNotes = notesWithImagesAndPeople.filter(note => !existingIds.has(note.id));
          console.log(`Adding ${newUniqueNotes.length} new unique notes (filtered ${notesWithImagesAndPeople.length - newUniqueNotes.length} duplicates)`);
          return [...prevNotes, ...newUniqueNotes];
        });
      } else {
        setNotes(notesWithImagesAndPeople);
      }
      
      console.log(`Loaded ${notesWithImagesAndPeople.length} notes for page ${pageNum}`);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [user, loadImagesForRecalls]);

  useEffect(() => {
    loadNotes(1, false);
    setPage(1);
    setHasMore(true);
  }, [user, loadNotes]);

  const loadMoreNotes = useCallback(() => {
    if (!isLoadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadNotes(nextPage, true);
    }
  }, [page, hasMore, isLoadingMore, loading, loadNotes]);

  const refreshNotes = useCallback(async () => {
    // Clear all caches on refresh
    console.log('[useNotes] Clearing all caches on refresh');
    peopleCache.clear();
    imageCache.clear();
    noteCache.clear();
    clearImageCache(); // Clear global image cache
    
    setPage(1);
    setHasMore(true);
    await loadNotes(1, false);
  }, [loadNotes]);

  const refreshSingleNote = useCallback(async (noteId: string) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    try {
      console.log('Refreshing single note:', noteId);
      
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .select('*')
        .eq('id', noteId)
        .eq('user_id', user.id)
        .single();

      if (recallError || !recallData) {
        console.error('Error loading recall:', recallError);
        return;
      }

      // Clear caches for this recall
      peopleCache.remove(noteId);
      noteCache.remove(noteId);

      // Load images and people for this recall
      const [updatedNote] = await loadImagesForRecalls([recallData]);

      // Update the note in the list
      setNotes(prevNotes => 
        prevNotes.map(note => note.id === noteId ? updatedNote : note)
      );
      
      console.log('Single note refreshed successfully');
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
      console.log('Adding recall to Supabase with location_primary_type:', note.location_primary_type);
      
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert([{
          text: note.text,
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

      console.log('Recall added successfully with location_primary_type:', recallData.location_primary_type);
      
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
      console.log('Updating recall in Supabase with location_primary_type:', updates.location_primary_type);
      
      const { error: recallError } = await supabase
        .from('recalls')
        .update({
          text: updates.text,
          latitude: updates.latitude,
          longitude: updates.longitude,
          location: updates.location,
          location_primary_type: updates.location_primary_type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .eq('user_id', user.id);

      if (recallError) {
        console.error('Error updating recall:', recallError);
        throw recallError;
      }

      console.log('Recall updated successfully with location_primary_type');
      
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
      console.log('[useNotes] ===== ASYNC DELETION STARTED =====');
      console.log('[useNotes] Deleting recall:', noteId);
      
      // Show deletion indicator immediately
      setIsDeletingNote(true);
      
      // Clear caches for this recall immediately
      peopleCache.remove(noteId);
      noteCache.remove(noteId);
      
      // Remove from UI immediately (optimistic update)
      setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
      console.log('[useNotes] Recall removed from UI (optimistic update)');
      
      // Hide deletion indicator after UI update
      setIsDeletingNote(false);
      
      // OPTIMIZED: Perform actual deletion ASYNCHRONOUSLY
      console.log('[useNotes] Starting async deletion process...');
      (async () => {
        try {
          console.log('[useNotes] [ASYNC] Getting images for recall:', noteId);
          
          // OPTIMIZED: Get all images using new index
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('id, cdn_url')
            .eq('recall_id', noteId);

          // Delete images from CDN and database
          if (imagesData && imagesData.length > 0) {
            console.log(`[useNotes] [ASYNC] Deleting ${imagesData.length} images for recall ${noteId}`);
            
            for (const img of imagesData) {
              // Remove from global cache
              removeCachedImage(img.id);
              
              // Delete from CDN if URL exists
              if (img.cdn_url) {
                console.log(`[useNotes] [ASYNC] Deleting image from CDN:`, img.cdn_url);
                const { deleteImageFromCloudflare } = await import('@/utils/cloudflareCDN');
                await deleteImageFromCloudflare(img.cdn_url);
              }

              // OPTIMIZED: Delete from database using new index
              console.log(`[useNotes] [ASYNC] Deleting image from database:`, img.id);
              await supabase
                .from('recall_images')
                .delete()
                .eq('id', img.id);
            }
            
            console.log(`[useNotes] [ASYNC] All ${imagesData.length} images deleted`);
          }

          // Delete the recall itself
          console.log('[useNotes] [ASYNC] Deleting recall from database:', noteId);
          const { error } = await supabase
            .from('recalls')
            .delete()
            .eq('id', noteId)
            .eq('user_id', user.id);

          if (error) {
            console.error('[useNotes] [ASYNC] Error deleting recall:', error);
          } else {
            console.log('[useNotes] [ASYNC] Recall deleted successfully from database');
          }
          
          // Small delay before refreshing
          console.log('[useNotes] [ASYNC] Waiting 300ms before refreshing landing page...');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Refresh the landing page
          console.log('[useNotes] [ASYNC] Refreshing landing page after deletion...');
          await refreshNotes();
          console.log('[useNotes] [ASYNC] Landing page refreshed');
          
          console.log('[useNotes] ===== ASYNC DELETION COMPLETE =====');
        } catch (asyncError) {
          console.error('[useNotes] [ASYNC] Exception during async deletion:', asyncError);
        }
      })();
      
      console.log('[useNotes] Deletion initiated asynchronously, returning control to caller');
    } catch (error) {
      console.error('[useNotes] Error initiating recall deletion:', error);
      setIsDeletingNote(false);
      throw error;
    }
  }, [user, refreshNotes]);

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
      await refreshNotes();
      return;
    }
    
    try {
      console.log('=== STARTING OPTIMIZED SEARCH ===');
      console.log('Search query:', query);
      setLoading(true);
      setSearchStage('detecting');
      setSearchLocationName(undefined);
      
      // Save search history
      await saveSearchHistory(user.id, query);
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session');
        return;
      }

      // Step 1: Check for location intent
      console.log('Step 1: Checking for location intent...');
      const locationCheckStart = Date.now();
      
      const { data: locationData, error: locationError } = await supabase.functions.invoke('search-recalls-with-location', {
        body: { query: query.trim() },
      });

      console.log(`Location check completed in ${Date.now() - locationCheckStart}ms`);

      // If location intent detected and resolved
      if (locationData?.hasLocationIntent && locationData?.locationResolved && locationData?.recallIds?.length > 0) {
        console.log('Location intent detected and resolved!');
        console.log('Location info:', locationData.locationInfo);
        console.log('Filtered recall IDs:', locationData.recallIds);
        
        setSearchStage('resolving');
        setSearchLocationName(locationData.locationInfo?.resolvedPlace);
        setLocationInfo(locationData.locationInfo);
        
        // Step 2: Use search-recalls-v2 with filtered recall IDs
        console.log('Step 2: Running AI search on location-filtered recalls...');
        setSearchStage('searching');
        
        const searchStart = Date.now();
        const { data: searchResults, error: searchError } = await supabase.functions.invoke('search-recalls-v2', {
          body: {
            query: locationData.cleanedQuery || query.trim(),
            recallIds: locationData.recallIds,
          },
        });

        console.log(`AI search completed in ${Date.now() - searchStart}ms`);

        if (searchError) {
          console.error('Error in AI search:', searchError);
          // Fallback: show location-filtered recalls
          const { data: recallsData } = await supabase
            .from('recalls')
            .select('*')
            .in('id', locationData.recallIds)
            .eq('user_id', user.id);

          const notesWithImages = await loadImagesForRecalls(recallsData || []);
          setNotes(notesWithImages);
          setSearchAnswer(null);
          setSearchConfidence(undefined);
          setPersonInfo(null);
          setSearchStage('complete');
          return;
        }

        // Process V2 results
        const matchedRecallIds = searchResults?.results?.map((r: any) => r.id) || [];
        const answer = searchResults?.answer || null;
        const confidence = searchResults?.confidence || 0;
        const personInfoData = searchResults?.personInfo || null;
        
        console.log(`Found ${matchedRecallIds.length} AI-ranked results`);
        
        if (matchedRecallIds.length > 0) {
          const { data: recallsData } = await supabase
            .from('recalls')
            .select('*')
            .in('id', matchedRecallIds)
            .eq('user_id', user.id);

          const orderedRecalls = searchResults.results
            .map((matchInfo: any) => {
              const recall = recallsData?.find(r => r.id === matchInfo.id);
              if (!recall) return null;
              
              return {
                ...recall,
                relevance_score: matchInfo.matchPercentage || 0,
                used_for_answer: matchInfo.usedForAnswer || false,
              };
            })
            .filter((recall: any) => recall !== null);

          const notesWithImages = await loadImagesForRecalls(orderedRecalls);
          
          setNotes(notesWithImages);
          setSearchAnswer(answer);
          setSearchConfidence(confidence);
          setPersonInfo(personInfoData);
        } else {
          setNotes([]);
          setSearchAnswer(answer);
          setSearchConfidence(confidence);
          setPersonInfo(personInfoData);
        }
        
        setSearchStage('complete');
        console.log('=== LOCATION-BASED SEARCH COMPLETE ===');
        return;
      }

      // No location intent - use regular V2 search
      console.log('No location intent detected - using regular AI search');
      setSearchStage('searching');
      setLocationInfo(null);
      
      const searchStart = Date.now();
      const { data: searchResults, error: searchError } = await supabase.functions.invoke('search-recalls-v2', {
        body: { query: query.trim() },
      });

      console.log(`AI search completed in ${Date.now() - searchStart}ms`);

      if (searchError) {
        console.error('Error in AI search:', searchError);
        // Fallback to basic search
        const { data: recallsData } = await supabase
          .from('recalls')
          .select('*')
          .eq('user_id', user.id)
          .or(`text.ilike.%${query}%,location.ilike.%${query}%`)
          .order('created_at', { ascending: false });

        const notesWithImages = await loadImagesForRecalls(recallsData || []);
        setNotes(notesWithImages);
        setSearchAnswer(null);
        setSearchConfidence(undefined);
        setPersonInfo(null);
        setSearchStage('complete');
        return;
      }

      // Process V2 results
      const matchedRecallIds = searchResults?.results?.map((r: any) => r.id) || [];
      const answer = searchResults?.answer || null;
      const confidence = searchResults?.confidence || 0;
      const personInfoData = searchResults?.personInfo || null;
      
      console.log(`Found ${matchedRecallIds.length} results`);
      
      if (matchedRecallIds.length > 0) {
        const { data: recallsData } = await supabase
          .from('recalls')
          .select('*')
          .in('id', matchedRecallIds)
          .eq('user_id', user.id);

        const orderedRecalls = searchResults.results
          .map((matchInfo: any) => {
            const recall = recallsData?.find(r => r.id === matchInfo.id);
            if (!recall) return null;
            
            return {
              ...recall,
              relevance_score: matchInfo.matchPercentage || 0,
              used_for_answer: matchInfo.usedForAnswer || false,
            };
          })
          .filter((recall: any) => recall !== null);

        const notesWithImages = await loadImagesForRecalls(orderedRecalls);
        
        setNotes(notesWithImages);
        setSearchAnswer(answer);
        setSearchConfidence(confidence);
        setPersonInfo(personInfoData);
      } else {
        setNotes([]);
        setSearchAnswer(answer);
        setSearchConfidence(confidence);
        setPersonInfo(personInfoData);
      }
      
      setSearchStage('complete');
      console.log('=== SEARCH COMPLETE ===');
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
    } finally {
      setLoading(false);
      // Reset stage after a delay
      setTimeout(() => {
        setSearchStage('idle');
      }, 1000);
    }
  }, [refreshNotes, user, loadImagesForRecalls]);

  const getSearchHistory = useCallback(async () => {
    if (!user) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('search_history')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error loading search history:', error);
        return [];
      }

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
    addNote,
    updateNote,
    deleteNote,
    searchNotes,
    refreshNotes,
    loadMoreNotes,
    refreshSingleNote,
    getSearchHistory,
    getCachedNote,
  };
}
