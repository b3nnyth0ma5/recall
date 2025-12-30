
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, saveSearchHistory } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { noteCache, imageCache, peopleCache, CostCalculator } from '@/utils/memoryCache';
import * as Location from 'expo-location';

export type SearchStage = 'idle' | 'resolving' | 'people' | 'keywords' | 'searching' | 'complete';

export interface PersonInfo {
  detectedNames: string[];
  matchedNames: string[];
}

export interface SearchTimings {
  locationSearchMs?: number;
  peopleSearchMs?: number;
  keywordSearchMs?: number;
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
        console.log(`[useNotes] All people data cached for ${recallIds.length} recalls`);
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

      console.log(`Loaded people for ${Object.keys(peopleByRecallId).length} recalls (${uncachedIds.length} from DB, ${recallIds.length - uncachedIds.length} from cache)`);
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

    // Batch fetch all images for all recalls in one query
    const { data: allImagesData, error: allImagesError } = await supabase
      .from('recall_images')
      .select('id, recall_id, cdn_url')
      .in('recall_id', recallIds)
      .order('created_at', { ascending: true });

    if (allImagesError) {
      console.error('Error fetching images:', allImagesError);
    }

    // Group images by recall_id
    const imagesByRecallId = new Map<string, any[]>();
    (allImagesData || []).forEach(img => {
      if (!imagesByRecallId.has(img.recall_id)) {
        imagesByRecallId.set(img.recall_id, []);
      }
      imagesByRecallId.get(img.recall_id)!.push(img);
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
          };
        }
      })
    );

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

      // Optimized query using idx_recalls_user_created composite index
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

      // Optimized image and people loading
      const notesWithImagesAndPeople = await loadImagesForRecalls(recallsData);

      if (append) {
        // Prevent duplicates by filtering out notes that already exist
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
    // Clear MemoryCache instances on refresh
    console.log('[useNotes] Clearing all caches on refresh');
    peopleCache.clear();
    imageCache.clear();
    noteCache.clear();
    
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

      // Clear cache for this recall
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
      console.log('[useNotes] ===== OPTIMIZED DELETION STARTED =====');
      console.log('[useNotes] Deleting recall:', noteId);
      
      // Clear caches for this recall immediately
      peopleCache.remove(noteId);
      noteCache.remove(noteId);
      console.log('[useNotes] Caches invalidated for recall:', noteId);
      
      // Remove from UI immediately (optimistic update)
      setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
      console.log('[useNotes] Recall removed from UI (optimistic update)');
      
      // Perform actual deletion ASYNCHRONOUSLY (fire and forget)
      console.log('[useNotes] Starting async deletion process...');
      (async () => {
        try {
          console.log('[useNotes] [ASYNC] Getting images for recall:', noteId);
          
          // Get all images for this recall
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('id, cdn_url')
            .eq('recall_id', noteId);

          // Delete images from CDN and clear image cache
          if (imagesData && imagesData.length > 0) {
            console.log(`[useNotes] [ASYNC] Deleting ${imagesData.length} images for recall ${noteId}`);
            
            for (const img of imagesData) {
              // Clear image cache
              imageCache.remove(img.id);
              
              // Delete from CDN if URL exists
              if (img.cdn_url) {
                console.log(`[useNotes] [ASYNC] Deleting image from CDN:`, img.cdn_url);
                const { deleteImageFromCloudflare } = await import('@/utils/cloudflareCDN');
                await deleteImageFromCloudflare(img.cdn_url);
              }
            }
            
            console.log(`[useNotes] [ASYNC] All ${imagesData.length} images deleted and caches cleared`);
          }

          // Delete the recall itself (cascading will handle recall_images, recall_people, etc.)
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
            console.log('[useNotes] [ASYNC] Cascading deletions (recall_images, recall_people, etc.) handled by database');
          }
          
          console.log('[useNotes] ===== OPTIMIZED DELETION COMPLETE =====');
        } catch (asyncError) {
          console.error('[useNotes] [ASYNC] Exception during async deletion:', asyncError);
        }
      })();
      
      console.log('[useNotes] Deletion initiated asynchronously, returning control to caller');
    } catch (error) {
      console.error('[useNotes] Error initiating recall deletion:', error);
      throw error;
    }
  }, [user]);

  // Helper function to get user's current location
  const getUserLocation = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      console.log('[useNotes] Getting user location for search...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[useNotes] Location permission not granted');
        return null;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = currentPosition.coords;
      
      console.log('[useNotes] User location obtained:', { latitude, longitude });
      return { latitude, longitude };
    } catch (error) {
      console.error('[useNotes] Error getting user location:', error);
      return null;
    }
  }, []);

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
      console.log('=== STARTING PARALLEL OPTIMIZED SEARCH ===');
      console.log('Search query:', query);
      setLoading(true);
      
      // Clear previous search results when starting a new search
      console.log('[useNotes] Clearing previous search results');
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
      await saveSearchHistory(user.id, query);
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session');
        return;
      }

      // Get user's current location for "near me" queries
      const userLocation = await getUserLocation();
      console.log('[useNotes] User location for search:', userLocation);

      // Add a small delay to ensure "resolving" stage is visible
      await new Promise(resolve => setTimeout(resolve, 300));

      // PARALLEL EXECUTION: Run all three search functions simultaneously
      console.log('Step 1: Running location, people, and keyword searches in PARALLEL...');
      const parallelSearchStart = Date.now();
      
      // Create promises for all three searches with individual timing
      const locationPromise = (async () => {
        const start = Date.now();
        try {
          const result = await supabase.functions.invoke('search-recalls-with-location', {
            body: { 
              query: query.trim(),
              userLocation: userLocation,
            },
          });
          const searchTime = Date.now() - start;
          console.log(`[TIMING] Location search completed in ${searchTime}ms`);
          return { ...result, searchTime };
        } catch (error) {
          console.error('Location search error:', error);
          const searchTime = Date.now() - start;
          return { data: null, error, searchTime };
        }
      })();
      
      const peoplePromise = (async () => {
        const start = Date.now();
        try {
          const result = await supabase.functions.invoke('search-recalls-with-people', {
            body: { query: query.trim() },
          });
          const searchTime = Date.now() - start;
          console.log(`[TIMING] People search completed in ${searchTime}ms`);
          return { ...result, searchTime };
        } catch (error) {
          console.error('People search error:', error);
          const searchTime = Date.now() - start;
          return { data: null, error, searchTime };
        }
      })();
      
      const keywordPromise = (async () => {
        const start = Date.now();
        try {
          const result = await supabase.functions.invoke('search-recalls-with-keywords', {
            body: { 
              query: query.trim(),
              priorityRecallIds: [], // Will be updated with location/people results
            },
          });
          const searchTime = Date.now() - start;
          console.log(`[TIMING] Keyword search completed in ${searchTime}ms`);
          return { ...result, searchTime };
        } catch (error) {
          console.error('Keyword search error:', error);
          const searchTime = Date.now() - start;
          return { data: null, error, searchTime };
        }
      })();

      // Wait for all searches to complete in parallel
      const [locationResult, peopleResult, keywordResult] = await Promise.all([
        locationPromise,
        peoplePromise,
        keywordPromise,
      ]);

      const parallelSearchTime = Date.now() - parallelSearchStart;
      console.log(`All parallel searches completed in ${parallelSearchTime}ms`);

      // Process location results
      let locationRecalls: any[] = [];
      let locationInfoData: any = null;
      
      if (locationResult.data?.hasLocationIntent && locationResult.data?.locationResolved && locationResult.data?.recallIds?.length > 0) {
        console.log('Location intent detected and resolved!');
        console.log('Location info:', locationResult.data.locationInfo);
        
        // Handle multiple locations
        const locationInfo = locationResult.data.locationInfo;
        const displayName = locationInfo.multipleLocations 
          ? `${locationInfo.locationCount} locations: ${locationInfo.resolvedPlace}`
          : locationInfo.resolvedPlace;
        
        setSearchStage('resolving');
        setSearchLocationName(displayName);
        locationInfoData = locationInfo;
        setLocationInfo(locationInfoData);
        
        // Add delay to show resolving stage
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Create location recalls with match info
        locationRecalls = locationResult.data.recallIds.map((id: string) => ({
          recall_id: id,
          matchPercentage: 100,
          tier: 'HIGH',
          recall_data: { text: '', location: '', location_primary_type: '' },
          images_data: []
        }));
      } else {
        console.log('No location intent detected');
        setLocationInfo(null);
      }

      // Process people results
      let peopleRecalls: any[] = [];
      let personInfoData: PersonInfo | null = null;
      
      if (peopleResult.data?.hasPeopleIntent && peopleResult.data?.recallIds?.length > 0) {
        console.log('People intent detected!');
        console.log('Person info:', peopleResult.data.personInfo);
        
        setSearchStage('people');
        personInfoData = peopleResult.data.personInfo;
        setPersonInfo(personInfoData);
        setSearchPersonNames(personInfoData?.matchedNames || []);
        
        // Add delay to show people stage
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Create people recalls with match info
        peopleRecalls = peopleResult.data.recallIds.map((id: string) => ({
          recall_id: id,
          matchPercentage: 100,
          tier: 'HIGH',
          recall_data: { text: '', location: '', location_primary_type: '' },
          images_data: []
        }));
      } else {
        console.log('No people intent detected');
        setPersonInfo(null);
        setSearchPersonNames(undefined);
      }

      // Process keyword results
      let keywordRecalls: any[] = [];
      let extractedKeywords: string[] = [];
      
      if (keywordResult.data?.results && keywordResult.data.results.length > 0) {
        console.log('Keyword matches found!');
        console.log(`Found ${keywordResult.data.results.length} keyword matches`);
        
        setSearchStage('keywords');
        
        // Extract keywords from the result
        if (keywordResult.data.keywords && Array.isArray(keywordResult.data.keywords)) {
          extractedKeywords = keywordResult.data.keywords;
          setSearchExtractedKeywords(extractedKeywords);
          console.log('Extracted keywords:', extractedKeywords);
        }
        
        // Add delay to show keywords stage
        await new Promise(resolve => setTimeout(resolve, 400));
        
        keywordRecalls = keywordResult.data.results;
      } else {
        console.log('No keyword matches found');
        setSearchExtractedKeywords(undefined);
      }

      // Step 2: Use search-recalls-v2 with combined results
      console.log('Step 2: Running AI answer generation with combined results...');
      setSearchStage('searching');
      
      // Add delay to show searching stage
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const answerStart = Date.now();
      const { data: searchResults, error: searchError } = await supabase.functions.invoke('search-recalls-v2', {
        body: {
          query: query.trim(),
          locationRecalls: locationRecalls.length > 0 ? locationRecalls : undefined,
          peopleRecalls: peopleRecalls.length > 0 ? peopleRecalls : undefined,
          keywordRecalls: keywordRecalls.length > 0 ? keywordRecalls : undefined,
          personInfo: personInfoData,
        },
      });

      const aiAnswerTime = Date.now() - answerStart;
      console.log(`AI answer generation completed in ${aiAnswerTime}ms`);

      if (searchError) {
        console.error('Error in AI answer generation:', searchError);
        
        // Fallback: show combined results if available
        const allRecallIds = [
          ...locationRecalls.map(r => r.recall_id),
          ...peopleRecalls.map(r => r.recall_id),
          ...keywordRecalls.map(r => r.recall_id)
        ];
        const uniqueRecallIds = [...new Set(allRecallIds)];
        
        if (uniqueRecallIds.length > 0) {
          const { data: recallsData } = await supabase
            .from('recalls')
            .select('*')
            .in('id', uniqueRecallIds)
            .eq('user_id', user.id);

          const notesWithImages = await loadImagesForRecalls(recallsData || []);
          setNotes(notesWithImages);
          setSearchAnswer(null);
          setSearchConfidence(undefined);
          setSearchStage('complete');
          
          // Calculate and set search time
          const totalSearchTime = Date.now() - searchStartTime;
          setSearchTimeMs(totalSearchTime);
          setSearchTimings({
            locationSearchMs: locationResult.searchTime,
            peopleSearchMs: peopleResult.searchTime,
            keywordSearchMs: keywordResult.searchTime,
            aiAnswerMs: aiAnswerTime,
            totalMs: totalSearchTime,
          });
          
          return;
        }
        
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
        setSearchStage('complete');
        
        // Calculate and set search time
        const totalSearchTime = Date.now() - searchStartTime;
        setSearchTimeMs(totalSearchTime);
        setSearchTimings({
          locationSearchMs: locationResult.searchTime,
          peopleSearchMs: peopleResult.searchTime,
          keywordSearchMs: keywordResult.searchTime,
          aiAnswerMs: aiAnswerTime,
          totalMs: totalSearchTime,
        });
        
        return;
      }

      // Process V2 results
      const matchedRecallIds = searchResults?.results?.map((r: any) => r.id) || [];
      const answer = searchResults?.answer || null;
      const confidence = searchResults?.confidence || 0;
      
      console.log(`Found ${matchedRecallIds.length} AI-ranked results`);
      console.log('Answer:', answer);
      console.log('Confidence:', confidence);
      
      if (matchedRecallIds.length > 0) {
        const { data: recallsData } = await supabase
          .from('recalls')
          .select('*')
          .in('id', matchedRecallIds)
          .eq('user_id', user.id);

        // Map recalls with match info
        const orderedRecalls = searchResults.results
          .map((matchInfo: any) => {
            const recall = recallsData?.find(r => r.id === matchInfo.id);
            if (!recall) {
              return null;
            }
            
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
      } else {
        setNotes([]);
        setSearchAnswer(answer);
        setSearchConfidence(confidence);
      }
      
      setSearchStage('complete');
      
      // Calculate and set total search time
      const totalSearchTime = Date.now() - searchStartTime;
      setSearchTimeMs(totalSearchTime);
      setSearchTimings({
        locationSearchMs: locationResult.searchTime,
        peopleSearchMs: peopleResult.searchTime,
        keywordSearchMs: keywordResult.searchTime,
        aiAnswerMs: aiAnswerTime,
        totalMs: totalSearchTime,
      });
      
      console.log('=== PARALLEL SEARCH COMPLETE ===');
      console.log(`Total search time: ${totalSearchTime}ms`);
      console.log('Search timings:', {
        location: locationResult.searchTime,
        people: peopleResult.searchTime,
        keywords: keywordResult.searchTime,
        aiAnswer: aiAnswerTime,
        total: totalSearchTime,
      });
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
  }, [refreshNotes, user, loadImagesForRecalls, getUserLocation]);

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
    searchPersonNames,
    searchExtractedKeywords,
    searchTimeMs,
    searchTimings,
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
