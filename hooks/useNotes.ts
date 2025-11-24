
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, deleteImageRecord, saveSearchHistory } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
// import Toast from 'react-native-toast-message';

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
      
      // COMMENTED OUT TOAST MESSAGE
      // Toast.show({
      //   type: 'success',
      //   text1: 'Recall Added',
      //   text2: 'Pull down to refresh',
      //   position: 'top',
      //   visibilityTime: 3000,
      //   topOffset: 60,
      // });
      
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
      
      // COMMENTED OUT TOAST MESSAGE
      // Toast.show({
      //   type: 'success',
      //   text1: 'Recall Updated',
      //   text2: 'Pull down to refresh',
      //   position: 'top',
      //   visibilityTime: 3000,
      //   topOffset: 60,
      // });
      
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
      
      // COMMENTED OUT TOAST MESSAGE
      // Toast.show({
      //   type: 'success',
      //   text1: 'Recall Deleted',
      //   text2: 'Pull down to refresh',
      //   position: 'top',
      //   visibilityTime: 3000,
      //   topOffset: 60,
      // });
      
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
      await refreshNotes();
      return;
    }
    
    try {
      console.log('=== STARTING SEARCH ===');
      console.log('Search query:', query);
      console.log('Using V2 search:', useV2);
      setLoading(true);
      
      // Save search history
      await saveSearchHistory(user.id, query);
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session');
        return;
      }

      const functionName = useV2 ? 'search-recalls-v2' : 'search-recalls';
      console.log(`Calling ${functionName} edge function...`);
      const startTime = Date.now();
      
      const { data: searchResults, error: searchError } = await supabase.functions.invoke(functionName, {
        body: {
          query: query.trim(),
          limit: useV2 ? undefined : 10, // V2 always returns 8 matches
        },
      });

      const endTime = Date.now();
      console.log(`Edge function call completed in ${endTime - startTime}ms`);

      if (searchError) {
        console.error('=== EDGE FUNCTION ERROR ===');
        console.error(`Error calling ${functionName} function:`, searchError);
        console.error('Error details:', JSON.stringify(searchError, null, 2));
        
        // Fallback to basic search
        console.log('Falling back to basic text search...');
        const { data: recallsData, error: recallsError } = await supabase
          .from('recalls')
          .select('*')
          .eq('user_id', user.id)
          .or(`text.ilike.%${query}%,location.ilike.%${query}%`)
          .order('created_at', { ascending: false });

        if (recallsError) {
          console.error('Error in fallback search:', recallsError);
          return;
        }

        const notesWithImages = await loadImagesForRecalls(recallsData || []);
        setNotes(notesWithImages);
        setSearchAnswer(null);
        setSearchConfidence(undefined);
        setLocationInfo(null);
        console.log('Fallback search results:', notesWithImages.length);
        return;
      }

      console.log('=== EDGE FUNCTION SUCCESS ===');
      console.log('Search results received:', JSON.stringify(searchResults, null, 2));

      if (useV2) {
        // V2 response format: { answer, confidence, results: [{ id, matchPercentage, usedForAnswer }] }
        const matchedRecallIds = searchResults?.results?.map((r: any) => r.id) || [];
        const answer = searchResults?.answer || null;
        const confidence = searchResults?.confidence || 0;
        
        console.log(`Found ${matchedRecallIds.length} V2 results`);
        console.log('Answer:', answer);
        console.log('Confidence:', confidence);
        console.log('Results with usedForAnswer flags:', searchResults?.results);
        
        // Fetch full recall data for matched IDs
        if (matchedRecallIds.length > 0) {
          const { data: recallsData, error: recallsError } = await supabase
            .from('recalls')
            .select('*')
            .in('id', matchedRecallIds)
            .eq('user_id', user.id);

          if (recallsError) {
            console.error('Error fetching recalls:', recallsError);
            return;
          }

          // Map recalls with match info, preserving the order from search results
          // The search results are already ordered with answer sources first
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
          setLocationInfo(null); // V2 doesn't use location filtering
        } else {
          setNotes([]);
          setSearchAnswer(answer);
          setSearchConfidence(confidence);
          setLocationInfo(null);
        }
      } else {
        // V1 response format (existing)
        const scoredRecalls = searchResults?.results || [];
        const answer = searchResults?.answer || null;
        const confidence = searchResults?.confidence;
        const hasLocationIntent = searchResults?.hasLocationIntent || false;
        const location = searchResults?.location || null;
        const proximity = searchResults?.proximity || null;
        const locationType = searchResults?.type || null;
        
        console.log(`Found ${scoredRecalls.length} results`);
        console.log('Answer:', answer);
        console.log('Confidence:', confidence);
        console.log('Has location intent:', hasLocationIntent);
        console.log('Location:', location);
        console.log('Proximity:', proximity);
        console.log('Location type:', locationType);
        
        // Load images for the results
        const notesWithImages = await loadImagesForRecalls(scoredRecalls);
        
        // Store location info if available
        if (hasLocationIntent && location) {
          setLocationInfo({
            location,
            proximity,
            type: locationType,
            resolvedPlace: location, // Use the extracted location name
          });
          console.log('Location filtering applied:', { location, proximity, type: locationType });
        } else {
          setLocationInfo(null);
        }
        
        // Store answer and confidence
        setSearchAnswer(answer);
        setSearchConfidence(confidence);
        
        setNotes(notesWithImages);
      }
      
      console.log('=== SEARCH COMPLETE ===');
      console.log('AI-powered search results:', notes.length);
      console.log('Answer set:', searchAnswer ? 'Yes' : 'No');
      console.log('Confidence:', searchConfidence);
    } catch (error) {
      console.error('=== SEARCH EXCEPTION ===');
      console.error('Error searching recalls:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      
      // Fallback to refresh
      await refreshNotes();
      setSearchAnswer(null);
      setSearchConfidence(undefined);
      setLocationInfo(null);
    } finally {
      setLoading(false);
    }
  }, [refreshNotes, user, loadImagesForRecalls, notes.length, searchAnswer, searchConfidence]);

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
        .limit(20); // Changed from 10 to 20

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
