
import React, { createContext, useContext } from 'react';
import { useNotes } from '@/hooks/useNotes';

type NotesContextType = ReturnType<typeof useNotes>;

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const notes = useNotes();
  return <NotesContext.Provider value={notes}>{children}</NotesContext.Provider>;
}

export function useNotesContext(): NotesContextType {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotesContext must be used within a NotesProvider');
  return ctx;
}
