
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { supabase, getImageDataUrl, deleteImageFromDatabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { user } = useAuth();

  const loadNotes = useCallback(async () => {
    if (!user) {
      setNotes([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('Loading notes from Supabase for user:', user.id);
      
      const { data: recallsData, error: recallsError } = await supabase
        .from('recalls')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (recallsError) {
        console.error('Error loading recalls:', recallsError);
        return;
      }

      const notesWithImages = await Promise.all(
        (recallsData || []).map(async (recall) => {
          const { data: imagesData, error: imagesError } = await supabase
            .from('recall_images')
            .select('id, image_data, content_type')
            .eq('recall_id', recall.id)
            .order('created_at', { ascending: true });

          if (imagesError) {
            console.error('Error loading images for recall:', recall.id, imagesError);
            return { ...recall, images: [], imageIds: [] };
          }

          console.log(`Loaded ${imagesData?.length || 0} images for recall ${recall.id}`);

          // Convert binary data to data URLs
          const imageUrls = await Promise.all(
            (imagesData || []).map(async (img) => {
              try {
                // Check if image_data exists and is valid
                if (!img.image_data) {
                  console.error('No image data for image:', img.id);
                  return '';
                }

                // Convert ArrayBuffer to base64
                let base64: string;
                if (img.image_data instanceof ArrayBuffer) {
                  const uint8Array = new Uint8Array(img.image_data);
                  base64 = btoa(
                    uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
                  );
                } else if (typeof img.image_data === 'string') {
                  // If it's already a string, use it directly
                  base64 = img.image_data;
                } else {
                  // Try to convert to Uint8Array
                  const uint8Array = new Uint8Array(img.image_data);
                  base64 = btoa(
                    uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
                  );
                }

                const dataUrl = `data:${img.content_type || 'image/jpeg'};base64,${base64}`;
                console.log(`Converted image ${img.id} to data URL (length: ${dataUrl.length})`);
                return dataUrl;
              } catch (error) {
                console.error('Error converting image data for image:', img.id, error);
                return '';
              }
            })
          );

          const validImageUrls = imageUrls.filter(url => url !== '');
          const imageIds = (imagesData || []).map(img => img.id);
          
          console.log(`Recall ${recall.id} has ${validImageUrls.length} valid images`);
          
          return { 
            ...recall, 
            images: validImageUrls, 
            imageIds: imageIds,
            imagePaths: imageIds // Keep for compatibility
          };
        })
      );

      setNotes(notesWithImages);
      console.log('Loaded notes:', notesWithImages.length);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

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

      // Note: Images are now uploaded separately with the recall_id
      // This is handled in the note-editor component

      console.log('Recall added successfully:', recallData.id);
      await loadNotes();
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

      // Note: Image updates are now handled separately in the note-editor component

      console.log('Recall updated successfully');
      await loadNotes();
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
      
      // Get all image IDs for this recall
      const { data: imagesData } = await supabase
        .from('recall_images')
        .select('id')
        .eq('recall_id', noteId);

      // Delete images from database (cascade delete will handle this automatically)
      // But we'll do it explicitly for clarity
      if (imagesData && imagesData.length > 0) {
        for (const img of imagesData) {
          await deleteImageFromDatabase(img.id);
        }
      }

      // Delete the recall (this will also cascade delete images due to foreign key)
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
      await loadNotes();
    } catch (error) {
      console.error('Error deleting recall:', error);
      throw error;
    }
  }, [loadNotes, user]);

  const searchNotes = useCallback(async (query: string) => {
    if (!user) {
      console.error('No user logged in');
      return;
    }

    setSearchQuery(query);
    if (!query.trim()) {
      await loadNotes();
      return;
    }
    
    try {
      console.log('Searching recalls:', query);
      setLoading(true);
      
      await saveSearchHistory(query);
      
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

      const notesWithImages = await Promise.all(
        (recallsData || []).map(async (recall) => {
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('id, image_data, content_type')
            .eq('recall_id', recall.id)
            .order('created_at', { ascending: true });

          const imageUrls = await Promise.all(
            (imagesData || []).map(async (img) => {
              try {
                if (!img.image_data) {
                  return '';
                }

                let base64: string;
                if (img.image_data instanceof ArrayBuffer) {
                  const uint8Array = new Uint8Array(img.image_data);
                  base64 = btoa(
                    uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
                  );
                } else if (typeof img.image_data === 'string') {
                  base64 = img.image_data;
                } else {
                  const uint8Array = new Uint8Array(img.image_data);
                  base64 = btoa(
                    uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
                  );
                }

                return `data:${img.content_type || 'image/jpeg'};base64,${base64}`;
              } catch (error) {
                console.error('Error converting image data:', error);
                return '';
              }
            })
          );

          const validImageUrls = imageUrls.filter(url => url !== '');
          const imageIds = (imagesData || []).map(img => img.id);
          
          return { 
            ...recall, 
            images: validImageUrls, 
            imageIds: imageIds,
            imagePaths: imageIds
          };
        })
      );

      setNotes(notesWithImages);
      console.log('Search results:', notesWithImages.length);
    } catch (error) {
      console.error('Error searching recalls:', error);
    } finally {
      setLoading(false);
    }
  }, [loadNotes, user]);

  const saveSearchHistory = async (searchText: string) => {
    if (!user || !searchText.trim()) return;

    try {
      const { data: existing } = await supabase
        .from('search_history')
        .select('id')
        .eq('user_id', user.id)
        .eq('search_text', searchText.trim())
        .single();

      if (existing) {
        await supabase
          .from('search_history')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('search_history')
          .insert([{
            user_id: user.id,
            search_text: searchText.trim(),
          }]);
      }
    } catch (error) {
      console.error('Error saving search history:', error);
    }
  };

  const getSearchHistory = useCallback(async () => {
    if (!user) return [];

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
    addNote,
    updateNote,
    deleteNote,
    searchNotes,
    refreshNotes: loadNotes,
    getSearchHistory,
  };
}
