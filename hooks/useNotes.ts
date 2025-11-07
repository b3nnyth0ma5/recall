
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { supabase } from '@/utils/supabase';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      console.log('Loading notes from Supabase...');
      
      const { data, error } = await supabase
        .from('recalls')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading notes:', error);
        return;
      }

      setNotes(data || []);
      console.log('Loaded notes:', data?.length || 0);
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
      console.log('Adding note to Supabase...');
      
      const { data, error } = await supabase
        .from('recalls')
        .insert([note])
        .select()
        .single();

      if (error) {
        console.error('Error adding note:', error);
        throw error;
      }

      console.log('Note added successfully:', data.id);
      await loadNotes();
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  }, [loadNotes]);

  const updateNote = useCallback(async (noteId: string, updates: Partial<Note>) => {
    try {
      console.log('Updating note in Supabase:', noteId);
      
      const { error } = await supabase
        .from('recalls')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId);

      if (error) {
        console.error('Error updating note:', error);
        throw error;
      }

      console.log('Note updated successfully');
      await loadNotes();
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  }, [loadNotes]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      console.log('Deleting note from Supabase:', noteId);
      
      const { error } = await supabase
        .from('recalls')
        .delete()
        .eq('id', noteId);

      if (error) {
        console.error('Error deleting note:', error);
        throw error;
      }

      console.log('Note deleted successfully');
      await loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
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
      console.log('Searching notes:', query);
      setLoading(true);
      
      // Fuzzy search across all text columns
      const { data, error } = await supabase
        .from('recalls')
        .select('*')
        .or(`text.ilike.%${query}%,location.ilike.%${query}%`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error searching notes:', error);
        return;
      }

      setNotes(data || []);
      console.log('Search results:', data?.length || 0);
    } catch (error) {
      console.error('Error searching notes:', error);
    } finally {
      setLoading(false);
    }
  }, [loadNotes]);

  return {
    notes,
    loading,
    searchQuery,
    addNote,
    updateNote,
    deleteNote,
    searchNotes,
    refreshNotes: loadNotes,
  };
}
