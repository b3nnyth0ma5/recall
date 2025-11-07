
import { useState, useEffect, useCallback } from 'react';
import { Note } from '@/types/Note';
import { storage } from '@/utils/storage';

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      const loadedNotes = await storage.getNotes();
      setNotes(loadedNotes);
      console.log('Loaded notes:', loadedNotes.length);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const addNote = useCallback(async (note: Note) => {
    try {
      await storage.addNote(note);
      await loadNotes();
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  }, [loadNotes]);

  const updateNote = useCallback(async (note: Note) => {
    try {
      await storage.updateNote(note);
      await loadNotes();
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  }, [loadNotes]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      await storage.deleteNote(noteId);
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
      const results = await storage.searchNotes(query);
      setNotes(results);
      console.log('Search results:', results.length);
    } catch (error) {
      console.error('Error searching notes:', error);
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
