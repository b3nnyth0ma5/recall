
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, deleteImageRecord, saveSearchHistory } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type SearchStage = 'idle' | 'detecting' | 'resolving' | 'filtering' | 'searching' | 'complete';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [locationInfo, setLocationInfo] = useState<any>(null);
  const [isDeletingNote, setIsDeletingNote] = useState(false);
  const [searchAnswer, setSearchAnswer] = useState<string | null>(null);
  const [searchConfidence, setSearchConfidence] = useState<number | undefined>(undefined);
  const [searchStage, setSearchStage] = useState<SearchStage>('idle');
  const [searchLocationName, setSearchLocationName] = useState<string | undefined>(undefined);
  const { user } = useAuth();

  const ITEMS_PER_PAGE = 10;

  // Define loadImagesForRecalls FIRST before it's used
  const loadImagesForRecalls = useCallback(async (recalls: any[]) => {
    return await Promise.all(
      recalls.map(async (recall) => {
        try {
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('id')
            .eq('recall_id', recall.id)
            .order('created_at', { ascending: true });

          const imageResults = await Promise.all(
            (imagesData || []).map(async (img) => {
              try {
                const dataUrl = await getImageDataUrl(img.id);
                if (!dataUrl) {
                  return { url: '', id: img.id };
                }
                return { url: dataUrl, id: img.id };
              } catch (error) {
                console.error(`Exception processing image ${img.id}:`, error);
                return { url: '', id: img.id };
              }
            })
          );

          const validImageUrls = imageResults.filter(result => result.url !== '').map(result => result.url);
          const imageIds = imageResults.map(result => result.id);
          
          return { 
            ...recall, 
            images: validImageUrls, 
            imageIds: imageIds
          };
        } catch (error) {
          console.error(`Exception processing recall ${recall.id}:`, error);
          return { ...recall, images: [], imageIds: [] };
        }
      })
    );
  }, []);

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

      const notesWithImages = await Promise.all(
        (recallsData || []).map(async (recall) => {
          try {
            const { data: imagesData, error: imagesError } = await supabase
              .from('recall_images')
              .select('id')
              .eq('recall_id', recall.id)
              .order('created_at', { ascending: true });

            if (imagesError) {
              console.error('Error loading images for recall:', recall.id, imagesError);
              return { ...recall, images: [], imageIds: [] };
            }

            console.log(`Loaded ${imagesData?.length || 0} image records for recall ${recall.id}`);

            const imageResults = await Promise.all(
              (imagesData || []).map(async (img, index) => {
                try {
                  console.log(`Processing image ${index + 1}/${imagesData?.length || 0} (ID: ${img.id}) for recall ${recall.id}`);
                  const dataUrl = await getImageDataUrl(img.id);
                  if (!dataUrl) {
                    console.error(`Failed to get data URL for image ${img.id} (index ${index})`);
                    return { url: '', id: img.id };
                  }
                  console.log(`Successfully got data URL for image ${img.id}`);
                  return { url: dataUrl, id: img.id };
                } catch (error) {
                  console.error(`Exception processing image ${img.id}:`, error);
                  return { url: '', id: img.id };
                }
              })
            );

            const validImageUrls = imageResults.filter(result => result.url !== '').map(result => result.url);
            const imageIds = imageResults.map(result => result.id);
            
            console.log(`Recall ${recall.id} has ${validImageUrls.length}/${imageResults.length} valid images`);
            
            return { 
              ...recall, 
              images: validImageUrls, 
              imageIds: imageIds
            };
          } catch (error) {
            console.error(`Exception processing recall ${recall.id}:`, error);
            return { ...recall, images: [], imageIds: [] };
          }
        })
      );

      if (append) {
        // Prevent duplicates by filtering out notes that already exist
        setNotes(prevNotes => {
          const existingIds = new Set(prevNotes.map(note => note.id));
          const newUniqueNotes = notesWithImages.filter(note => !existingIds.has(note.id));
          console.log(`Adding ${newUniqueNotes.length} new unique notes (filtered ${notesWithImages.length - newUniqueNotes.length} duplicates)`);
          return [...prevNotes, ...newUniqueNotes];
        });
      } else {
        setNotes(notesWithImages);
      }
      
      console.log(`Loaded ${notesWithImages.length} notes for page ${pageNum}`);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [user]);

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

      // Load images for this recall
      const { data: imagesData } = await supabase
        .from('recall_images')
        .select('id')
        .eq('recall_id', recallData.id)
        .order('created_at', { ascending: true });

      const imageResults = await Promise.all(
        (imagesData || []).map(async (img) => {
          try {
            const dataUrl = await getImageDataUrl(img.id);
            if (!dataUrl) {
              return { url: '', id: img.id };
            }
            return { url: dataUrl, id: img.id };
          } catch (error) {
            console.error(`Exception processing image ${img.id}:`, error);
            return { url: '', id: img.id };
          }
        })
      );

      const validImageUrls = imageResults.filter(result => result.url !== '').map(result => result.url);
      const imageIds = imageResults.map(result => result.id);
      
      const updatedNote = { 
        ...recallData, 
        images: validImageUrls, 
        imageIds: imageIds
      };

      // Update the note in the list
      setNotes(prevNotes => 
        prevNotes.map(note => note.id === noteId ? updatedNote : note)
      );
      
      console.log('Single note refreshed successfully');
    } catch (error) {
      console.error('Error refreshing single note:', error);
    }
  }, [user]);

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
      
      const { data: imagesData } = await supabase
        .from('recall_images')
        .select('id')
        .eq('recall_id', noteId);

      if (imagesData && imagesData.length > 0) {
        for (const img of imagesData) {
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
          setSearchStage('complete');
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
        } else {
          setNotes([]);
          setSearchAnswer(answer);
          setSearchConfidence(confidence);
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
        setSearchStage('complete');
        return;
      }

      // Process V2 results
      const matchedRecallIds = searchResults?.results?.map((r: any) => r.id) || [];
      const answer = searchResults?.answer || null;
      const confidence = searchResults?.confidence || 0;
      
      console.log(`Found ${matchedRecallIds.length} results`);
      console.log('Answer:', answer);
      console.log('Confidence:', confidence);
      
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
      } else {
        setNotes([]);
        setSearchAnswer(answer);
        setSearchConfidence(confidence);
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
  };
}
