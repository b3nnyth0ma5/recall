import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// FlatList mock — renders all items inline so virtualisation doesn't hide them.
// react-native does `require('./Libraries/Lists/FlatList').default` so we must
// export as { default: MockFlatList }.
// ---------------------------------------------------------------------------

jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = require('react');
  const { View } = require('react-native');
  const { forwardRef, useImperativeHandle } = React;

  const mockScrollToIndexFn = jest.fn();

  const MockFlatList = forwardRef((props: any, ref: any) => {
    const { data, renderItem, ListHeaderComponent } = props;

    useImperativeHandle(ref, () => ({
      scrollToIndex: mockScrollToIndexFn,
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
// Other mocks
// ---------------------------------------------------------------------------

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123' }, session: {}, loading: false }),
}));

const mockSupabaseFrom = jest.fn();
jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockSupabaseFrom(...args),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    }),
    removeChannel: jest.fn(),
  },
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

function makeCategory(overrides: Record<string, any> = {}) {
  return {
    id: 'cat-1',
    category_name: 'Travel',
    icon_cdn_url: null,
    created_at: '2024-01-01T00:00:00Z',
    last_match_at: null,
    last_viewed_at: null,
    ...overrides,
  };
}

function setupSupabaseMock(categories: any[]) {
  mockSupabaseFrom.mockImplementation((table: string) => {
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

describe('CategoryCarousel unseen dot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders unseen dot when last_match_at > last_viewed_at', async () => {
    const category = makeCategory({
      id: 'cat-1',
      last_match_at: '2024-06-01T12:00:00Z',
      last_viewed_at: '2024-06-01T10:00:00Z',
    });
    setupSupabaseMock([category]);

    const { CategoryCarousel } = require('../CategoryCarousel');
    const { findByTestId } = render(
      <CategoryCarousel userId="user-123" />
    );

    const dot = await findByTestId('unseen-dot-cat-1');
    expect(dot).toBeTruthy();
  });

  it('does NOT render unseen dot when last_viewed_at >= last_match_at', async () => {
    const category = makeCategory({
      id: 'cat-2',
      last_match_at: '2024-06-01T10:00:00Z',
      last_viewed_at: '2024-06-01T12:00:00Z',
    });
    setupSupabaseMock([category]);

    const { CategoryCarousel } = require('../CategoryCarousel');
    const { queryByTestId } = render(
      <CategoryCarousel userId="user-123" />
    );

    await waitFor(() => {
      expect(queryByTestId('unseen-dot-cat-2')).toBeNull();
    });
  });

  it('does NOT render unseen dot when last_match_at is null', async () => {
    const category = makeCategory({
      id: 'cat-3',
      last_match_at: null,
      last_viewed_at: null,
    });
    setupSupabaseMock([category]);

    const { CategoryCarousel } = require('../CategoryCarousel');
    const { queryByTestId } = render(
      <CategoryCarousel userId="user-123" />
    );

    await waitFor(() => {
      expect(queryByTestId('unseen-dot-cat-3')).toBeNull();
    });
  });
});
