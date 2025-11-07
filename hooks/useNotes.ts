
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageUrl, deleteImage } from '@/utils/supabase';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      console.log('Current user ID:', user?.id);
    };
    getUser();
  }, []);

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading notes from Supabase...');
      
      // Fetch recalls
      const { data: recallsData, error: recallsError } = await supabase
        .from('recalls')
        .select('*')
        .order('created_at', { ascending: false });

      if (recallsError) {
        console.error('Error loading recalls:', recallsError);
        return;
      }

      // Fetch images for each recall
      const notesWithImages = await Promise.all(
        (recallsData || []).map(async (recall) => {
          const { data: imagesData, error: imagesError } = await supabase
            .from('recall_images')
            .select('image_path')
            .eq('recall_id', recall.id)
            .order('created_at', { ascending: true });

          if (imagesError) {
            console.error('Error loading images for recall:', recall.id, imagesError);
            return { ...recall, images: [] };
          }

          // Convert image paths to URLs
          const imageUrls = (imagesData || []).map(img => getImageUrl(img.image_path));
          return { ...recall, images: imageUrls, imagePaths: (imagesData || []).map(img => img.image_path) };
        })
      );

      setNotes(notesWithImages);
      console.log('Loaded notes:', notesWithImages.length);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addNote = useCallback(async (note: Omit<Note, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      console.log('Adding recall to Supabase...');
      
      // Insert recall
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert([{
          text: note.text,
          latitude: note.latitude,
          longitude: note.longitude,
          location: note.location,
          user_id: userId,
        }])
        .select()
        .single();

      if (recallError) {
        console.error('Error adding recall:', recallError);
        throw recallError;
      }

      // Insert images
      if (note.imagePaths && note.imagePaths.length > 0) {
        const imageRecords = note.imagePaths.map(path => ({
          recall_id: recallData.id,
          image_path: path,
        }));

        const { error: imagesError } = await supabase
          .from('recall_images')
          .insert(imageRecords);

        if (imagesError) {
          console.error('Error adding images:', imagesError);
        }
      }

      console.log('Recall added successfully:', recallData.id);
      await loadNotes();
    } catch (error) {
      console.error('Error adding recall:', error);
      throw error;
    }
  }, [loadNotes, userId]);

  const updateNote = useCallback(async (noteId: string, updates: Partial<Note>) => {
    try {
      console.log('Updating recall in Supabase:', noteId);
      
      // Update recall
      const { error: recallError } = await supabase
        .from('recalls')
        .update({
          text: updates.text,
          latitude: updates.latitude,
          longitude: updates.longitude,
          location: updates.location,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId);

      if (recallError) {
        console.error('Error updating recall:', recallError);
        throw recallError;
      }

      // Update images if provided
      if (updates.imagePaths !== undefined) {
        // Delete existing images
        const { error: deleteError } = await supabase
          .from('recall_images')
          .delete()
          .eq('recall_id', noteId);

        if (deleteError) {
          console.error('Error deleting old images:', deleteError);
        }

        // Insert new images
        if (updates.imagePaths.length > 0) {
          const imageRecords = updates.imagePaths.map(path => ({
            recall_id: noteId,
            image_path: path,
          }));

          const { error: imagesError } = await supabase
            .from('recall_images')
            .insert(imageRecords);

          if (imagesError) {
            console.error('Error adding new images:', imagesError);
          }
        }
      }

      console.log('Recall updated successfully');
      await loadNotes();
    } catch (error) {
      console.error('Error updating recall:', error);
      throw error;
    }
  }, [loadNotes]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      console.log('Deleting recall from Supabase:', noteId);
      
      // Get image paths before deleting
      const { data: imagesData } = await supabase
        .from('recall_images')
        .select('image_path')
        .eq('recall_id', noteId);

      // Delete from storage
      if (imagesData && imagesData.length > 0) {
        for (const img of imagesData) {
          await deleteImage(img.image_path);
        }
      }

      // Delete recall (cascade will delete recall_images entries)
      const { error } = await supabase
        .from('recalls')
        .delete()
        .eq('id', noteId);

      if (error) {
        console.error('Error deleting recall:', error);
        throw error;
      }

      console.log('Recall deleted successfully');
      await loadNotes();
    } catch (error) {
      console.error('Error deleting recall:', error);
      throw error;
    }
  }, [loadNotes]);

  const searchNotes = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await loadNotes();
      return;
    }
    
    try {
      console.log('Searching recalls:', query);
      setLoading(true);
      
      // Save search to history
      if (userId) {
        await saveSearchHistory(query);
      }
      
      // Fuzzy search across all text columns
      const { data: recallsData, error: recallsError } = await supabase
        .from('recalls')
        .select('*')
        .or(`text.ilike.%${query}%,location.ilike.%${query}%`)
        .order('created_at', { ascending: false });

      if (recallsError) {
        console.error('Error searching recalls:', recallsError);
        return;
      }

      // Fetch images for each recall
      const notesWithImages = await Promise.all(
        (recallsData || []).map(async (recall) => {
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('image_path')
            .eq('recall_id', recall.id)
            .order('created_at', { ascending: true });

          const imageUrls = (imagesData || []).map(img => getImageUrl(img.image_path));
          return { ...recall, images: imageUrls, imagePaths: (imagesData || []).map(img => img.image_path) };
        })
      );

      setNotes(notesWithImages);
      console.log('Search results:', notesWithImages.length);
    } catch (error) {
      console.error('Error searching recalls:', error);
    } finally {
      setLoading(false);
    }
  }, [loadNotes, userId]);

  const saveSearchHistory = async (searchText: string) => {
    if (!userId || !searchText.trim()) return;

    try {
      // Check if search already exists for this user
      const { data: existing } = await supabase
        .from('search_history')
        .select('id')
        .eq('user_id', userId)
        .eq('search_text', searchText.trim())
        .single();

      if (existing) {
        // Update existing search with new timestamp
        await supabase
          .from('search_history')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        // Insert new search
        await supabase
          .from('search_history')
          .insert([{
            user_id: userId,
            search_text: searchText.trim(),
          }]);
      }
    } catch (error) {
      console.error('Error saving search history:', error);
    }
  };

  const getSearchHistory = useCallback(async () => {
    if (!userId) return [];

    try {
      const { data, error } = await supabase
        .from('search_history')
        .select('*')
        .eq('user_id', userId)
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
  }, [userId]);

  return {
    notes,
    loading,
    searchQuery,
    addNote,
    updateNote,
    deleteNote,
    searchNotes,
    refreshNotes: loadNotes,
    getSearchHistory,
  };
}
