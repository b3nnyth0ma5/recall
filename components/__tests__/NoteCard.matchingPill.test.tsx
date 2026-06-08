import React from 'react';
import { render } from '@testing-library/react-native';
import { NoteCard } from '../NoteCard';
import { Note } from '@/types/Note';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/contexts/NotesContext', () => ({
  useNotesContext: () => ({
    getUrlMetadataForRecall: () => null,
    getCachedNote: (id: string) => null,
  }),
}));

jest.mock('@/utils/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
  },
  getImageDataUrl: jest.fn().mockResolvedValue(null),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({}),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

jest.mock('@/utils/cdnVariant', () => ({
  cdnVariant: (url: string) => url,
}));

jest.mock('@/utils/urlProcessor', () => ({
  extractUrls: () => [],
}));

jest.mock('@/utils/shareRecall', () => ({
  shareRecall: jest.fn(),
}));

jest.mock('@/utils/documentPicker', () => ({
  getDocumentColor: () => '#000',
  getFileExtension: () => 'pdf',
}));

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    Swipeable: ({ children }: any) => <View>{children}</View>,
  };
});

jest.mock('@gorhom/portal', () => {
  const { View } = require('react-native');
  return {
    PortalProvider: ({ children }: any) => <View>{children}</View>,
    PortalHost: ({ children }: any) => <View>{children}</View>,
    Portal: ({ children }: any) => <View>{children}</View>,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    text: 'Test recall text',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    images: [],
    imageIds: [],
    people: [],
    documents: [],
    category_matching_at: null,
    category_matched_at: null,
    ...overrides,
  };
}

const noop = () => {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NoteCard matching pill', () => {
  it('renders pill when category_matching_at is set and category_matched_at is null (text-only card)', () => {
    const note = makeNote({
      category_matching_at: '2024-06-01T10:00:00Z',
      category_matched_at: null,
    });
    const { getByTestId } = render(
      <NoteCard note={note} onPress={noop} />
    );
    expect(getByTestId('matching-pill')).toBeTruthy();
  });

  it('renders pill when category_matching_at > category_matched_at (image card)', () => {
    const note = makeNote({
      images: ['https://example.com/img.jpg'],
      imageIds: ['img-1'],
      category_matching_at: '2024-06-01T12:00:00Z',
      category_matched_at: '2024-06-01T10:00:00Z',
    });
    const { getByTestId } = render(
      <NoteCard note={note} onPress={noop} />
    );
    expect(getByTestId('matching-pill')).toBeTruthy();
  });

  it('does NOT render pill when category_matched_at >= category_matching_at (matching complete)', () => {
    const note = makeNote({
      category_matching_at: '2024-06-01T10:00:00Z',
      category_matched_at: '2024-06-01T12:00:00Z',
    });
    const { queryByTestId } = render(
      <NoteCard note={note} onPress={noop} />
    );
    expect(queryByTestId('matching-pill')).toBeNull();
  });

  it('does NOT render pill when category_matching_at is null (never matched)', () => {
    const note = makeNote({
      category_matching_at: null,
      category_matched_at: null,
    });
    const { queryByTestId } = render(
      <NoteCard note={note} onPress={noop} />
    );
    expect(queryByTestId('matching-pill')).toBeNull();
  });
});
