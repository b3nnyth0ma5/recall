import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { debounce } from '@/utils/debounce';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  Pressable,
  Keyboard,
  Platform,
  ActivityIndicator,
  Share,
  Image,
  Alert,
  ActionSheetIOS,
  Animated as RNAnimated,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import RecallHeader from '@/components/RecallHeader';
import { SearchTopBar } from '@/components/SearchTopBar';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { useScrollToTop } from '@/contexts/ScrollToTopContext';
import { NoteCard } from '@/components/NoteCard';
import { useNotesContext } from '@/contexts/NotesContext';
import { IconSymbol } from '@/components/IconSymbol';
import { SearchHistory } from '@/types/Note';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SearchProgressIndicator } from '@/components/SearchProgressIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { MarkdownAnswer } from '@/components/MarkdownAnswer';
import Toast from 'react-native-toast-message';
// import { donateSearch } from 'recall-native'; // recall-native disabled
import { Share as ShareIcon } from 'lucide-react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { supabase, deleteSearchHistory, cleanupCloudflareCollage, saveSearchHistoryUploads, getSearchHistoryUploads, getRecollectionCategories, getCategoryRecollections } from '@/utils/supabase';
import { uploadImageToCloudflare } from '@/utils/cloudflareCDN';
import { PillsRow } from '@/components/PillsRow';
import type { PillItem } from '@/components/PillsRow';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { NoteEditorSlideUp } from '@/components/NoteEditorSlideUp';

