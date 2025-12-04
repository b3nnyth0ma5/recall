
import { useState, useEffect, useCallback, useRef } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, deleteImageRecord, saveSearchHistory } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

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

  const ITEMS_PER_PAGE = 10;
  
  // Cache for people data to avoid redundant queries
  const peopleCache = useRef<Map<string, any[]>>(new Map());
  // Cache for image data to avoid redundant queries
  const imageCache = useRef<Map<string, string>>(new Map());
  // NEW: Cache for full note data to optimize note editor loading
  const noteCache = useRef<Map<string, Note>>(new Map());

  // NEW: Function to get cached note data
  const getCachedNote = useCallback((noteId: string): Note | null => {
    const cached = noteCache.current.get(noteId);
    if (cached) {
      console.log(`[useNotes] Cache HIT for note ${noteId}`);
      return cached;
    }
    console.log(`[useNotes] Cache MISS for note ${noteId}`);
    return null;
  }, []);

  // NEW: Function to update note cache
  const updateNoteCache = useCallback((note: Note) => {
    noteCache.current.set(note.id, note);
    console.log(`[useNotes] Updated cache for note ${note.id}`);
  }, []);

  // Optimized helper function to load people for recalls in batch
  const loadPeopleForRecalls = useCallback(async (recallIds: string[]) => {
    if (!recallIds || recallIds.length === 0) {
      return {};
    }

    try {
      // Check cache first
      const uncachedIds = recallIds.filter(id => !peopleCache.current.has(id));
      
      if (uncachedIds.length === 0) {
        // All data is cached
        const result: { [key: string]: any[] } = {};
        recallIds.forEach(id => {
          result[id] = peopleCache.current.get(id) || [];
        });
        return result;
      }

      // Fetch only uncached data with optimized query using composite index
      // Uses new idx_recall_people_person_user index
      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('recall_id, person_id, persons!inner(id, person_name)')
        .in('recall_id', uncachedIds);

      if (recallPeopleError) {
        console.error('Error loading recall_people:', recallPeopleError);
        return {};
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
          });
        }
      });

      // Update cache
      uncachedIds.forEach(id => {
        peopleCache.current.set(id, peopleByRecallId[id] || []);
      });

      // Merge cached and new data
      const result: { [key: string]: any[] } = {};
      recallIds.forEach(id => {
        result[id] = peopleCache.current.get(id) || [];
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
    // Uses idx_recall_images_user_recall index
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
          
          // Load first TWO images immediately for better UX (as per recent requirement)
          const imageResults = await Promise.all(
            recallImages.map(async (img, index) => {
              try {
                // Load first two images, others will be lazy loaded
                if (index < 2) {
                  // Check cache first
                  if (imageCache.current.has(img.id)) {
                    return { url: imageCache.current.get(img.id)!, id: img.id };
                  }
                  
                  // Prefer CDN URL if available (much faster)
                  if (img.cdn_url) {
                    imageCache.current.set(img.id, img.cdn_url);
                    return { url: img.cdn_url, id: img.id };
                  }
                  
                  // Fallback to base64 data
                  const dataUrl = await getImageDataUrl(img.id);
                  if (dataUrl) {
                    imageCache.current.set(img.id, dataUrl);
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
    // Clear caches on refresh
    peopleCache.current.clear();
    imageCache.current.clear();
    noteCache.current.clear();
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
      peopleCache.current.delete(noteId);

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
      noteCache.current.delete(noteId);
      
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
      console.log('Deleting recall from Supabase:', noteId);
      setIsDeletingNote(true);
      
      // Clear caches for this recall
      peopleCache.current.delete(noteId);
      noteCache.current.delete(noteId);
      
      // Get all images for this recall
      const { data: imagesData } = await supabase
        .from('recall_images')
        .select('id')
        .eq('recall_id', noteId);

      // Clear image cache
      if (imagesData && imagesData.length > 0) {
        for (const img of imagesData) {
          imageCache.current.delete(img.id);
          await deleteImageRecord(img.id);
        }
      }

      const { error } = await supabase
        .from('recalls')
        .delete()
        .eq('id', noteId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting recall:', error);
        throw error;
      }

      console.log('Recall deleted successfully');
      
      await refreshNotes();
    } catch (error) {
      console.error('Error deleting recall:', error);
      throw error;
    } finally {
      setIsDeletingNote(false);
    }
  }, [refreshNotes, user]);

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
      
      // Save search history (uses idx_search_history_user_updated index)
      await saveSearchHistory(user.id, query);
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session');
        return;
      }

      // Step 1: Check for location intent using search-recalls-with-location
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
        
        // Store location info
        setLocationInfo(locationData.locationInfo);
        
        // Step 2: Use search-recalls-v2 with the filtered recall IDs
        console.log('Step 2: Running AI search on location-filtered recalls...');
        setSearchStage('searching');
        
        const searchStart = Date.now();
        const { data: searchResults, error: searchError } = await supabase.functions.invoke('search-recalls-v2', {
          body: {
            query: locationData.cleanedQuery || query.trim(),
            recallIds: locationData.recallIds, // Pass filtered IDs
          },
        });

        console.log(`AI search completed in ${Date.now() - searchStart}ms`);

        if (searchError) {
          console.error('Error in AI search:', searchError);
          // Fallback: just show the location-filtered recalls
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
        console.log('Answer:', answer);
        console.log('Confidence:', confidence);
        console.log('Person info:', personInfoData);
        
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

      // No location intent or couldn't resolve - use regular V2 search
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
      console.log('Answer:', answer);
      console.log('Confidence:', confidence);
      console.log('Person info:', personInfoData);
      
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
      // Uses idx_search_history_user_updated index
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
