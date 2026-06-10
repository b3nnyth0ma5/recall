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
  Animated as RNAnimated,
} from 'react-native';
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
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SearchProgressIndicator } from '@/components/SearchProgressIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { MarkdownAnswer } from '@/components/MarkdownAnswer';
import Toast from 'react-native-toast-message';
import { donateSearch } from 'recall-native';
import { Share as ShareIcon } from 'lucide-react-native';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { supabase, deleteSearchHistory, cleanupCloudflareCollage } from '@/utils/supabase';
import { PillsRow } from '@/components/PillsRow';

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
  } = useNotesContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(true);
  const [selectedPill, setSelectedPill] = useState<string | null>(null);
  const searchInputRef = useRef<TextInput>(null);
  const hasAutoSearchedRef = useRef(false);

  const shouldShowSearchTime = user?.email === 'benny_thomas21@yahoo.co.in';

  const SEARCH_PILLS = ['Cookbooks', 'Elly', 'Cocktail Ideas', 'Rated restaurants', 'Travel', 'Health', 'Home ideas', 'Documents', 'Alcohol', 'Sri Lanka'];

  const filteredNotes = useMemo(() => {
    // If a search has completed, ONLY show notes flagged as used_for_answer.
    // Never fall back to "all notes" — that would mask zero-result searches.
    if (hasSearched && searchStage === 'complete') {
      return notes.filter(note => note.used_for_answer === true);
    }
    // Before any search has run, or while searching, the list shouldn't render
    // any cards anyway (FlatList data prop already guards this), so just pass
    // notes through.
    return notes;
  }, [notes, hasSearched, searchStage]);

  const loadSearchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    const history = await getSearchHistory();
    setSearchHistory(history);
    setIsLoadingHistory(false);
  }, [getSearchHistory]);

  useEffect(() => {
    loadSearchHistory();

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
  }, [loadSearchHistory]);

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
      donateSearch(decodedQuery);
      
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

  const handleSearch = useCallback(() => {
    console.log('User submitted search query:', searchQuery.trim() || '(empty)');
    Keyboard.dismiss();
    if (searchQuery.trim()) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      
      setShowHistory(false);
      setHasSearched(true);
      setIsAnswerExpanded(false);
      setIsSearching(true);
      setIsProgressExpanded(true);
      donateSearch(searchQuery.trim());
      
      searchNotes(searchQuery, true).finally(() => {
        setIsSearching(false);
        
        setTimeout(() => {
          loadSearchHistory();
        }, 500);
      });
    }
  }, [searchQuery, searchNotes, loadSearchHistory]);

  const handleHistoryItemPress = useCallback((searchText: string) => {
    setSearchQuery(searchText);
    setShowHistory(false);
    setHasSearched(true);
    setIsAnswerExpanded(false);
    setIsSearching(true);
    setIsProgressExpanded(true);
    
    searchNotes(searchText, true).finally(() => {
      setIsSearching(false);
    });
  }, [searchNotes]);

  const handleNotePress = useCallback((noteId: string, imageIndex?: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    setTimeout(() => {
      try {
        const url = imageIndex !== undefined 
          ? `/note-editor?id=${noteId}&scrollToImage=${imageIndex}`
          : `/note-editor?id=${noteId}`;
        
        router.push(url);
      } catch (error) {
        console.error('[SearchScreen] Error navigating to note editor:', error);
      }
    }, 0);
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

  const renderHistorySkeletons = useMemo(() => {
    return (
      <Animated.View entering={FadeIn.duration(600)} style={styles.historyContainer}>
        <Text style={styles.historyTitle}>Recent</Text>
        {[...Array(3)].map((_, index) => (
          <View key={`history-skeleton-${index}`} style={styles.historyItemSkeleton}>
            <View style={styles.historyIconPlaceholder} />
            <View style={styles.historyTextPlaceholder} />
            <View style={styles.historyArrowPlaceholder} />
          </View>
        ))}
      </Animated.View>
    );
  }, []);

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
            onPress={(scrollToImage) => {
              const finalImageIndex = scrollToImage !== undefined ? scrollToImage : imageIndex;
              handleNotePress(item.id, finalImageIndex);
            }}
            scrollToImageIndex={imageIndex}
            loading={false}
          />
        </View>
      </View>
    );
  }, [recallReferences, handleNotePress]);

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
      />

      {/* FlatList: data = filteredNotes when searching, empty otherwise.
          All non-results content (history, empty states, answer, progress) lives in ListHeaderComponent. */}
      <FlatList
        ref={listRef}
        data={hasSearched && !isSearching && filteredNotes.length > 0 ? filteredNotes : []}
        keyExtractor={(item) => item.id}
        renderItem={renderSearchResultItem}
        ListHeaderComponent={
          <View style={styles.listHeaderContainer}>
            <View style={styles.pillsRowWrapper}>
              <PillsRow
                items={SEARCH_PILLS}
                selected={selectedPill}
                onSelect={(label) => {
                  console.log('[SearchScreen] Pill toggled:', label, '| was selected:', selectedPill);
                  setSelectedPill(selectedPill === label ? null : label);
                }}
              />
            </View>
            {showHistory && isLoadingHistory ? (
              renderHistorySkeletons
            ) : showHistory && searchHistory.length > 0 ? (
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
                        console.log('[search] History item pressed:', item.search_text);
                        handleHistoryItemPress(item.search_text);
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
                      <IconSymbol name="arrow.up.left" size={16} color={colors.textTertiary} />
                    </Pressable>
                  </Swipeable>
                ))}
              </Animated.View>
            ) : showHistory && searchHistory.length === 0 && !isLoadingHistory ? (
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
            ) : !hasSearched ? (
              <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
                <IconSymbol name="photo.on.rectangle" size={80} color={colors.textTertiary} />
                <Text style={styles.emptyTitle}>Smart Searching</Text>
                <Text style={styles.emptyText}>
                  Search your Recalls like you&apos;re talking to a friend
                </Text>
                {featureList}
              </Animated.View>
            ) : (
              <View style={styles.notesContainer}>
                {hasSearched && (
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
                )}

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

                        {filteredNotes.length > 0 && (
                          <Text style={styles.resultsText}>
                            {filteredNotes.length} {filteredNotes.length === 1 ? 'result' : 'results'} used for answer
                            {locationInfo && ` near ${locationInfo.resolvedPlace}`}
                            {personInfo && personInfo.matchedNames.length > 0 && ` for ${personInfo.matchedNames.join(', ')}`}
                          </Text>
                        )}
                      </React.Fragment>
                    )}
                  </React.Fragment>
                )}
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

      {/* Map FAB — always visible */}
      <Pressable
        onPress={() => {
          if (hasSearched && filteredNotes.length > 0) {
            const ids = filteredNotes.map(n => n.id).join(',');
            console.log('[SearchScreen] Map FAB pressed — navigating with', filteredNotes.length, 'search result IDs');
            router.push(`/map-view?hasSearch=true&ids=${ids}`);
          } else {
            console.log('[SearchScreen] Map FAB pressed — navigating to browse-all map');
            router.push('/map-view');
          }
        }}
        style={[styles.mapFab, { bottom: insets.bottom + 48 }]}
      >
        <IconSymbol name="map.fill" size={24} color="#FFFFFF" />
      </Pressable>
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
    marginTop: 4,
    marginBottom: 12,
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
    borderRadius: 10,
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
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultsText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
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
    gap: 6,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
    paddingVertical: 6 * 1.15,
    paddingHorizontal: 12 * 1.15,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    zIndex: 100,
    elevation: 100,
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
  mapFab: {
    position: 'absolute',
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
});
