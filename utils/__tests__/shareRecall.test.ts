/**
 * Unit tests for utils/shareRecall.ts
 *
 * Covers:
 *  1. DB returns 3 images, in-memory has 1 → Share.open called with 3 URLs
 *  2. currentImageIndex=2 → user-selected URL moved to position 0
 *  3. DB error → falls back to in-memory images
 *  4. DB empty + in-memory empty → Share.open NOT called with urls (text-only path)
 *
 * Platform.OS is already 'ios' via the jest-expo preset (defaultPlatform: 'ios').
 * All jest.mock() calls are hoisted above imports by Babel, so mock setup is
 * always in place before the SUT module is evaluated.
 */

// eslint-disable-next-line import/first
import { shareRecall } from '../shareRecall';
// eslint-disable-next-line import/first
import { Note } from '@/types/Note';

// ---------------------------------------------------------------------------
// react-native-share mock
// NOTE: jest.mock is hoisted above const declarations, so the factory must
// not reference outer variables. We expose the spy via the module registry.
// ---------------------------------------------------------------------------
jest.mock('react-native-share', () => {
  const openSpy = jest.fn().mockResolvedValue({});
  return { default: { open: openSpy } };
});

// ---------------------------------------------------------------------------
// expo-clipboard mock
// ---------------------------------------------------------------------------
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// expo-file-system/legacy mock
// ---------------------------------------------------------------------------
const mockDownloadAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  downloadAsync: (...args: any[]) => mockDownloadAsync(...args),
  getInfoAsync: (...args: any[]) => mockGetInfoAsync(...args),
  deleteAsync: (...args: any[]) => mockDeleteAsync(...args),
  cacheDirectory: '/tmp/cache/',
}));

// ---------------------------------------------------------------------------
// expo-linking mock
// ---------------------------------------------------------------------------
jest.mock('expo-linking', () => ({
  parse: jest.fn().mockReturnValue({ path: '', hostname: '', queryParams: {} }),
}));

// ---------------------------------------------------------------------------
// react-native-toast-message mock
// The factory runs once at hoist time; jest.fn() inside is safe.
// ---------------------------------------------------------------------------
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Supabase chainable mock
// ---------------------------------------------------------------------------
const mockOrderFn = jest.fn();
const mockEqFn = jest.fn();
const mockSelectFn = jest.fn();
const mockFromFn = jest.fn();

// Wire the chain: from → select → eq → order
mockFromFn.mockReturnValue({ select: mockSelectFn });
mockSelectFn.mockReturnValue({ eq: mockEqFn });
mockEqFn.mockReturnValue({ order: mockOrderFn });

jest.mock('@/utils/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFromFn(...args),
  },
}));

// Retrieve the hoisted spy from the mocked module
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockShareOpen: jest.Mock = require('react-native-share').default.open;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockClipboardSet: jest.Mock = require('expo-clipboard').setStringAsync;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecall(overrides: Partial<Note> = {}): Note {
  return {
    id: 'recall-1',
    text: 'Test recall text',
    images: ['https://cdn.example.com/img1.jpg'],
    created_at: '2024-01-01T00:00:00Z',
    user_id: 'user-1',
    ...overrides,
  } as Note;
}

