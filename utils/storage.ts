
// This file is deprecated - we now use Supabase for storage
// Keeping for backwards compatibility but all functionality moved to hooks/useNotes.ts
export const storage = {
  async getNotes() {
    return [];
  },
  async saveNotes() {},
  async addNote() {},
  async updateNote() {},
  async deleteNote() {},
  async searchNotes() {
    return [];
  },
};
