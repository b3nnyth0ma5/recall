import React, { createContext, useContext, useRef, useCallback } from 'react';

type Route = 'home' | 'search' | 'profile';

interface ScrollToTopContextValue {
  registerScrollToTop: (route: Route, handler: () => void) => () => void;
  triggerScrollToTop: (route: Route) => void;
}

const ScrollToTopContext = createContext<ScrollToTopContextValue>({
  registerScrollToTop: () => () => {},
  triggerScrollToTop: () => {},
});

export function ScrollToTopProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef<Record<Route, Set<() => void>>>({
    home: new Set(),
    search: new Set(),
    profile: new Set(),
  });

  const registerScrollToTop = useCallback((route: Route, handler: () => void) => {
    handlersRef.current[route].add(handler);
    return () => {
      handlersRef.current[route].delete(handler);
    };
  }, []);

  const triggerScrollToTop = useCallback((route: Route) => {
    console.log(`[ScrollToTop] Triggering scroll to top for route: ${route}`);
    handlersRef.current[route].forEach((handler) => handler());
  }, []);

  return (
    <ScrollToTopContext.Provider value={{ registerScrollToTop, triggerScrollToTop }}>
      {children}
    </ScrollToTopContext.Provider>
  );
}

export function useScrollToTop() {
  return useContext(ScrollToTopContext);
}
