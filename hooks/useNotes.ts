
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, deleteImageRecord } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const { user } = useAuth();

  const loadNotes = useCallback(async (pageNum: number = 0, append: boolean = false) => {
    if (!user) {
      setNotes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log(`Loading notes from Supabase for user: ${user.id}, page: ${pageNum}`);
      
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

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

      const notesWithImages = await loadImagesForRecalls(recallsData || []);

      if (append) {
        setNotes(prev => [...prev, ...notesWithImages]);
      } else {
        setNotes(notesWithImages);
      }

      setHasMore((recallsData || []).length === PAGE_SIZE);
      console.log(`Loaded ${notesWithImages.length} notes, hasMore: ${(recallsData || []).length === PAGE_SIZE}`);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMoreNotes = useCallback(async () => {
    if (!hasMore || loading) return;
    
    const nextPage = page + 1;
    setPage(nextPage);
    await loadNotes(nextPage, true);
  }, [hasMore, loading, page, loadNotes]);

  useEffect(() => {
    setPage(0);
    loadNotes(0, false);
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
      setPage(0);
      await loadNotes(0, false);
      return recallData.id;
    } catch (error) {
      console.error('Error adding recall:', error);
      throw error;
    }
  }, [loadNotes, user]);

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
      setPage(0);
      await loadNotes(0, false);
    } catch (error) {
      console.error('Error updating recall:', error);
      throw error;
    }
  }, [loadNotes, user]);

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
      setPage(0);
      await loadNotes(0, false);
    } catch (error) {
      console.error('Error deleting recall:', error);
      throw error;
    }
  }, [loadNotes, user]);

  const saveSearchHistory = useCallback(async (searchText: string) => {
    if (!user || !searchText.trim()) {
      return;
    }

    try {
      console.log('Upserting search history:', searchText);
      
      const { error } = await supabase
        .from('search_history')
        .upsert(
          {
            user_id: user.id,
            search_text: searchText.trim(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,search_text',
          }
        );

      if (error) {
        console.error('Error upserting search history:', error);
      } else {
        console.log('Search history saved successfully');
      }
    } catch (error) {
      console.error('Error saving search history:', error);
    }
  }, [user]);

  const searchNotes = useCallback(async (query: string) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    setSearchQuery(query);
    if (!query.trim()) {
      setPage(0);
      await loadNotes(0, false);
      return;
    }
    
    try {
      console.log('Searching recalls with OpenAI NER:', query);
      setLoading(true);
      
      await saveSearchHistory(query);
      
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
      setPage(0);
      await loadNotes(0, false);
    } finally {
      setLoading(false);
    }
  }, [loadNotes, user, saveSearchHistory]);

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

  const refreshNotes = useCallback(async () => {
    setPage(0);
    setHasMore(true);
    await loadNotes(0, false);
  }, [loadNotes]);

  return {
    notes,
    loading,
    searchQuery,
    hasMore,
    addNote,
    updateNote,
    deleteNote,
    searchNotes,
    refreshNotes,
    loadMoreNotes,
    getSearchHistory,
  };
}
