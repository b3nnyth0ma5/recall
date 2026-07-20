import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { extractEntitiesOnDevice, checkFoundationModelsAvailability, generateAnswerOnDevice } from '@/modules/recall-native';
import type { ExtractedEntities } from '@/modules/recall-native';
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
  Image,
  Alert,
  ActionSheetIOS,
  Animated as RNAnimated,
  ScrollView,
} from 'react-native';
import RNShare from 'react-native-share';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
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
import Animated, { FadeIn, FadeOut, SlideInDown, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay } from 'react-native-reanimated';
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


// Pill widths vary so the skeleton row doesn't look like a uniform stripe
const PILL_SKELETON_WIDTHS = [80, 60, 110, 120, 70, 70, 100, 100, 80, 95];

const THINKING_PHRASES = [
  "Digging through your memories...",
  "Almost there, hang tight...",
  "Your recalls are being consulted...",
  "Sifting through everything you've saved...",
  "Connecting the dots...",
  "Rummaging around in there...",
  "Give it a sec...",
  "Thinking really hard right now...",
  "Searching the depths of your recall vault...",
  "One moment, brain is loading...",
  "Flipping through your mental Rolodex...",
  "Asking your past self for help...",
  "Untangling some thoughts...",
  "This one's got layers...",
  "Consulting the archives...",
  "Your memories are being cross-referenced...",
  "Piecing it together...",
  "Hang on, almost cracked it...",
  "Doing some serious recall archaeology...",
  "Dusting off the old memory banks...",
  "Searching every nook and cranny...",
  "Your recalls are putting their heads together...",
  "Wading through the good stuff...",
  "Patience — this is worth it...",
  "Chasing down a lead...",
  "Sorting through the pile...",
  "Recall is on the case...",
  "Pulling threads...",
  "Warming up the search engine...",
  "Scanning your saved moments...",
  "Hunting for the good bits...",
  "Combing through your history...",
  "Recall is thinking...",
  "Putting the pieces together...",
  "Checking every corner of your vault...",
  "Your past self saved something useful, probably...",
  "Narrowing it down...",
  "Zooming in...",
  "Cross-checking your recalls...",
  "Doing the detective work...",
  "Recall is on it, promise...",
  "Searching with intent...",
  "Turning over every stone...",
  "Matching patterns...",
  "Recall is giving this its full attention...",
  "Scouring the timeline...",
  "Tracing the memory trail...",
  "Recall is deep in thought...",
  "Connecting memories across time...",
  "Assembling the answer...",
  "Your recalls are talking to each other...",
  "Recall is doing its thing...",
  "Hang tight, this is a good one...",
  "Recall is reading between the lines...",
  "Searching smarter, not harder...",
  "Recall is on a mission...",
  "Pulling from the vault...",
  "Recall is piecing it all together...",
  "Recall is in detective mode...",
  "Recall is connecting the dots...",
  "Recall is on the trail...",
  "Recall is working overtime...",
  "Recall is doing a deep dive...",
  "Recall is leaving no stone unturned...",
  "Recall is on the hunt...",
  "Recall is following the breadcrumbs...",
  "Recall is reading your mind (almost)...",
  "Recall is consulting the memory oracle...",
  "Recall is running the numbers...",
  "Recall is checking its notes...",
  "Recall is flipping through the pages...",
  "Recall is scanning the horizon...",
  "Recall is zooming in on the details...",
  "Recall is putting on its thinking cap...",
  "Recall is doing the heavy lifting...",
  "Recall is on the case, detective style...",
  "Recall is searching high and low...",
  "Recall is following the thread...",
  "Recall is making connections...",
  "Recall is on a roll...",
  "Recall is getting warmer...",
  "Recall is almost there...",
  "Recall is closing in...",
  "Recall is on the verge of a breakthrough...",
  "Recall is putting it all together...",
  "Recall is in the zone...",
  "Recall is firing on all cylinders...",
  "Recall is doing its best work...",
  "Recall is on the right track...",
  "Recall is getting to the bottom of it...",
  "Recall is working its magic...",
  "Recall is on the scent...",
  "Recall is following the clues...",
  "Recall is piecing the puzzle together...",
  "Recall is on the lookout...",
  "Recall is scanning the archives...",
  "Recall is doing a thorough search...",
  "Recall is leaving no recall unturned...",
  "Recall is on the verge of an answer...",
  "Recall is almost ready...",
];

