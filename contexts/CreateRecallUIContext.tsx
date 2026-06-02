import React, { createContext, useContext, useState } from 'react';

interface CreateRecallUIContextValue {
  isCreatePanelOpen: boolean;
  openCreatePanel: () => void;
  closeCreatePanel: () => void;
}

const CreateRecallUIContext = createContext<CreateRecallUIContextValue>({
  isCreatePanelOpen: false,
  openCreatePanel: () => {},
  closeCreatePanel: () => {},
});

export function CreateRecallUIProvider({ children }: { children: React.ReactNode }) {
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);

  const openCreatePanel = () => {
    console.log('[CreateRecallUI] Opening create panel');
    setIsCreatePanelOpen(true);
  };

  const closeCreatePanel = () => {
    console.log('[CreateRecallUI] Closing create panel');
    setIsCreatePanelOpen(false);
  };

  return (
    <CreateRecallUIContext.Provider value={{ isCreatePanelOpen, openCreatePanel, closeCreatePanel }}>
      {children}
    </CreateRecallUIContext.Provider>
  );
}

export function useCreateRecallUI() {
  return useContext(CreateRecallUIContext);
}