const DB_IMAGES = [
  { id: 'img-1', cdn_url: 'https://cdn.example.com/img1.jpg', created_at: '2024-01-01T00:00:00Z' },
  { id: 'img-2', cdn_url: 'https://cdn.example.com/img2.jpg', created_at: '2024-01-01T00:00:01Z' },
  { id: 'img-3', cdn_url: 'https://cdn.example.com/img3.jpg', created_at: '2024-01-01T00:00:02Z' },
];

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Default: successful file download
  mockDownloadAsync.mockResolvedValue({ status: 200, uri: '/tmp/cache/file.jpg' });
  mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1234 });
  mockDeleteAsync.mockResolvedValue(undefined);

  // Re-wire chain after clearAllMocks
  mockFromFn.mockReturnValue({ select: mockSelectFn });
  mockSelectFn.mockReturnValue({ eq: mockEqFn });
  mockEqFn.mockReturnValue({ order: mockOrderFn });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('shareRecall', () => {
  it('Test 1: DB has 3 images, in-memory has 1 → Share.open called with 3 URLs', async () => {
    mockOrderFn.mockResolvedValue({ data: DB_IMAGES, error: null });

    const recall = makeRecall({
      images: ['https://cdn.example.com/img1.jpg'],
    });

    await shareRecall(recall, 0);

    // Supabase chain was called correctly
    expect(mockFromFn).toHaveBeenCalledWith('recall_images');
    expect(mockSelectFn).toHaveBeenCalledWith('id, cdn_url, created_at');
    expect(mockEqFn).toHaveBeenCalledWith('recall_id', 'recall-1');
    expect(mockOrderFn).toHaveBeenCalledWith('created_at', { ascending: true });

    // downloadAsync called 3 times (once per DB image)
    expect(mockDownloadAsync).toHaveBeenCalledTimes(3);

    // Share.open called with urls of length 3 and NO message field
    expect(mockShareOpen).toHaveBeenCalledTimes(1);
    const shareCall = mockShareOpen.mock.calls[0][0];
    expect(shareCall.urls).toHaveLength(3);
    expect(shareCall.message).toBeUndefined();

    // Clipboard should have received the share text
    expect(mockClipboardSet).toHaveBeenCalledTimes(1);
    expect(typeof mockClipboardSet.mock.calls[0][0]).toBe('string');
    expect(mockClipboardSet.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('Test 2: currentImageIndex=2 → user-selected URL moved to position 0', async () => {
    mockOrderFn.mockResolvedValue({ data: DB_IMAGES, error: null });

    const recall = makeRecall({
      images: [
        'https://cdn.example.com/img1.jpg',
        'https://cdn.example.com/img2.jpg',
        'https://cdn.example.com/img3.jpg',
      ],
    });

    // Make downloadAsync return the destUri so we can verify ordering via
    // the source URL passed as the first argument.
    mockDownloadAsync.mockImplementation((_url: string, destUri: string) => {
      return Promise.resolve({ status: 200, uri: destUri });
    });

    await shareRecall(recall, 2);

    expect(mockShareOpen).toHaveBeenCalledTimes(1);
    const shareCall = mockShareOpen.mock.calls[0][0];
    expect(shareCall.urls).toHaveLength(3);
    expect(shareCall.message).toBeUndefined();

    // Clipboard should have been called with the share text
    expect(mockClipboardSet).toHaveBeenCalledTimes(1);

    // The download order reflects the reordered array: img3 first, then img1, img2.
    // downloadAsync is called in the order of imagesToShare, so call[0] is img3.
    const firstDownloadUrl = mockDownloadAsync.mock.calls[0][0];
    expect(firstDownloadUrl).toBe('https://cdn.example.com/img3.jpg');
  });

  it('Test 3: DB returns error → falls back to in-memory images', async () => {
    mockOrderFn.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const recall = makeRecall({
      images: [
        'https://cdn.example.com/img1.jpg',
        'https://cdn.example.com/img2.jpg',
      ],
    });

    await shareRecall(recall, 0);

    // Should fall back to in-memory (2 images)
    expect(mockDownloadAsync).toHaveBeenCalledTimes(2);
    expect(mockShareOpen).toHaveBeenCalledTimes(1);
    const shareCall = mockShareOpen.mock.calls[0][0];
    expect(shareCall.urls).toHaveLength(2);
    expect(shareCall.message).toBeUndefined();

    // Clipboard should have been called with the share text
    expect(mockClipboardSet).toHaveBeenCalledTimes(1);
  });

  it('Test 4: DB empty + in-memory empty → Share.open NOT called with urls', async () => {
    mockOrderFn.mockResolvedValue({ data: [], error: null });

    const recall = makeRecall({ images: [] });

    await shareRecall(recall, 0);

    // No downloads attempted
    expect(mockDownloadAsync).not.toHaveBeenCalled();

    // Share.open may be called for text-only share (no urls property), or
    // it may not be called at all if the text-only path uses RNShare.
    // Either way, it must NOT be called with a urls array.
    if (mockShareOpen.mock.calls.length > 0) {
      const shareCall = mockShareOpen.mock.calls[0][0];
      expect(shareCall.urls).toBeUndefined();
      // Text-only path: message IS passed directly (no clipboard copy needed)
      expect(typeof shareCall.message).toBe('string');
    }

    // Clipboard must NOT be called on the text-only path
    expect(mockClipboardSet).not.toHaveBeenCalled();
  });
});