function TypingDots() {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    const animate = (sv: any, delay: number) => {
      sv.value = withDelay(delay, withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
        ),
        -1,
        false,
      ));
    };
    animate(dot1, 0);
    animate(dot2, 160);
    animate(dot3, 320);
  }, []);

  const s1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const s3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
      <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary }, s1]} />
      <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary }, s2]} />
      <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textSecondary }, s3]} />
    </View>
  );
}

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
    patchNotesForOnDeviceAnswer,
    updateAiAnswerTiming,
  } = useNotesContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(true);
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
  const [onDeviceAnswerMs, setOnDeviceAnswerMs] = useState<number | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [isStreamingComplete, setIsStreamingComplete] = useState(false);
  const [showThinkingText, setShowThinkingText] = useState(false);

  // Reads the toggle directly from AsyncStorage at call time to avoid the
  // race condition where fastSearchMode state hasn't resolved yet.
  const tryOnDeviceExtraction = useCallback(async (query: string): Promise<ExtractedEntities | null> => {
    if (Platform.OS !== 'ios') return null;
    try {
      const val = await AsyncStorage.getItem('search_ner_ondevice');
      if (val !== 'true') return null;
      const entities = await extractEntitiesOnDevice(query);
      if (entities) {
        console.log('[Search] On-device entity extraction succeeded:', entities);
      } else {
        console.warn('[Search] On-device extraction returned null (native module missing — new build required)');
      }
      return entities;
    } catch (e) {
      console.warn('[Search] On-device extraction failed, falling back to cloud:', e);
      return null;
    }
  }, []);

  const checkAndNotifyFoundationModels = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'ios') return false;
    const val = await AsyncStorage.getItem('search_answer_ondevice');
    if (val !== 'true') return false;

    console.log('[Search] Checking Foundation Models availability');
    const status = await checkFoundationModelsAvailability();
    console.log('[Search] Foundation Models status:', status);

    if (status === 'available') return true;

    if (status === 'apple_intelligence_disabled') {
      const alreadyShown = await AsyncStorage.getItem('apple_intelligence_alert_shown');
      if (!alreadyShown) {
        AsyncStorage.setItem('apple_intelligence_alert_shown', 'true');
        Alert.alert(
          'Apple Intelligence Not Enabled',
          'Your device supports on-device AI answer generation, but Apple Intelligence is currently disabled.\n\nTo enable it:\n1. Open the Settings app\n2. Tap "Apple Intelligence & Siri"\n3. Turn on "Apple Intelligence"\n4. Wait for the model to download\n\nFor now, your search will use cloud AI for answer generation.',
          [{ text: 'OK' }]
        );
      }
    }

    return false;
  }, []);

  const streamCloudAnswer = useCallback(async (
    query: string,
    contextForAnswer: string,
    uploadedImagesContext: string,
    preExtractedEntities: import('@/modules/recall-native').ExtractedEntities | null,
    searchResults: { id: string; sourceNumber: number }[],
  ): Promise<void> => {
    console.log('[Search] streamCloudAnswer: starting XHR stream for query:', query.trim());
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[Search] streamCloudAnswer: no session, aborting');
      return;
    }

    setStreamingAnswer('');
    streamingAnswerRef.current = '';
    setIsStreamingComplete(false);

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('POST', 'https://cesmsdnblkdjkskmiqib.supabase.co/functions/v1/search-recalls-v3', true);
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlc21zZG5ibGtkamtza21pcWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MDc1NzcsImV4cCI6MjA3ODA4MzU3N30.AlULDdolfFFcqfrjXY4XBC_fzD_Gz-bx2FCyqjx4nA4');

      let processedLength = 0;
      let tokenBatch = '';
      let batchTimer: ReturnType<typeof setTimeout> | null = null;
      let firstTokenFlushed = false;
      let resolved = false;
      let doneReceived = false;

      const flushBatch = () => {
        if (tokenBatch) {
          const batch = tokenBatch;
          tokenBatch = '';
          streamingAnswerRef.current = streamingAnswerRef.current + batch;
          if (mountedRef.current) setStreamingAnswer(prev => prev + batch);
          // Collapse search steps on first token
          if (!firstTokenFlushed) {
            firstTokenFlushed = true;
            if (mountedRef.current) setIsProgressExpanded(false);
          }
        }
        batchTimer = null;
      };

      const cleanup = () => {
        if (batchTimer) clearTimeout(batchTimer);
        flushBatch();
        xhrRef.current = null;
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      const processDoneLine = (data: string, caller: string) => {
        if (batchTimer) clearTimeout(batchTimer);
        flushBatch();
        doneReceived = true;
        try {
          const raw = data.slice(7).replace(/\\n/g, '\n'); // strip '[DONE] ' then unescape newlines
          const payload = JSON.parse(raw);
          console.log('[Search] streamCloudAnswer: DONE received (' + caller + '), confidence:', payload.confidence, 'sources:', payload.sources, 'payload.answer length:', (payload.answer ?? '').length, 'streamingAnswerRef length:', streamingAnswerRef.current.length);
          // Use streamingAnswerRef as authoritative answer when payload.answer is empty
          const effectiveAnswer = (payload.answer && (payload.answer as string).trim().length > 0)
            ? (payload.answer as string)
            : streamingAnswerRef.current;
          const effectiveConfidence = ((payload.confidence as number) > 0)
            ? (payload.confidence as number)
            : (effectiveAnswer.trim().length > 0 ? 50 : 0);
          console.log('[Search] streamCloudAnswer: effectiveAnswer length:', effectiveAnswer.length, 'effectiveConfidence:', effectiveConfidence);
          if (mountedRef.current) {
            patchNotesForOnDeviceAnswer(
              payload.sources ?? [],
              searchResults,
              effectiveAnswer,
              effectiveConfidence,
            );
          }
        } catch (e) {
          console.error('[Search] streamCloudAnswer: failed to parse DONE payload (' + caller + ')', e);
          // Fallback: use streamed text to patch notes even if DONE payload was malformed
          if (mountedRef.current) {
            patchNotesForOnDeviceAnswer([], searchResults, streamingAnswerRef.current, 50);
            setIsStreamingComplete(true);
          }
          return;
        }
        if (mountedRef.current) setIsStreamingComplete(true);
      };

      xhr.onprogress = () => {
        const newText = xhr.responseText.slice(processedLength);
        processedLength = xhr.responseText.length;
        if (!newText) return;

        const lines = newText.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);

          if (data.startsWith('[DONE]')) {
            processDoneLine(data, 'onprogress');
            cleanup();
            return;
          }

          // Accumulate token into batch (unescape newlines escaped by the edge function)
          tokenBatch += data.replace(/\\n/g, '\n');
          if (!batchTimer) {
            batchTimer = setTimeout(flushBatch, 120);
          }
        }
      };

      xhr.onerror = () => {
        console.error('[Search] streamCloudAnswer: XHR error');
        if (mountedRef.current) {
          patchNotesForOnDeviceAnswer(
            [],
            searchResults,
            streamingAnswerRef.current,
            streamingAnswerRef.current.trim().length > 0 ? 50 : 0,
          );
          setIsStreamingComplete(true);
        }
        cleanup();
      };

      xhr.ontimeout = () => {
        console.error('[Search] streamCloudAnswer: XHR timeout');
        if (mountedRef.current) {
          patchNotesForOnDeviceAnswer(
            [],
            searchResults,
            streamingAnswerRef.current,
            streamingAnswerRef.current.trim().length > 0 ? 50 : 0,
          );
          setIsStreamingComplete(true);
        }
        cleanup();
      };

      xhr.onload = () => {
        // Process any remaining responseText not yet handled by onprogress
        const newText = xhr.responseText.slice(processedLength);
        if (newText) {
          const lines = newText.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data.startsWith('[DONE]')) {
              processDoneLine(data, 'onload');
            }
          }
        }
        // If no [DONE] SSE line was found, the response is plain JSON (no-matches path).
        // Mark streaming complete so the answer card exits the dots state.
        if (!doneReceived) {
          console.log('[Search] streamCloudAnswer: no SSE [DONE] received — using streamed text to patch notes');
          if (mountedRef.current) {
            patchNotesForOnDeviceAnswer(
              [],
              searchResults,
              streamingAnswerRef.current,
              streamingAnswerRef.current.trim().length > 0 ? 50 : 0,
            );
            setIsStreamingComplete(true);
          }
        }
        cleanup();
      };

      xhr.timeout = 60000; // 60s timeout

      xhr.send(JSON.stringify({
        query: query.trim(),
        generate_answer_only: true,
        context_for_answer: contextForAnswer,
        uploaded_images_context: uploadedImagesContext,
        ...(preExtractedEntities ? { pre_extracted_entities: preExtractedEntities } : {}),
      }));
    });
    xhrRef.current = null;
  }, [patchNotesForOnDeviceAnswer]);

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
  const mountedRef = useRef(true);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const streamingAnswerRef = useRef('');
  const thinkingTextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingPhraseRef = useRef<string>('');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
      if (thinkingTextTimerRef.current) {
        clearTimeout(thinkingTextTimerRef.current);
        thinkingTextTimerRef.current = null;
      }
    };
  }, []);

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
      setIsAnswerExpanded(true);
      setIsSearching(true);
      setIsProgressExpanded(true);
      
      hasAutoSearchedRef.current = true;
      // donateSearch(decodedQuery); // recall-native disabled
      
      (async () => {
        try {
          setStreamingAnswer('');
          setIsStreamingComplete(false);
          const preExtractedEntities = await tryOnDeviceExtraction(decodedQuery);
          const canUseOnDeviceAnswer = await checkAndNotifyFoundationModels();
          const searchResult = await searchNotes(decodedQuery, true, undefined, preExtractedEntities);
          if (searchResult !== undefined) {
            const contextForAnswer = searchResult.context_for_answer ?? '';
            if (canUseOnDeviceAnswer) {
              const MAX_ONDEVICE_CONTEXT_CHARS = 12_000;
              const safeContext = contextForAnswer.slice(0, MAX_ONDEVICE_CONTEXT_CHARS);
              console.log('[Search] autoSearch: context capped to', safeContext.length, 'chars (original:', contextForAnswer.length, ')');
              const onDeviceResult = await generateAnswerOnDevice(
                safeContext,
                decodedQuery,
                searchResult.uploaded_images_context ?? '',
              );
              if (onDeviceResult && onDeviceResult.answer) {
                setOnDeviceAnswerMs(onDeviceResult.durationMs);
                updateAiAnswerTiming(onDeviceResult.durationMs);
                patchNotesForOnDeviceAnswer(
                  onDeviceResult.sources,
                  searchResult.results ?? [],
                  onDeviceResult.answer,
                  onDeviceResult.confidence,
                );
                setIsStreamingComplete(true);
              } else {
                console.log('[Search] autoSearch: on-device answer returned null, falling back to streaming cloud');
                await streamCloudAnswer(
                  decodedQuery,
                  contextForAnswer,
                  searchResult.uploaded_images_context ?? '',
                  preExtractedEntities,
                  searchResult.results ?? [],
                );
              }
            } else {
              console.log('[Search] autoSearch: cloud-only path, streaming answer');
              await streamCloudAnswer(
                decodedQuery,
                contextForAnswer,
                searchResult.uploaded_images_context ?? '',
                preExtractedEntities,
                searchResult.results ?? [],
              );
            }
          }
        } catch (e) {
          console.error('[Search] autoSearch error:', e);
        } finally {
          if (mountedRef.current) setIsSearching(false);
        }
      })();
      
      setTimeout(() => {
        try {
          router.setParams({ autoSearch: undefined });
        } catch (error) {
          console.error('[SearchScreen] Error clearing autoSearch param:', error);
        }
      }, 0);
    }
  }, [params.q, params.autoSearch, searchNotes, router, tryOnDeviceExtraction, streamCloudAnswer, checkAndNotifyFoundationModels, patchNotesForOnDeviceAnswer, updateAiAnswerTiming]);

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

  useEffect(() => {
    if (isSearching && !streamingAnswer) {
      thinkingTextTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          thinkingPhraseRef.current = THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)];
          setShowThinkingText(true);
        }
      }, 3000);
      return () => {
        if (thinkingTextTimerRef.current) {
          clearTimeout(thinkingTextTimerRef.current);
          thinkingTextTimerRef.current = null;
        }
      };
    } else {
      setShowThinkingText(false);
    }
  }, [isSearching, streamingAnswer]);

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
    setIsAnswerExpanded(true);
    setIsSearching(true);
    setIsProgressExpanded(true);
    setStreamingAnswer('');
    streamingAnswerRef.current = '';
    setIsStreamingComplete(false);
    setShowThinkingText(false);

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

    const preExtractedEntities = await tryOnDeviceExtraction(searchQuery);
    const canUseOnDeviceAnswer = await checkAndNotifyFoundationModels();
    console.log('[Search] handleSearch: canUseOnDeviceAnswer:', canUseOnDeviceAnswer);

    setOnDeviceAnswerMs(null);

    try {
      const searchResult = await searchNotes(searchQuery, true, searchUploads.length > 0 ? searchUploads : undefined, preExtractedEntities);

      if (searchResult !== undefined) {
        const contextForAnswer = searchResult.context_for_answer ?? '';
        if (canUseOnDeviceAnswer) {
          console.log('[Search] handleSearch: attempting on-device answer generation');
          const MAX_ONDEVICE_CONTEXT_CHARS = 12_000;
          const safeContext = contextForAnswer.slice(0, MAX_ONDEVICE_CONTEXT_CHARS);
          console.log('[Search] handleSearch: context capped to', safeContext.length, 'chars (original:', contextForAnswer.length, ')');
          const onDeviceResult = await generateAnswerOnDevice(
            safeContext,
            searchQuery,
            searchResult.uploaded_images_context ?? '',
          );
          if (onDeviceResult && onDeviceResult.answer) {
            console.log('[Search] handleSearch: on-device answer generated, durationMs:', onDeviceResult.durationMs);
            setOnDeviceAnswerMs(onDeviceResult.durationMs);
            updateAiAnswerTiming(onDeviceResult.durationMs);
            patchNotesForOnDeviceAnswer(
              onDeviceResult.sources,
              searchResult.results ?? [],
              onDeviceResult.answer,
              onDeviceResult.confidence,
            );
            setIsStreamingComplete(true);
          } else {
            console.log('[Search] handleSearch: on-device answer returned null, falling back to streaming cloud');
            await streamCloudAnswer(
              searchQuery,
              contextForAnswer,
              searchResult.uploaded_images_context ?? '',
              preExtractedEntities,
              searchResult.results ?? [],
            );
          }
        } else {
          console.log('[Search] handleSearch: cloud-only path, streaming answer');
          await streamCloudAnswer(
            searchQuery,
            contextForAnswer,
            searchResult.uploaded_images_context ?? '',
            preExtractedEntities,
            searchResult.results ?? [],
          );
        }
      }

      setTimeout(() => {
        loadSearchHistory();
      }, 500);
    } catch (e) {
      console.error('[SearchScreen] handleSearch error:', e);
    } finally {
      if (mountedRef.current) setIsSearching(false);
    }
  }, [searchQuery, searchNotes, loadSearchHistory, attachedImages, uriToBase64, user?.id, tryOnDeviceExtraction, checkAndNotifyFoundationModels, patchNotesForOnDeviceAnswer, updateAiAnswerTiming, streamCloudAnswer]);

  const handleHistoryItemPress = useCallback(async (item: SearchHistory) => {
    console.log('[SearchScreen] History item pressed:', item.search_text, '| has_uploads:', item.has_uploads);
    // Clear any stale images from a previous search immediately
    setAttachedImages([]);
    setSearchQuery(item.search_text);
    setShowHistory(false);
    setHasSearched(true);
    setIsAnswerExpanded(true);
    setIsSearching(true);
    setIsProgressExpanded(true);
    setStreamingAnswer('');
    streamingAnswerRef.current = '';
    setIsStreamingComplete(false);
    setShowThinkingText(false);

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

    const preExtractedEntities = await tryOnDeviceExtraction(item.search_text);
    const canUseOnDeviceAnswer = await checkAndNotifyFoundationModels();
    console.log('[Search] handleHistoryItemPress: canUseOnDeviceAnswer:', canUseOnDeviceAnswer);

    setOnDeviceAnswerMs(null);

    try {
      setStreamingAnswer('');
      streamingAnswerRef.current = '';
      setIsStreamingComplete(false);
      const searchResult = await searchNotes(item.search_text, true, searchUploads, preExtractedEntities);

      if (searchResult !== undefined) {
        const contextForAnswer = searchResult.context_for_answer ?? '';
        if (canUseOnDeviceAnswer) {
          console.log('[Search] handleHistoryItemPress: attempting on-device answer generation');
          const MAX_ONDEVICE_CONTEXT_CHARS = 12_000;
          const safeContext = contextForAnswer.slice(0, MAX_ONDEVICE_CONTEXT_CHARS);
          console.log('[Search] handleHistoryItemPress: context capped to', safeContext.length, 'chars (original:', contextForAnswer.length, ')');
          const onDeviceResult = await generateAnswerOnDevice(
            safeContext,
            item.search_text,
            searchResult.uploaded_images_context ?? '',
          );
          if (onDeviceResult && onDeviceResult.answer) {
            console.log('[Search] handleHistoryItemPress: on-device answer generated, durationMs:', onDeviceResult.durationMs);
            setOnDeviceAnswerMs(onDeviceResult.durationMs);
            updateAiAnswerTiming(onDeviceResult.durationMs);
            patchNotesForOnDeviceAnswer(
              onDeviceResult.sources,
              searchResult.results ?? [],
              onDeviceResult.answer,
              onDeviceResult.confidence,
            );
            setIsStreamingComplete(true);
          } else {
            console.log('[Search] handleHistoryItemPress: on-device answer returned null, falling back to streaming cloud');
            await streamCloudAnswer(
              item.search_text,
              contextForAnswer,
              searchResult.uploaded_images_context ?? '',
              preExtractedEntities,
              searchResult.results ?? [],
            );
          }
        } else {
          console.log('[Search] handleHistoryItemPress: cloud-only path, streaming answer');
          await streamCloudAnswer(
            item.search_text,
            contextForAnswer,
            searchResult.uploaded_images_context ?? '',
            preExtractedEntities,
            searchResult.results ?? [],
          );
        }
      }
    } catch (e) {
      console.error('[SearchScreen] handleHistoryItemPress error:', e);
    } finally {
      if (mountedRef.current) setIsSearching(false);
    }
  }, [searchNotes, tryOnDeviceExtraction, checkAndNotifyFoundationModels, patchNotesForOnDeviceAnswer, updateAiAnswerTiming, streamCloudAnswer]);

  const handleNotePress = useCallback((noteId: string, imageIndex?: number) => {
    console.log('[SearchScreen] Note card pressed, navigating to note editor for noteId:', noteId, 'imageIndex:', imageIndex);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push('/note-editor?id=' + noteId);
  }, [router]);

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
      try {
        listRef.current.scrollToIndex({ index: noteIndex, animated: true, viewOffset: 80 });
      } catch (e) {
        console.warn('[SearchScreen] scrollToIndex threw, falling back to scrollToOffset:', e);
        listRef.current?.scrollToOffset({ offset: noteIndex * 200, animated: true });
      }
    } else {
      console.log('[SearchScreen] Recall element not found in list');
    }
  }, [filteredNotes]);

  const recallReferences = useMemo(() => {
    if (!notes || notes.length === 0) return [];
    // Build sparse array indexed by sourceNumber - 1 so SOURCE_3 → index 2
    const refs: ({ recallId: string; imageIndex?: number } | undefined)[] = [];
    notes.forEach((note) => {
      const sn = (note as any).source_number;
      if (typeof sn === 'number' && sn >= 1) {
        refs[sn - 1] = {
          recallId: note.id,
          imageIndex: note.images && note.images.length > 0 ? 0 : undefined,
        };
      }
    });
    return refs;
  }, [notes]);

  const handleClear = useCallback(() => {
    console.log('[SearchScreen] handleClear pressed');
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAnswerExpanded(true);
    setIsSearching(false);
    setIsProgressExpanded(true);
    setAttachedImages([]);
    setOcrProgress(null);
    setShowAttachFABs(false);
    setSelectedPill(null);
    setCategoryRecalls([]);
    setOnDeviceAnswerMs(null);
    setStreamingAnswer('');
    setIsStreamingComplete(false);
    setShowThinkingText(false);
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
    setIsAnswerExpanded(true);
    setIsSearching(false);
    setIsProgressExpanded(true);
    setSelectedPill(null);
    setCategoryRecalls([]);
    setOnDeviceAnswerMs(null);
    setStreamingAnswer('');
    setIsStreamingComplete(false);
    setShowThinkingText(false);
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
    const displayAnswer = (searchAnswer && searchAnswer.length >= (streamingAnswer?.length ?? 0))
      ? searchAnswer
      : (streamingAnswer || searchAnswer || '');
    if (!displayAnswer) {
      console.log('[SearchScreen] handleShareAnswer: no answer to share');
      return;
    }
    console.log('[SearchScreen] handleShareAnswer: sharing answer, length:', displayAnswer.length);
    try {
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Clean SOURCE_ references for sharing
      const cleanedAnswer = displayAnswer.replace(/\s*SOURCE_\d+/g, '');
      const answer = `Answer from Recall:\n\n${cleanedAnswer}\n\n---\nSearched phrase: "${searchQuery}"`;

      // Copy bundled app icon to cache for share sheet preview
      let logoUri: string | undefined;
      try {
        const asset = Asset.fromModule(require('../assets/images/icon.png'));
        await asset.downloadAsync();
        if (asset.localUri) {
          const dest = FileSystem.cacheDirectory + 'recall_share_logo.png';
          await FileSystem.copyAsync({ from: asset.localUri, to: dest });
          logoUri = dest;
          console.log('[SearchScreen] handleShareAnswer: logo copied to cache:', dest);
        }
      } catch (e) {
        console.warn('[SearchScreen] handleShareAnswer: logo copy failed (sharing without image):', e);
      }

      console.log('[SearchScreen] handleShareAnswer: opening share sheet, hasLogo:', !!logoUri);
      await RNShare.open({
        title: 'Recall Answer',
        message: answer,
        ...(logoUri ? { url: logoUri, type: 'image/png' } : {}),
        failOnCancel: false,
      });
      console.log('[SearchScreen] handleShareAnswer: share sheet closed');
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        console.error('[SearchScreen] handleShareAnswer error:', e);
      }
    }
  }, [searchAnswer, streamingAnswer, searchQuery]);

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
            onCardPress={(id) => { console.log('[SearchScreen] NoteCard onCardPress:', id); router.push('/note-editor?id=' + id); }}
            scrollToImageIndex={imageIndex}
            loading={false}
          />
        </View>
      </View>
    );
  }, [recallReferences, getUrlMetadataForRecall, router]);

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
                {false && (
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
                    onDeviceAnswerMs={onDeviceAnswerMs}
                    fastModeActive={false}
                    onDeviceUsed={onDeviceAnswerMs != null}
                  />
                )}

                {/* Show answer card as soon as search starts */}
                {(isSearching || !!streamingAnswer || !!searchAnswer) && !(isStreamingComplete && !streamingAnswer && !searchAnswer) ? (
                  <Animated.View entering={FadeIn.duration(300)} style={styles.answerContainer}>
                    <View style={styles.answerHeader}>
                      <View style={styles.answerHeaderLeft}>
                        <IconSymbol name="lightbulb.fill" size={20} color={colors.primary} />
                        <Text style={styles.answerTitle}>Answer</Text>
                      </View>
                      <View style={styles.answerHeaderRight}>
                        {isStreamingComplete && searchConfidence !== undefined && (
                          <View style={styles.confidenceBadge}>
                            <IconSymbol name="checkmark.seal.fill" size={14} color={colors.primary} />
                            <Text style={styles.confidenceText}>{searchConfidence}% confident</Text>
                          </View>
                        )}
                        {isStreamingComplete && (
                          <Pressable
                            onPress={handleShareAnswer}
                            style={styles.shareAnswerButton}
                            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                          >
                            <ShareIcon size={18} color={colors.primary} strokeWidth={2.2} />
                          </Pressable>
                        )}
                      </View>
                    </View>
                    <View style={styles.answerContent}>
                      {(() => {
                        const displayAnswer = (searchAnswer && searchAnswer.length >= (streamingAnswer?.length ?? 0))
                          ? searchAnswer
                          : (streamingAnswer || searchAnswer || '');
                        return isStreamingComplete ? (
                          <MarkdownAnswer
                            content={isAnswerExpanded ? (displayAnswer ?? '') : getAnswerPreview(displayAnswer ?? '')}
                            recallReferences={recallReferences}
                            onRecallPress={handleRecallLinkPress}
                          />
                        ) : streamingAnswer ? (
                          <MarkdownAnswer
                            content={streamingAnswer}
                            recallReferences={recallReferences}
                            onRecallPress={handleRecallLinkPress}
                          />
                        ) : (
                          <View>
                            <TypingDots />
                            {showThinkingText && (
                              <Animated.Text
                                entering={FadeIn.duration(400)}
                                style={styles.thinkingText}
                              >
                                {thinkingPhraseRef.current || THINKING_PHRASES[0]}
                              </Animated.Text>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                    {isStreamingComplete && shouldShowAnswerToggle((searchAnswer || streamingAnswer) ?? '') && (
                      <Pressable
                        onPress={() => {
                          console.log('[SearchScreen] Answer toggle pressed, isAnswerExpanded:', !isAnswerExpanded);
                          setIsAnswerExpanded(!isAnswerExpanded);
                        }}
                        style={styles.answerToggleContainer}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.answerToggleText}>
                          {isAnswerExpanded ? 'Show less' : 'Show more'}
                        </Text>
                      </Pressable>
                    )}
                  </Animated.View>
                ) : (
                  <React.Fragment>
                    {filteredNotes.length === 0 && !searchAnswer && searchStage === 'complete' && (
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
        onScrollToIndexFailed={(info) => {
          console.warn('[SearchScreen] scrollToIndex failed, falling back to scrollToOffset. index:', info.index);
          const estimatedOffset = info.index * 200; // rough estimate per item
          listRef.current?.scrollToOffset({ offset: estimatedOffset, animated: true });
        }}
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
    zIndex: 10,
    overflow: 'visible',
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
    padding: 8,
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
  thinkingText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
