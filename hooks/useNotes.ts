
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, deleteImageRecord, saveSearchHistory } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const { user } = useAuth();

  const ITEMS_PER_PAGE = 10;

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
  }, [user]);

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
      console.log('Adding recall to Supabase...');
      
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert([{
          text: note.text,
          latitude: note.latitude,
          longitude: note.longitude,
          location: note.location,
          user_id: user.id,
        }])
        .select()
        .single();

      if (recallError) {
        console.error('Error adding recall:', recallError);
        throw recallError;
      }

      console.log('Recall added successfully:', recallData.id);
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
      console.log('Updating recall in Supabase:', noteId);
      
      const { error: recallError } = await supabase
        .from('recalls')
        .update({
          text: updates.text,
          latitude: updates.latitude,
          longitude: updates.longitude,
          location: updates.location,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .eq('user_id', user.id);

      if (recallError) {
        console.error('Error updating recall:', recallError);
        throw recallError;
      }

      console.log('Recall updated successfully');
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
    }
  }, [refreshNotes, user]);

  const searchNotes = useCallback(async (query: string) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    setSearchQuery(query);
    if (!query.trim()) {
      await refreshNotes();
      return;
    }
    
    try {
      console.log('Searching recalls with OpenAI NER:', query);
      setLoading(true);
      
      await saveSearchHistory(user.id, query);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session');
        return;
      }

      const { data: searchResults, error: searchError } = await supabase.functions.invoke('search-recalls', {
        body: {
          query: query.trim(),
          limit: 10,
        },
      });

      if (searchError) {
        console.error('Error calling search-recalls function:', searchError);
        const { data: recallsData, error: recallsError } = await supabase
          .from('recalls')
          .select('*')
          .eq('user_id', user.id)
          .or(`text.ilike.%${query}%,location.ilike.%${query}%`)
          .order('created_at', { ascending: false });

        if (recallsError) {
          console.error('Error searching recalls:', recallsError);
          return;
        }

        const notesWithImages = await loadImagesForRecalls(recallsData || []);
        setNotes(notesWithImages);
        console.log('Fallback search results:', notesWithImages.length);
        return;
      }

      console.log('OpenAI search results:', searchResults);

      const scoredRecalls = searchResults.results || [];
      const notesWithImages = await loadImagesForRecalls(scoredRecalls);
      
      setNotes(notesWithImages);
      console.log('AI-powered search results:', notesWithImages.length);
    } catch (error) {
      console.error('Error searching recalls:', error);
      await refreshNotes();
    } finally {
      setLoading(false);
    }
  }, [refreshNotes, user]);

  const loadImagesForRecalls = async (recalls: any[]) => {
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
  };

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
        .limit(10);

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
