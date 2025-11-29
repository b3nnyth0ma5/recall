
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Person {
  id: string;
  person_name: string;
}

interface PeopleGraphContextType {
  showGraph: boolean;
  people: Person[];
  anchorPosition: { x: number; y: number };
  openGraph: (people: Person[], position: { x: number; y: number }) => void;
  closeGraph: () => void;
}

const PeopleGraphContext = createContext<PeopleGraphContextType | undefined>(undefined);

export function PeopleGraphProvider({ children }: { children: ReactNode }) {
  const [showGraph, setShowGraph] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [anchorPosition, setAnchorPosition] = useState({ x: 0, y: 0 });

  const openGraph = (newPeople: Person[], position: { x: number; y: number }) => {
    console.log('Opening graph with people:', newPeople);
    console.log('Anchor position:', position);
    setPeople(newPeople);
    setAnchorPosition(position);
    setShowGraph(true);
  };

  const closeGraph = () => {
    console.log('Closing graph');
    setShowGraph(false);
  };

  return (
    <PeopleGraphContext.Provider
      value={{
        showGraph,
        people,
        anchorPosition,
        openGraph,
        closeGraph,
      }}
    >
      {children}
    </PeopleGraphContext.Provider>
  );
}

export function usePeopleGraph() {
  const context = useContext(PeopleGraphContext);
  if (context === undefined) {
    throw new Error('usePeopleGraph must be used within a PeopleGraphProvider');
  }
  return context;
}
