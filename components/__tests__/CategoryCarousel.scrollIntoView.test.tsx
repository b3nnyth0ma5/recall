/**
 * Tests for CategoryCarousel scroll-into-view behaviour.
 *
 * Jest hoisting rules: variables referenced inside jest.mock() factories must
 * be prefixed with "mock" (case-insensitive).
 *
 * react-native does `require('./Libraries/Lists/FlatList').default` so the
 * mock must export `{ default: MockFlatList }`.
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// FlatList mock — renders all items inline, exposes scrollToIndex and
// onViewableItemsChanged so tests can drive both.
// ---------------------------------------------------------------------------

// Module-level storage (mock-prefixed so Jest hoisting allows them in factory)
const mockScrollToIndex = jest.fn();
// Plain object to share state between factory closure and tests
const mockFlatListState = {
  onViewableItemsChanged: null as ((info: any) => void) | null,
};

jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = require('react');
  const { View } = require('react-native');
  const { forwardRef, useImperativeHandle } = React;

  const MockFlatList = forwardRef((props: any, ref: any) => {
    const {
      data,
      renderItem,
      ListHeaderComponent,
      onViewableItemsChanged,
      viewabilityConfigCallbackPairs,
    } = props;

    // Support both onViewableItemsChanged and viewabilityConfigCallbackPairs
    const effectiveCb =
      onViewableItemsChanged ??
      (viewabilityConfigCallbackPairs?.[0]?.onViewableItemsChanged ?? null);

    // Store for test access via the shared state object
    mockFlatListState.onViewableItemsChanged = effectiveCb;

    useImperativeHandle(ref, () => ({
      scrollToIndex: mockScrollToIndex,
    }));

    return (
      <View>
        {ListHeaderComponent ? <View>{ListHeaderComponent}</View> : null}
        {(data || []).map((item: any, index: number) =>
          renderItem ? (
            <View key={item.id ?? index}>
              {renderItem({ item, index })}
            </View>
          ) : null
        )}
      </View>
    );
  });

  MockFlatList.displayName = 'MockFlatList';
  return { default: MockFlatList };
});

// ---------------------------------------------------------------------------
// Supabase realtime mock — capture the .on() callback so tests can fire it
// ---------------------------------------------------------------------------

let mockCapturedRealtimeCallback: ((payload: any) => void) | null = null;
const mockUnsubscribeFn = jest.fn();
const mockRemoveChannelFn = jest.fn();

interface MockChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
}

const mockChannelObj: MockChannel = {
  on: jest.fn().mockImplementation((_event: any, _config: any, cb: any) => {
    mockCapturedRealtimeCallback = cb;
    return mockChannelObj;
  }),
  subscribe: jest.fn().mockImplementation(() => mockChannelObj),
  unsubscribe: mockUnsubscribeFn,
};

const mockSupabaseFromFn = jest.fn();

jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFromFn(...args),
    channel: jest.fn().mockReturnValue(mockChannelObj),
    removeChannel: mockRemoveChannelFn,
  },
}));

// ---------------------------------------------------------------------------
// Other mocks
// ---------------------------------------------------------------------------

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123' }, session: {}, loading: false }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: React.EffectCallback) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    require('react').useEffect(cb, []);
  },
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('@/utils/cdnVariant', () => ({
  cdnVariant: (url: string) => url,
}));

jest.mock('@/utils/debounce', () => ({
  debounce: (fn: any) => {
    const wrapped = (...args: any[]) => fn(...args);
    wrapped.cancel = jest.fn();
    return wrapped;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCategory(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    category_name: `Category ${id}`,
    icon_cdn_url: null,
    created_at: '2024-01-01T00:00:00Z',
    last_match_at: null,
    last_viewed_at: null,
    ...overrides,
  };
}

function setupSupabaseMock(categories: any[]) {
  mockSupabaseFromFn.mockImplementation((table: string) => {
    if (table === 'recollection_categories') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: categories, error: null }),
      };
    }
    if (table === 'user_widget_settings') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    return {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CategoryCarousel scroll-into-view', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCapturedRealtimeCallback = null;
    mockFlatListState.onViewableItemsChanged = null;
    mockScrollToIndex.mockClear();
    // Re-wire the channel mock after clearAllMocks
    mockChannelObj.on.mockImplementation((_event: any, _config: any, cb: any) => {
      mockCapturedRealtimeCallback = cb;
      return mockChannelObj;
    });
    mockChannelObj.subscribe.mockReturnValue(mockChannelObj);
  });

  it('calls scrollToIndex when realtime UPDATE bumps last_match_at for a non-visible category', async () => {
    const categories = [
      makeCategory('cat-0'),
      makeCategory('cat-1'),
      makeCategory('cat-2'),
    ];
    setupSupabaseMock(categories);

    const { CategoryCarousel } = require('../CategoryCarousel');
    render(<CategoryCarousel userId="user-123" />);

    // Wait for realtime callback to be registered (channel setup)
    await waitFor(() => {
      expect(mockCapturedRealtimeCallback).not.toBeNull();
    });

    // Wait for FlatList to render (categories loaded, loading=false)
    await waitFor(() => {
      expect(mockFlatListState.onViewableItemsChanged).not.toBeNull();
    });

    // Simulate: only cat-0 (index 0) is visible
    act(() => {
      mockFlatListState.onViewableItemsChanged?.({
        viewableItems: [{ item: categories[0], index: 0, isViewable: true }],
        changed: [],
      });
    });

    // Switch to fake timers BEFORE firing the realtime event so the
    // setTimeout(300ms) inside CategoryCarousel is registered as a fake timer
    jest.useFakeTimers();

    // Fire realtime UPDATE for cat-2 (index 2) — not visible
    act(() => {
      mockCapturedRealtimeCallback?.({
        eventType: 'UPDATE',
        new: {
          id: 'cat-2',
          last_match_at: '2024-06-01T12:00:00Z',
        },
        old: {},
      });
    });

    // Advance past the 300ms scroll delay
    act(() => {
      jest.advanceTimersByTime(400);
    });

    jest.useRealTimers();

    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 2,
      viewPosition: 0.5,
      animated: true,
    });
  });

  it('does NOT call scrollToIndex when realtime UPDATE bumps last_match_at for a visible category', async () => {
    const categories = [
      makeCategory('cat-0'),
      makeCategory('cat-1'),
    ];
    setupSupabaseMock(categories);

    const { CategoryCarousel } = require('../CategoryCarousel');
    render(<CategoryCarousel userId="user-123" />);

    await waitFor(() => {
      expect(mockCapturedRealtimeCallback).not.toBeNull();
    });

    await waitFor(() => {
      expect(mockFlatListState.onViewableItemsChanged).not.toBeNull();
    });

    // Simulate: cat-1 (index 1) is visible
    act(() => {
      mockFlatListState.onViewableItemsChanged?.({
        viewableItems: [{ item: categories[1], index: 1, isViewable: true }],
        changed: [],
      });
    });

    jest.useFakeTimers();

    // Fire realtime UPDATE for cat-1 (index 1) — it IS visible
    act(() => {
      mockCapturedRealtimeCallback?.({
        eventType: 'UPDATE',
        new: {
          id: 'cat-1',
          last_match_at: '2024-06-01T12:00:00Z',
        },
        old: {},
      });
    });

    act(() => {
      jest.advanceTimersByTime(400);
    });
    jest.useRealTimers();

    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it('does NOT call scrollToIndex when realtime UPDATE only changes last_viewed_at (no last_match_at change)', async () => {
    const categories = [
      makeCategory('cat-0', { last_match_at: '2024-06-01T10:00:00Z' }),
      makeCategory('cat-1', { last_match_at: '2024-06-01T10:00:00Z' }),
    ];
    setupSupabaseMock(categories);

    const { CategoryCarousel } = require('../CategoryCarousel');
    render(<CategoryCarousel userId="user-123" />);

    await waitFor(() => {
      expect(mockCapturedRealtimeCallback).not.toBeNull();
    });

    await waitFor(() => {
      expect(mockFlatListState.onViewableItemsChanged).not.toBeNull();
    });

    // No categories visible
    act(() => {
      mockFlatListState.onViewableItemsChanged?.({
        viewableItems: [],
        changed: [],
      });
    });

    jest.useFakeTimers();

    // Fire realtime UPDATE that only changes last_viewed_at — last_match_at stays the same
    act(() => {
      mockCapturedRealtimeCallback?.({
        eventType: 'UPDATE',
        new: {
          id: 'cat-1',
          last_viewed_at: '2024-06-01T11:00:00Z',
          // last_match_at is NOT in the payload — stays at existing value
        },
        old: {},
      });
    });

    act(() => {
      jest.advanceTimersByTime(400);
    });
    jest.useRealTimers();

    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });
});
