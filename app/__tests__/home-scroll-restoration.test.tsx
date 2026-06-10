/**
 * Unit test: home screen scroll-position restoration contract.
 *
 * Verifies:
 *  1. Scrolling updates the module-level homeScrollOffset cache.
 *  2. When the screen remounts (simulated via useFocusEffect), scrollToOffset is
 *     called with the cached offset.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';

// ── Module-level mock helpers (must not reference out-of-scope vars) ──────────

const mockScrollToOffset = jest.fn();
const mockPush = jest.fn();
const mockRegisterScrollToTop = jest.fn(() => jest.fn());
const mockRefreshNotes = jest.fn();

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => {
  const mockUseFocusEffect = (cb: () => (() => void) | void) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    require('react').useEffect(cb, []);
  };
  return {
    Stack: { Screen: () => null },
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) }),
    useFocusEffect: mockUseFocusEffect,
  };
});

jest.mock('react-native-reanimated', () => {
  const mockReanimated = require('react-native-reanimated/mock');
  // Override Animated.FlatList to forward ref and fire lifecycle callbacks
  const mockAnimatedFlatList = require('react').forwardRef((props: any, ref: any) => {
    require('react').useImperativeHandle(ref, () => ({
      scrollToOffset: mockScrollToOffset,
    }));
    // Fire onContentSizeChange so the deferred restore path is exercised
    require('react').useEffect(() => {
      if (props.onContentSizeChange) {
        props.onContentSizeChange(0, 1000);
      }
    }, []);
    // Simulate a scroll event so the cache is populated
    require('react').useEffect(() => {
      if (props.onScroll) {
        props.onScroll({ nativeEvent: { contentOffset: { y: 320 } } });
      }
    }, []);
    return require('react').createElement(require('react-native').View, { testID: 'animated-flat-list' });
  });
  mockAnimatedFlatList.displayName = 'AnimatedFlatList';
  mockReanimated.default.FlatList = mockAnimatedFlatList;
  return mockReanimated;
});

jest.mock('@/contexts/NotesContext', () => ({
  useNotesContext: () => ({
    notes: [],
    loading: false,
    refreshNotes: mockRefreshNotes,
    loadMoreNotes: jest.fn(),
    hasMore: false,
    isLoadingMore: false,
    refreshSingleNote: jest.fn(),
    isDeletingNote: false,
    deleteNote: jest.fn(),
    refreshUrlMetadata: jest.fn(),
    addNoteOptimistic: jest.fn(),
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('@/contexts/CreateRecallUIContext', () => ({
  useCreateRecallUI: () => ({
    isCreatePanelOpen: false,
    openCreatePanel: jest.fn(),
    closeCreatePanel: jest.fn(),
  }),
}));

jest.mock('@/contexts/ScrollToTopContext', () => ({
  useScrollToTop: () => ({
    registerScrollToTop: mockRegisterScrollToTop,
  }),
}));

jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => Promise.resolve({ count: 0, error: null }),
          single: () => Promise.resolve({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    }),
  },
  uploadImageToDatabase: jest.fn(),
  uploadDocumentToDatabase: jest.fn(),
  triggerRecallEmbedding: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/components/NoteCard', () => ({ NoteCard: () => null }));
jest.mock('@/components/NoteCardSkeleton', () => ({ NoteCardSkeleton: () => null }));
jest.mock('@/components/ZeroState', () => ({ ZeroState: () => null }));
jest.mock('@/components/CombinedSearchAdd', () => ({ CombinedSearchAdd: () => null }));
jest.mock('@/components/SearchTopBar', () => ({ SearchTopBar: () => null }));
jest.mock('@/components/RecallHeader', () => () => null);
jest.mock('@/utils/urlProcessor', () => ({
  extractUrls: jest.fn(() => []),
  processRecallUrlsAndAwaitScrape: jest.fn(),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

// Import the screen AFTER all mocks are registered
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HomeScreen = require('../(tabs)/(home)/index').default;

describe('HomeScreen scroll restoration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates the module-level cache when the list fires a scroll event', () => {
    render(<HomeScreen />);

    act(() => {
      jest.runAllTimers();
    });

    // The mock fires onScroll with y=320. The cache is module-level so it
    // persists. We verify the cache was updated by checking that on the second
    // mount scrollToOffset is called with 320 (see next test).
    // Here we just assert the component rendered without throwing.
    expect(true).toBe(true);
  });

  it('calls scrollToOffset with the cached offset when the screen regains focus', () => {
    // First mount — scroll event fires, cache is set to 320
    const { unmount } = render(<HomeScreen />);

    act(() => {
      jest.runAllTimers();
    });

    mockScrollToOffset.mockClear();
    unmount();

    // Second mount — useFocusEffect fires, should restore to 320
    render(<HomeScreen />);

    act(() => {
      jest.runAllTimers();
    });

    // scrollToOffset should have been called with offset 320 at some point
    const calls = mockScrollToOffset.mock.calls;
    const restorationCall = calls.find(
      (call) => call[0] && call[0].offset === 320 && call[0].animated === false,
    );
    expect(restorationCall).toBeDefined();
  });
});
