
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note } from '@/types/Note';

const NOTES_KEY = '@notes';

export const storage = {
  async getNotes(): Promise<Note[]> {
    try {
      const notesJson = await AsyncStorage.getItem(NOTES_KEY);
      if (notesJson) {
        return JSON.parse(notesJson);
      }
      return [];
    } catch (error) {
      console.error('Error loading notes:', error);
      return [];
    }
  },

  async saveNotes(notes: Note[]): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      console.log('Notes saved successfully');
    } catch (error) {
      console.error('Error saving notes:', error);
      throw error;
    }
  },

  async addNote(note: Note): Promise<void> {
    try {
      const notes = await this.getNotes();
      notes.unshift(note);
      await this.saveNotes(notes);
      console.log('Note added:', note.id);
    } catch (error) {
      console.error('Error adding note:', error);
      throw error;
    }
  },

  async updateNote(updatedNote: Note): Promise<void> {
    try {
      const notes = await this.getNotes();
      const index = notes.findIndex(n => n.id === updatedNote.id);
      if (index !== -1) {
        notes[index] = updatedNote;
        await this.saveNotes(notes);
        console.log('Note updated:', updatedNote.id);
      }
    } catch (error) {
      console.error('Error updating note:', error);
      throw error;
    }
  },

  async deleteNote(noteId: string): Promise<void> {
    try {
      const notes = await this.getNotes();
      const filteredNotes = notes.filter(n => n.id !== noteId);
      await this.saveNotes(filteredNotes);
      console.log('Note deleted:', noteId);
    } catch (error) {
      console.error('Error deleting note:', error);
      throw error;
    }
  },

  async searchNotes(query: string): Promise<Note[]> {
    try {
      const notes = await this.getNotes();
      const lowerQuery = query.toLowerCase();
      return notes.filter(note => 
        note.title.toLowerCase().includes(lowerQuery) ||
        note.content.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      console.error('Error searching notes:', error);
      return [];
    }
  }
};