// Pill widths vary so the skeleton row doesn't look like a uniform stripe
const PILL_SKELETON_WIDTHS = [80, 60, 110, 120, 70, 70, 100, 100, 80, 95];

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { 
    notes, 
    loading, 
    searchNotes, 
    getSearchHistory, 
    searchAnswer, 
    searchConfidence,
    locationInfo,
    personInfo,
    searchStage,
    searchLocationName,
    searchPersonNames,
    searchExtractedKeywords,
    searchTimeMs,
    searchTimings,
    getUrlMetadataForRecall,
    urlMetadataByRecallId,
  } = useNotesContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(false);
  // Initialize to true so the very first render shows skeletons, not the zero state
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(true);
  const [selectedPill, setSelectedPill] = useState<string | null>(null);
  const [userCategories, setUserCategories] = useState<PillItem[]>([]);
  const [categoryRecalls, setCategoryRecalls] = useState<import('@/types/Note').Note[]>([]);
  const [isLoadingCategoryRecalls, setIsLoadingCategoryRecalls] = useState(false);
  const [categoryPage, setCategoryPage] = useState(0);
  const [hasMoreCategoryRecalls, setHasMoreCategoryRecalls] = useState(false);
  const [isLoadingMoreCategoryRecalls, setIsLoadingMoreCategoryRecalls] = useState(false);
  const [categoryHasLocationRecalls, setCategoryHasLocationRecalls] = useState(false);
  const [slideUpNoteId, setSlideUpNoteId] = useState<string | null>(null);
  const [slideUpVisible, setSlideUpVisible] = useState(false);

  const CATEGORY_PAGE_SIZE = 10;
  // Tracks whether history has been loaded at least once — gates zero states
  const [hasLoadedHistoryOnce, setHasLoadedHistoryOnce] = useState(false);
  // Image attachment state
  const [attachedImages, setAttachedImages] = useState<{ uri: string; isOptimising: boolean; originalUri: string; locked?: boolean }[]>([]);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [showAttachFABs, setShowAttachFABs] = useState(false);

  const searchInputRef = useRef<TextInput>(null);
  const hasAutoSearchedRef = useRef(false);
  // Tracks previous query to avoid loops in the empty-query effect
  const prevQueryRef = useRef('');

  const shouldShowSearchTime = user?.email === 'benny_thomas21@yahoo.co.in';

  // Change 3: always filter to used_for_answer when hasSearched is true
  const filteredNotes = useMemo(() => {
    if (hasSearched) {
      return notes.filter(note => note.used_for_answer === true);
    }
    return notes;
  }, [notes, hasSearched]);

  const loadSearchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    const history = await getSearchHistory();
    setSearchHistory(history);
    setIsLoadingHistory(false);
    // Mark that we've loaded at least once — gates zero states
    setHasLoadedHistoryOnce(true);
  }, [getSearchHistory]);

  const loadCategories = useCallback(async () => {
    try {
      console.log('[SearchScreen] Loading recollection categories');
      const cats = await getRecollectionCategories();
      setUserCategories(cats.map(c => ({
        id: c.id,
        label: c.category_name,
        count: c.recollection_count,
      })));
    } catch (e) {
      console.error('[SearchScreen] Failed to load categories:', e);
    }
  }, []);

  useEffect(() => {
    loadSearchHistory();
    loadCategories();

    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
    };
  }, [loadSearchHistory, loadCategories]);

  // Change 2: when the user manually deletes text down to empty, reset search state
  useEffect(() => {
    const prev = prevQueryRef.current;
    prevQueryRef.current = searchQuery;

    // Only act when transitioning from non-empty to empty
    if (searchQuery.trim() === '' && prev.trim() !== '') {
      if (hasSearched || isSearching) {
        console.log('[SearchScreen] Query cleared manually — resetting search state');
        setHasSearched(false);
        setIsSearching(false);
        setIsAnswerExpanded(false);
        setIsProgressExpanded(true);
        setShowHistory(true);
        searchNotes('');
      }
    }
  }, [searchQuery, hasSearched, isSearching, searchNotes]);

  // Realtime subscription: update/delete/insert search_history rows live
  useEffect(() => {
    if (!user?.id) return;

    const channelName = `realtime:${user.id}:search_history:${Math.random().toString(36).slice(2, 8)}`;
    if (__DEV__) console.log('[SearchScreen] Setting up realtime subscription for search_history, channel:', channelName);

    const latestPayloadRef: { current: any } = { current: null };

    const handlePayload = (payload: any) => {
      if (__DEV__) console.log('[SearchScreen] Realtime search_history change:', payload.eventType);
      if (payload.eventType === 'UPDATE' && payload.new) {
        const updated = payload.new as SearchHistory;
        setSearchHistory((prev) =>
          prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
        );
      } else if (payload.eventType === 'DELETE' && payload.old) {
        const deletedId = (payload.old as { id?: string }).id;
        if (deletedId) {
          setSearchHistory((prev) => prev.filter((item) => item.id !== deletedId));
        }
      } else if (payload.eventType === 'INSERT' && payload.new) {
        const inserted = payload.new as SearchHistory;
        setSearchHistory((prev) => {
          // Avoid duplicates if already present (e.g. when our own upsert echoes back)
          if (prev.some((item) => item.id === inserted.id)) return prev;
          return [inserted, ...prev];
        });
      }
    };

    const debouncedFlush = debounce(() => {
      const payload = latestPayloadRef.current;
      latestPayloadRef.current = null;
      if (payload) handlePayload(payload);
    }, 300);

    const onChange = (p: any) => {
      latestPayloadRef.current = p;
      debouncedFlush();
    };

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'search_history',
          filter: `user_id=eq.${user.id}`,
        },
        onChange,
      )
      .subscribe();

    return () => {
      if (__DEV__) console.log('[SearchScreen] Cleaning up realtime subscription');
      debouncedFlush.cancel();
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const queryParam = params.q;
    const autoSearchParam = params.autoSearch;
    
    if (queryParam && typeof queryParam === 'string' && autoSearchParam === 'true' && !hasAutoSearchedRef.current) {
      const decodedQuery = decodeURIComponent(queryParam);
      
      setSearchQuery(decodedQuery);
      setShowHistory(false);
      setHasSearched(true);
      setIsAnswerExpanded(false);
      setIsSearching(true);
      setIsProgressExpanded(true);
      
      hasAutoSearchedRef.current = true;
      // donateSearch(decodedQuery); // recall-native disabled
      
      searchNotes(decodedQuery, true).finally(() => {
        setIsSearching(false);
      });
      
      setTimeout(() => {
        try {
          router.setParams({ autoSearch: undefined });
        } catch (error) {
          console.error('[SearchScreen] Error clearing autoSearch param:', error);
        }
      }, 0);
    }
  }, [params.q, params.autoSearch, searchNotes, router]);

  useEffect(() => {
    if (!params.q) {
      hasAutoSearchedRef.current = false;
    }
  }, [params.q]);

  useEffect(() => {
    if (!hasSearched && searchHistory.length > 0 && !isLoadingHistory) {
      setShowHistory(true);
    }
  }, [hasSearched, searchHistory, isLoadingHistory]);

  useEffect(() => {
    if (searchStage === 'complete' && isSearching === false && hasSearched) {
      setTimeout(() => {
        setIsProgressExpanded(false);
      }, 500);
    }
  }, [searchStage, isSearching, hasSearched]);

  const pickFromLibrary = useCallback(async () => {
    setShowAttachFABs(false);
    try {
      console.log('[SearchScreen] pickFromLibrary: requesting media library permissions');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photos');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets) {
        console.log('[SearchScreen] pickFromLibrary: selected', result.assets.length, 'image(s)');
        const placeholders = result.assets.map(asset => ({
          uri: asset.uri,
          isOptimising: true,
          originalUri: asset.uri,
        }));
        setAttachedImages(prev => [...prev, ...placeholders]);
        for (const asset of result.assets) {
          const { compressImageForUpload } = await import('@/utils/imageOptimization');
          const optimisedUri = await compressImageForUpload(asset.uri);
          setAttachedImages(prev => prev.map(img =>
            img.originalUri === asset.uri ? { ...img, uri: optimisedUri, isOptimising: false } : img
          ));
        }
      }
    } catch (e) {
      console.error('[SearchScreen] pickFromLibrary error:', e);
    }
  }, []);

  const takePhoto = useCallback(async () => {
    setShowAttachFABs(false);
    try {
      console.log('[SearchScreen] takePhoto: requesting camera permissions');
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your camera');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        console.log('[SearchScreen] takePhoto: photo captured');
        setAttachedImages(prev => [...prev, { uri: asset.uri, isOptimising: true, originalUri: asset.uri }]);
        const { compressImageForUpload } = await import('@/utils/imageOptimization');
        const optimisedUri = await compressImageForUpload(asset.uri);
        setAttachedImages(prev => prev.map(img =>
          img.originalUri === asset.uri ? { ...img, uri: optimisedUri, isOptimising: false } : img
        ));
      }
    } catch (e) {
      console.error('[SearchScreen] takePhoto error:', e);
    }
  }, []);

  const handleAttachPress = useCallback(() => {
    console.log('[SearchScreen] Attach button pressed, toggling FABs');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowAttachFABs(prev => !prev);
  }, []);

  const removeAttachedImage = useCallback((originalUri: string) => {
    console.log('[SearchScreen] Remove attached image:', originalUri);
    setAttachedImages(prev => prev.filter(img => img.originalUri !== originalUri));
  }, []);

  const uriToBase64 = useCallback(async (uri: string): Promise<string> => {
    const FileSystem = await import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return base64;
  }, []);

  const handleSearch = useCallback(async () => {
    console.log('User submitted search query:', searchQuery.trim() || '(empty)');
    Keyboard.dismiss();
    if (!searchQuery.trim()) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setShowHistory(false);
    setHasSearched(true);
    setIsAnswerExpanded(false);
    setIsSearching(true);
    setIsProgressExpanded(true);

    // Only use images that have finished optimising
    const readyImages = attachedImages.filter(img => !img.isOptimising);
    let searchUploads: { text: string; explanation: string; cdn_url: string | null }[] = [];

    if (readyImages.length > 0) {
      try {
        console.log('[SearchScreen] Processing', readyImages.length, 'attached image(s) via OCR + CDN upload (parallel)');
        setOcrProgress(`Analysing ${readyImages.length} image${readyImages.length > 1 ? 's' : ''}...`);

        const results = await Promise.all(
          readyImages.map(async (img, i) => {
            const base64 = await uriToBase64(img.uri);
            const fileName = `search-${Date.now()}-${i}.jpg`;
            console.log('[SearchScreen] Parallel OCR + CDN upload for image', i + 1, '| file:', fileName);

            const [ocrResponse, cdnUrl] = await Promise.all([
              supabase.functions.invoke('ocr-search-image', {
                body: { image_base64: base64, content_type: 'image/jpeg' },
              }),
              uploadImageToCloudflare(base64, fileName, 'image/jpeg'),
            ]);

            const { data: ocrResult, error: ocrError } = ocrResponse;
            if (ocrError) {
              console.error('[SearchScreen] OCR error for image', i + 1, ocrError);
            } else {
              console.log('[SearchScreen] OCR result for image', i + 1, '— text length:', (ocrResult?.ocr_text ?? '').length);
            }
            console.log('[SearchScreen] CDN upload result for image', i + 1, ':', cdnUrl ?? 'null');

            return {
              text: ocrResult?.ocr_text ?? '',
              explanation: ocrResult?.image_explanation ?? '',
              cdn_url: cdnUrl ?? null,
            };
          })
        );

        searchUploads = results;
        setOcrProgress('Searching your recalls...');

        // Save uploads to DB fire-and-forget
        if (user?.id && searchUploads.length > 0) {
          saveSearchHistoryUploads(user.id, searchQuery.trim(), searchUploads).catch(console.error);
        }
      } catch (e) {
        console.error('[SearchScreen] OCR processing error:', e);
      }
    }

    setOcrProgress(null);

    // Lock images so they stay visible during the search (no X button, no add-more)
    setAttachedImages(prev => prev.map(img => ({ ...img, locked: true })));

    searchNotes(searchQuery, true, searchUploads.length > 0 ? searchUploads : undefined).finally(() => {
      setIsSearching(false);
      setTimeout(() => {
        loadSearchHistory();
      }, 500);
    });
  }, [searchQuery, searchNotes, loadSearchHistory, attachedImages, uriToBase64, user?.id]);

  const handleHistoryItemPress = useCallback(async (item: SearchHistory) => {
    console.log('[SearchScreen] History item pressed:', item.search_text, '| has_uploads:', item.has_uploads);
    // Clear any stale images from a previous search immediately
    setAttachedImages([]);
    setSearchQuery(item.search_text);
    setShowHistory(false);
    setHasSearched(true);
    setIsAnswerExpanded(false);
    setIsSearching(true);
    setIsProgressExpanded(true);

    let searchUploads: { text: string; explanation: string }[] | undefined;

    // If this search had uploads, fetch and reuse them (no re-OCR needed)
    if (item.has_uploads && item.id) {
      try {
        console.log('[SearchScreen] Fetching stored uploads for history item:', item.id);
        const uploads = await getSearchHistoryUploads(item.id);
        if (uploads.length > 0) {
          searchUploads = uploads
            .filter(u => u.text !== null || u.explanation !== null)
            .map(u => ({ text: u.text ?? '', explanation: u.explanation ?? '' }));
          console.log('[SearchScreen] Reusing', searchUploads.length, 'stored upload(s) for re-run');

          // Populate thumbnail strip with CDN images (locked — no X button)
          const imageUploads = uploads.filter(u => u.cdn_url);
          if (imageUploads.length > 0) {
            console.log('[SearchScreen] Restoring', imageUploads.length, 'CDN image(s) to thumbnail strip');
            setAttachedImages(imageUploads.map(u => ({
              uri: u.cdn_url!,
              isOptimising: false,
              originalUri: u.cdn_url!,
              locked: true,
            })));
          }
        }
      } catch (e) {
        console.error('[SearchScreen] Failed to fetch search uploads:', e);
      }
    }

    searchNotes(item.search_text, true, searchUploads).finally(() => {
      setIsSearching(false);
    });
  }, [searchNotes]);

  const handleNotePress = useCallback((noteId: string, imageIndex?: number) => {
    console.log('[SearchScreen] Note card pressed, opening slide-up editor for noteId:', noteId, 'imageIndex:', imageIndex);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setSlideUpNoteId(noteId);
    setSlideUpVisible(true);
  }, []);

  const recallRefs = useRef<{ [key: string]: View | null }>({});
  const listRef = useRef<FlatList>(null);
  const { registerScrollToTop, registerSearchFocus } = useScrollToTop();

  useEffect(() => {
    const unregister = registerScrollToTop('search', () => {
      console.log('[SearchScreen] Scroll to top triggered');
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unregister;
  }, [registerScrollToTop]);

  useEffect(() => {
    const unregister = registerSearchFocus(() => {
      console.log('[SearchScreen] Search focus triggered — focusing input');
      searchInputRef.current?.focus();
    });
    return unregister;
  }, [registerSearchFocus]);

  const handleRecallLinkPress = useCallback((recallId: string, imageIndex?: number) => {
    console.log('[SearchScreen] Recall link pressed:', recallId, 'imageIndex:', imageIndex);
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    // With FlatList, scroll to the item by index
    const noteIndex = filteredNotes.findIndex(n => n.id === recallId);
    if (noteIndex !== -1 && listRef.current) {
      console.log('[SearchScreen] Scrolling to note index:', noteIndex);
      listRef.current.scrollToIndex({ index: noteIndex, animated: true, viewOffset: 80 });
    } else {
      console.log('[SearchScreen] Recall element not found in list');
    }
  }, [filteredNotes]);

  const recallReferences = useMemo(() => {
    if (!filteredNotes || filteredNotes.length === 0) {
      return [];
    }
    
    const references = filteredNotes.map((note) => {
      const hasImages = note.images && note.images.length > 0;
      
      return {
        recallId: note.id,
        imageIndex: hasImages ? 0 : undefined,
      };
    });
    
    return references;
  }, [filteredNotes]);

  const handleClear = useCallback(() => {
    console.log('[SearchScreen] handleClear pressed');
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAnswerExpanded(false);
    setIsSearching(false);
    setIsProgressExpanded(true);
    setAttachedImages([]);
    setOcrProgress(null);
    setShowAttachFABs(false);
    setSelectedPill(null);
    setCategoryRecalls([]);
    searchNotes('');
    // Refresh recent-searches list so the just-completed search is visible
    // immediately, regardless of realtime timing.
    getSearchHistory()
      .then((rows) => setSearchHistory(rows))
      .catch((err) => console.error('[handleClear] Failed to refresh search history:', err));
  }, [searchNotes, getSearchHistory]);

  const handleBack = useCallback(() => {
    console.log('[SearchScreen] handleBack pressed');
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAnswerExpanded(false);
    setIsSearching(false);
    setIsProgressExpanded(true);
    setSelectedPill(null);
    setCategoryRecalls([]);
    searchNotes('');
    // Refresh recent-searches list so the just-completed search is visible
    // immediately, regardless of realtime timing.
    getSearchHistory()
      .then((rows) => setSearchHistory(rows))
      .catch((err) => console.error('[handleBack] Failed to refresh search history:', err));

    setTimeout(() => {
      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)/(home)');
        }
      } catch (error) {
        console.error('[SearchScreen] Error navigating back:', error);
        try {
          router.replace('/(tabs)/(home)');
        } catch (fallbackError) {
          console.error('[SearchScreen] Error in fallback navigation:', fallbackError);
        }
      }
    }, 0);
  }, [searchNotes, router, getSearchHistory]);

  const toggleKeyboard = useCallback(() => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      searchInputRef.current?.focus();
    }
  }, [keyboardVisible]);

  const getAnswerPreview = useCallback((answer: string) => {
    const lines = answer.split('\n');
    if (lines.length <= 3) {
      return answer;
    }
    return lines.slice(0, 3).join('\n') + '...';
  }, []);

  const shouldShowAnswerToggle = useCallback((answer: string) => {
    const lines = answer.split('\n');
    return lines.length > 3;
  }, []);

  const handleShareAnswer = useCallback(async () => {
    if (!searchAnswer) {
      console.log('[SearchScreen] No answer to share');
      return;
    }

    try {
      console.log('[SearchScreen] Sharing answer text');
      
      // Trigger haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Clean the answer text by removing SOURCE_ references for sharing
      const cleanedAnswer = searchAnswer.replace(/\s*SOURCE_\d+/g, '');

      // Prepare share message
      const shareMessage = `Answer from Recall:\n\n${cleanedAnswer}\n\n---\nSearched phrase: "${searchQuery}"`;

      // Use native Share API
      const result = await Share.share(
        {
          message: shareMessage,
          title: 'Answer from Recall',
        },
        {
          dialogTitle: 'Share Answer',
          subject: 'Answer from Recall',
        }
      );

      if (result.action === Share.sharedAction) {
        console.log('[SearchScreen] Answer shared successfully');
        
        // Success haptic feedback
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        Toast.show({
          type: 'success',
          text1: 'Answer Shared',
          text2: 'The answer has been shared successfully',
          position: 'bottom',
          visibilityTime: 2000,
        });
      } else if (result.action === Share.dismissedAction) {
        console.log('[SearchScreen] Share dismissed');
      }
    } catch (error) {
      console.error('[SearchScreen] Error sharing answer:', error);
      
      // Error haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      Toast.show({
        type: 'error',
        text1: 'Share Failed',
        text2: 'Failed to share the answer. Please try again.',
        position: 'bottom',
        visibilityTime: 3000,
      });
    }
  }, [searchAnswer, searchQuery]);

  const renderHistoryRightActions = useCallback(
    (
      progress: RNAnimated.AnimatedInterpolation<number>,
      _dragX: RNAnimated.AnimatedInterpolation<number>,
      onDelete: () => void,
    ) => {
      const trans = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [80, 0],
        extrapolate: 'clamp',
      });
      return (
        <RNAnimated.View style={[styles.swipeDeleteContainer, { transform: [{ translateX: trans }] }]}>
          <RectButton style={styles.swipeDeleteButton} onPress={onDelete}>
            <IconSymbol name="trash" size={20} color="#fff" />
            <Text style={styles.swipeDeleteText}>Delete</Text>
          </RectButton>
        </RNAnimated.View>
      );
    },
    [],
  );

  const handleDeleteHistoryItem = useCallback(async (item: SearchHistory) => {
    if (!user?.id) return;
    console.log('[SearchScreen] Delete history item pressed:', item.search_text);
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      // Optimistically remove from UI
      setSearchHistory((prev) => prev.filter((h) => h.id !== item.id));
      // Persist delete
      await deleteSearchHistory(user.id, item.id);
      // Fire-and-forget Cloudflare cleanup of any saved collage
      cleanupCloudflareCollage(item.collage_cdn_url);
    } catch (e) {
      console.error('Failed to delete search history row:', e);
      // Reload to reconcile state on error
      try {
        const refreshed = await getSearchHistory();
        setSearchHistory(refreshed);
      } catch {}
    }
  }, [user?.id, getSearchHistory]);

  // Change 5: shimmering history skeletons using SkeletonLoader
  const renderHistorySkeletons = useMemo(() => {
    return (
      <Animated.View entering={FadeIn.duration(300)} style={styles.historyContainer}>
        <Text style={styles.historyTitle}>Recent</Text>
        {[...Array(3)].map((_, index) => (
          <View key={`history-skeleton-${index}`} style={styles.historyItemSkeleton}>
            <SkeletonLoader variant="wave" width={52} height={52} borderRadius={10} />
            <View style={styles.historySkeletonTextWrapper}>
              <SkeletonLoader variant="wave" width="100%" height={16} borderRadius={4} />
            </View>
            <SkeletonLoader variant="wave" width={16} height={16} borderRadius={8} />
          </View>
        ))}
      </Animated.View>
    );
  }, []);

  // Change 5: shimmering pills row skeleton
  const pillsRowSkeleton = useMemo(() => (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.pillsRowWrapper}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsSkeletonContent}
      >
        {PILL_SKELETON_WIDTHS.map((w, i) => (
          <SkeletonLoader
            key={`pill-skeleton-${i}`}
            variant="wave"
            width={w}
            height={36}
            borderRadius={20}
          />
        ))}
      </ScrollView>
    </Animated.View>
  ), []);

  const searchTips = useMemo(() => (
    <View style={styles.searchTipsContainer}>
      <Text style={styles.searchTipsTitle}>Try searching for:</Text>
      <View style={styles.searchTipsList}>
        <View style={styles.searchTipItem}>
          <IconSymbol 
            name="location.fill" 
            size={16} 
            color={colors.primary} 
          />
          <Text style={styles.searchTipText}>Places you&apos;ve been</Text>
        </View>
        <View style={styles.searchTipItem}>
          <IconSymbol 
            name="person.fill" 
            size={16} 
            color={colors.primary} 
          />
          <Text style={styles.searchTipText}>People you&apos;ve mentioned</Text>
        </View>
        <View style={styles.searchTipItem}>
          <IconSymbol 
            name="photo.fill" 
            size={16} 
            color={colors.primary} 
          />
          <Text style={styles.searchTipText}>Things in your photos</Text>
        </View>
      </View>
    </View>
  ), []);

  const featureList = useMemo(() => (
    <View style={styles.featureList}>
      <View style={styles.featureItem}>
        <IconSymbol 
          name="checkmark.circle.fill" 
          size={20} 
          color={colors.primary} 
        />
        <Text style={styles.featureText}>What&apos;s coming up next month?</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol 
          name="checkmark.circle.fill" 
          size={20} 
          color={colors.primary} 
        />
        <Text style={styles.featureText}>Restaurants in Collingwood that are on my wishlist </Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol 
          name="checkmark.circle.fill" 
          size={20} 
          color={colors.primary} 
        />
        <Text style={styles.featureText}>Any Recalls that mention Elly</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol 
          name="checkmark.circle.fill" 
          size={20} 
          color={colors.primary} 
        />
        <Text style={styles.featureText}>What wines did I have at Bistro Marigold?</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol 
          name="checkmark.circle.fill" 
          size={20} 
          color={colors.primary} 
        />
        <Text style={styles.featureText}>What vaccinations has Kiki had and when is it due?</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol 
          name="checkmark.circle.fill" 
          size={20} 
          color={colors.primary} 
        />
        <Text style={styles.featureText}>My cocktail recipes that use lime, ginger and agave</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol 
          name="checkmark.circle.fill" 
          size={20} 
          color={colors.primary} 
        />
        <Text style={styles.featureText}>Steak night specials on Thursdays</Text>
      </View>
    </View>
  ), []);

  const renderSearchResultItem = useCallback(({ item }: { item: import('@/types/Note').Note }) => {
    const recallRef = recallReferences.find(ref => ref.recallId === item.id);
    const imageIndex = recallRef?.imageIndex;
    const itemUrlMeta = getUrlMetadataForRecall(item.id);
    return (
      <View
        style={styles.noteWrapper}
        ref={(ref) => { recallRefs.current[item.id] = ref; }}
      >
        <View style={styles.badgeRow}>
          <View style={styles.answerSourceBadge}>
            <IconSymbol name="checkmark.seal.fill" size={14} color={colors.primary} />
            <Text style={styles.answerSourceText}>Used for answer</Text>
          </View>
        </View>
        <View style={styles.noteCardContainer}>
          <NoteCard
            note={item}
            urlMeta={itemUrlMeta}
            onCardPress={(id) => { setSlideUpNoteId(id); setSlideUpVisible(true); }}
            scrollToImageIndex={imageIndex}
            loading={false}
          />
        </View>
      </View>
    );
  }, [recallReferences, handleNotePress, getUrlMetadataForRecall]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => {
                console.log('[Search] Back chevron tapped');
                handleBack();
              }}
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
          headerTitle: () => <RecallHeader />,
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
        }}
      />

      <SearchTopBar
        ref={searchInputRef}
        mode="interactive"
        value={searchQuery}
        onChangeText={setSearchQuery}
        onSubmitEditing={handleSearch}
        onClear={handleClear}
        withSafeArea={false}
        showAttachButton={true}
        onAttachPress={handleAttachPress}
      />

      {/* FAB overlay for attachment options */}
      {showAttachFABs && (
        <>
          {/* Backdrop to dismiss */}
          <Pressable
            style={styles.fabBackdrop}
            onPress={() => {
              console.log('[SearchScreen] FAB backdrop pressed, closing FABs');
              setShowAttachFABs(false);
            }}
          />
          {/* FABs — positioned absolutely below the search bar, aligned to the right */}
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.fabContainer}
          >
            <Animated.View entering={SlideInDown.duration(200).delay(0)}>
              <Pressable
                style={styles.floatingActionButton}
                onPress={pickFromLibrary}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol name="photo.fill" size={28} color={colors.primary} />
              </Pressable>
            </Animated.View>
            <Animated.View entering={SlideInDown.duration(200).delay(50)}>
              <Pressable
                style={styles.floatingActionButton}
                onPress={takePhoto}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol name="camera.fill" size={28} color={colors.primary} />
              </Pressable>
            </Animated.View>
          </Animated.View>
        </>
      )}

      {/* Thumbnail strip — visible when images are attached */}
      {attachedImages.length > 0 && (
        <Animated.View entering={FadeIn.duration(200)} style={styles.attachmentStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.attachmentStripContent}
            keyboardShouldPersistTaps="handled"
          >
            {attachedImages.map((img) => (
              <View key={img.originalUri} style={styles.attachmentThumb}>
                <Image source={{ uri: img.uri }} style={styles.attachmentThumbImage} resizeMode="cover" />
                {img.isOptimising && (
                  <View style={styles.attachmentOptimising}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                {!img.locked && (
                  <Pressable
                    style={styles.attachmentRemoveBtn}
                    onPress={() => removeAttachedImage(img.originalUri)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <IconSymbol name="xmark.circle.fill" size={20} color="#fff" />
                  </Pressable>
                )}
              </View>
            ))}
            {/* Add more button — hidden once any image is locked */}
            {attachedImages.every(img => !img.locked) && (
              <Pressable style={styles.attachmentAddMore} onPress={handleAttachPress}>
                <IconSymbol name="plus" size={22} color={colors.textSecondary} />
              </Pressable>
            )}
          </ScrollView>
        </Animated.View>
      )}

      {/* FlatList: data = filteredNotes when searching, empty otherwise.
          All non-results content (history, empty states, answer, progress) lives in ListHeaderComponent. */}
      <FlatList
        ref={listRef}
        data={hasSearched && !isSearching && filteredNotes.length > 0 ? filteredNotes : []}
        keyExtractor={(item) => item.id}
        renderItem={renderSearchResultItem}
        extraData={urlMetadataByRecallId}
        ListHeaderComponent={
          <View style={styles.listHeaderContainer}>

            {/* History / zero states / search steps */}
            {showHistory && !selectedPill && isLoadingHistory ? (
              renderHistorySkeletons
            ) : showHistory && !selectedPill && searchHistory.length > 0 ? (
              <Animated.View entering={FadeIn.duration(600)} style={styles.historyContainer}>
                <Text style={styles.historyTitle}>Recent</Text>
                {searchHistory.map((item) => (
                  <Swipeable
                    key={item.id}
                    renderRightActions={(progress, dragX) =>
                      renderHistoryRightActions(progress, dragX, () => handleDeleteHistoryItem(item))
                    }
                    overshootRight={false}
                    friction={2}
                    rightThreshold={40}
                  >
                    <Pressable
                      style={styles.historyItem}
                      onPress={() => {
                        handleHistoryItemPress(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {item.collage_cdn_url ? (
                        <Image
                          source={{ uri: item.collage_cdn_url }}
                          style={styles.historyCollage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.historyClockWrapper}>
                          <IconSymbol name="clock" size={18} color={colors.textSecondary} />
                        </View>
                      )}
                      <Text style={styles.historyText} numberOfLines={1}>{item.search_text}</Text>
                      {item.has_uploads && (
                        <View style={styles.uploadsBadge}>
                          <IconSymbol name="photo" size={12} color={colors.primary} />
                        </View>
                      )}
                      <IconSymbol name="arrow.up.left" size={16} color={colors.textTertiary} />
                    </Pressable>
                  </Swipeable>
                ))}
              </Animated.View>
            ) : showHistory && !selectedPill && searchHistory.length === 0 && !isLoadingHistory && hasLoadedHistoryOnce ? (
              // Change 4: gate "No Search History" on hasLoadedHistoryOnce
              <Animated.View entering={FadeIn.duration(600)} style={styles.emptyHistoryContainer}>
                <View style={styles.emptyHistoryIconContainer}>
                  <IconSymbol name="clock" size={48} color={colors.textTertiary} />
                </View>
                <Text style={styles.emptyHistoryTitle}>No Search History</Text>
                <Text style={styles.emptyHistoryMessage}>
                  Your recent searches will appear here
                </Text>
                {searchTips}
              </Animated.View>
            ) : !hasSearched && !selectedPill && hasLoadedHistoryOnce ? (
              // Change 4: gate "Smart Searching" hero on hasLoadedHistoryOnce
              <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
                <IconSymbol name="photo.on.rectangle" size={80} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>Smart Searching</Text>
                <Text style={styles.emptyText}>
                  Search your Recalls like you&apos;re talking to a friend
                </Text>
                {featureList}
              </Animated.View>
            ) : hasSearched ? (
              // Change 1: Search Steps — Animated.View with FadeIn for the crossfade swap
              <Animated.View entering={FadeIn.duration(300)} style={styles.notesContainer}>
                {ocrProgress && (
                  <Animated.View entering={FadeIn.duration(200)} style={styles.ocrProgressContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.ocrProgressText}>{ocrProgress}</Text>
                  </Animated.View>
                )}
                <SearchProgressIndicator
                  stage={searchStage}
                  locationName={searchLocationName}
                  personNames={searchPersonNames}
                  extractedKeywords={searchExtractedKeywords}
                  isExpanded={isProgressExpanded}
                  onToggle={() => setIsProgressExpanded(!isProgressExpanded)}
                  locationInfo={locationInfo}
                  searchTimings={searchTimings}
                  shouldShowTimings={shouldShowSearchTime}
                />

                {isSearching ? (
                  <View style={styles.searchingPlaceholder} />
                ) : (
                  <React.Fragment>
                    {filteredNotes.length === 0 && !searchAnswer && searchStage === 'complete' ? (
                      <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
                        <IconSymbol name="doc.text.magnifyingglass" size={80} color={colors.textTertiary} />
                        <Text style={styles.emptyTitle}>No Results Found</Text>
                        <Text style={styles.emptyText}>
                          {locationInfo
                            ? `No recalls found within ${locationInfo.proximity}km of ${locationInfo.resolvedPlace}`
                            : personInfo && personInfo.matchedNames.length > 0
                            ? `No recalls found for ${personInfo.matchedNames.join(', ')}`
                            : 'Try a different search term or add more details'
                          }
                        </Text>
                      </Animated.View>
                    ) : (
                      <React.Fragment>
                        {searchAnswer && searchConfidence !== undefined && (
                          <Animated.View entering={FadeIn.duration(600)} style={styles.answerContainer}>
                            <View style={styles.answerHeader}>
                              <View style={styles.answerHeaderLeft}>
                                <IconSymbol name="lightbulb.fill" size={20} color={colors.primary} />
                                <Text style={styles.answerTitle}>Answer</Text>
                              </View>
                              <View style={styles.answerHeaderRight}>
                                <View style={styles.confidenceBadge}>
                                  <IconSymbol name="checkmark.seal.fill" size={14} color={colors.primary} />
                                  <Text style={styles.confidenceText}>{searchConfidence}% confident</Text>
                                </View>
                                <Pressable
                                  onPress={handleShareAnswer}
                                  style={styles.shareAnswerButton}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <ShareIcon size={18} color={colors.primary} strokeWidth={2.2} />
                                </Pressable>
                              </View>
                            </View>
                            <View style={styles.answerContent}>
                              <MarkdownAnswer
                                content={isAnswerExpanded ? searchAnswer : getAnswerPreview(searchAnswer)}
                                recallReferences={recallReferences}
                                onRecallPress={handleRecallLinkPress}
                              />
                            </View>
                            {shouldShowAnswerToggle(searchAnswer) && (
                              <Pressable
                                onPress={() => setIsAnswerExpanded(!isAnswerExpanded)}
                                style={styles.answerToggleContainer}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              >
                                <Text style={styles.answerToggleText}>
                                  {isAnswerExpanded ? 'Show less' : 'Show more'}
                                </Text>
                              </Pressable>
                            )}
                          </Animated.View>
                        )}
                      </React.Fragment>
                    )}

                  </React.Fragment>
                )}
              </Animated.View>
            ) : null}
            {/* List/map toggle — shown whenever a search has completed */}
            {hasSearched && !isSearching && (
              <View style={styles.resultsAndToggleRow}>
                {filteredNotes.length > 0 ? (
                  <Text style={styles.resultsText}>
                    {filteredNotes.length} {filteredNotes.length === 1 ? 'result' : 'results'} used for answer
                    {locationInfo && ` near ${locationInfo.resolvedPlace}`}
                    {personInfo && personInfo.matchedNames.length > 0 && ` for ${personInfo.matchedNames.join(', ')}`}
                  </Text>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <Pressable
                  style={[styles.mapButton, filteredNotes.length === 0 && styles.mapButtonDisabled]}
                  onPress={() => {
                    console.log('[SearchScreen] Map button pressed, filteredNotes:', filteredNotes.length);
                    if (filteredNotes.length > 0) {
                      const ids = filteredNotes.map(n => n.id).join(',');
                      router.push(`/map-view?hasSearch=true&ids=${ids}`);
                    } else {
                      router.push('/map-view');
                    }
                  }}
                  disabled={filteredNotes.length === 0}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <IconSymbol name="map" size={16} color={filteredNotes.length === 0 ? colors.textSecondary : '#fff'} />
                  <Text style={[styles.mapButtonText, filteredNotes.length === 0 && styles.mapButtonTextDisabled]}>Map</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        windowSize={10}
        maxToRenderPerBatch={6}
        initialNumToRender={8}
        removeClippedSubviews
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollToIndexFailed={() => {}}
      />


      <NoteEditorSlideUp
        noteId={slideUpNoteId ?? undefined}
        visible={slideUpVisible}
        onClose={() => setSlideUpVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 8 * 1.15,
    marginHorizontal: 8,
  },
  searchIconButton: {
    padding: 4 * 1.15,
  },
  searchIconContainer: {
    backgroundColor: colors.primary,
    width: 32 * 1.15,
    height: 32 * 1.15,
    borderRadius: 16 * 1.15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconDisabled: {
    opacity: 0.4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 104,
  },
  listHeaderContainer: {
    width: '100%',
  },
  pillsRowWrapper: {
    marginHorizontal: -16,
    marginTop: 0,
    marginBottom: 8,
  },
  pillsSkeletonContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyContainer: {
    width: '100%',
  },
  historyTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 16 * 1.15,
    borderRadius: 12,
    marginBottom: 8,
    minHeight: 72,
  },
  historyCollage: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  historyClockWrapper: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDark,
  },
  historyText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    marginLeft: 0,
  },
  historyItemSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    padding: 16 * 1.15,
    borderRadius: 12,
    marginBottom: 8,
    minHeight: 56 * 1.1,
  },
  historySkeletonTextWrapper: {
    flex: 1,
  },
  historyIconPlaceholder: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.cardDark,
  },
  historyTextPlaceholder: {
    flex: 1,
    height: 16,
    borderRadius: 4,
    backgroundColor: colors.cardDark,
  },
  historyArrowPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.cardDark,
  },
  emptyHistoryContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyHistoryIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${colors.textTertiary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyHistoryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyHistoryMessage: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  searchTipsContainer: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchTipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  searchTipsList: {
    gap: 12,
  },
  searchTipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchTipText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  featureList: {
    gap: 12,
    alignItems: 'flex-start',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 15,
    color: colors.text,
  },
  notesContainer: {
    width: '100%',
  },
  answerContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16 * 1.15,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    boxShadow: '0px 4px 12px rgba(255, 107, 122, 0.15)',
    elevation: 3,
  },
  answerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  answerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  answerHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  answerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
    paddingVertical: 4 * 1.15,
    paddingHorizontal: 10 * 1.15,
    borderRadius: 12,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  answerText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  answerContent: {
    width: '100%',
  },
  answerToggleContainer: {
    alignSelf: 'flex-end',
    paddingVertical: 4 * 1.15,
    paddingHorizontal: 8 * 1.15,
    marginTop: 8,
  },
  answerToggleText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  shareAnswerButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsAndToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  resultsText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  noteWrapper: {
    marginBottom: 16,
    position: 'relative',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: -12,
    marginLeft: 12,
    zIndex: 100,
    elevation: 100,
  },
  answerSourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
    paddingVertical: 6 * 1.15,
    paddingHorizontal: 12 * 1.15,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    zIndex: 300,
    elevation: 200,
  },
  answerSourceText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  noteCardContainer: {
    position: 'relative',
    zIndex: 1,
  },
  searchingPlaceholder: {
    minHeight: 100,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
    flexShrink: 0,
  },
  mapButtonDisabled: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    opacity: 0.5,
  },
  mapButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  mapButtonTextDisabled: {
    color: colors.textSecondary,
  },
  swipeDeleteContainer: {
    width: 80,
    marginBottom: 8,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  swipeDeleteButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 4,
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  attachmentStrip: {
    backgroundColor: colors.background,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  attachmentStripContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  attachmentThumbImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  attachmentOptimising: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  attachmentRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  attachmentAddMore: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  fabBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 998,
  },
  fabContainer: {
    position: 'absolute',
    top: 72,
    right: 24,
    flexDirection: 'column',
    gap: 12,
    zIndex: 999,
    elevation: 999,
  },
  floatingActionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    boxShadow: '0px 4px 12px rgba(255, 107, 122, 0.4)',
    elevation: 8,
  },
  ocrProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ocrProgressText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  uploadsBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  categoryLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
