import React, { createContext, useContext, useRef, useCallback } from 'react';

type Route = 'home' | 'search' | 'profile';

interface ScrollToTopContextValue {
  registerScrollToTop: (route: Route, handler: () => void) => () => void;
  triggerScrollToTop: (route: Route) => void;
  registerSearchFocus: (handler: () => void) => () => void;
  triggerSearchFocus: () => void;
}

const ScrollToTopContext = createContext<ScrollToTopContextValue>({
  registerScrollToTop: () => () => {},
  triggerScrollToTop: () => {},
  registerSearchFocus: () => () => {},
  triggerSearchFocus: () => {},
});

export function ScrollToTopProvider({ children }: { children: React.ReactNode }) {
  const handlersRef = useRef<Record<Route, Set<() => void>>>({
    home: new Set(),
    search: new Set(),
    profile: new Set(),
  });

  const searchFocusHandlersRef = useRef<Set<() => void>>(new Set());

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

  const registerSearchFocus = useCallback((handler: () => void) => {
    searchFocusHandlersRef.current.add(handler);
    return () => {
      searchFocusHandlersRef.current.delete(handler);
    };
  }, []);

  const triggerSearchFocus = useCallback(() => {
    console.log('[ScrollToTop] Triggering search focus');
    searchFocusHandlersRef.current.forEach((handler) => handler());
  }, []);

  return (
    <ScrollToTopContext.Provider value={{ registerScrollToTop, triggerScrollToTop, registerSearchFocus, triggerSearchFocus }}>
      {children}
    </ScrollToTopContext.Provider>
  );
}

export function useScrollToTop() {
  return useContext(ScrollToTopContext);
}
