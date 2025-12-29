
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Keyboard,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import { SearchHistory } from '@/types/Note';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SearchProgressIndicator } from '@/components/SearchProgressIndicator';
import { useAuth } from '@/contexts/AuthContext';

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
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
    searchTimeMs,
  } = useNotes();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const hasAutoSearchedRef = useRef(false);

  // Check if user should see search time
  const shouldShowSearchTime = user?.email === 'benny_thomas21@yahoo.co.in';

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

  // FIXED: Handle auto-search from CombinedSearchAdd with proper deduplication
  useEffect(() => {
    const queryParam = params.q;
    const autoSearchParam = params.autoSearch;
    
    if (queryParam && typeof queryParam === 'string' && autoSearchParam === 'true' && !hasAutoSearchedRef.current) {
      const decodedQuery = decodeURIComponent(queryParam);
      
      console.log('[SearchScreen] Auto-search triggered with query:', decodedQuery);
      
      // Set the search query in the input
      setSearchQuery(decodedQuery);
      setShowHistory(false);
      setHasSearched(true);
      setIsAnswerExpanded(false);
      setIsSearching(true);
      
      // Mark that we've auto-searched to prevent duplicate searches
      hasAutoSearchedRef.current = true;
      
      // Trigger the search programmatically
      console.log('[SearchScreen] Executing search...');
      searchNotes(decodedQuery, true).finally(() => {
        console.log('[SearchScreen] Search completed');
        setIsSearching(false);
      });
      
      // FIXED: Clear the autoSearch parameter to prevent re-triggering - use setTimeout to break call stack
      setTimeout(() => {
        try {
          console.log('[SearchScreen] Clearing autoSearch param');
          router.setParams({ autoSearch: undefined });
        } catch (error) {
          console.error('[SearchScreen] Error clearing autoSearch param:', error);
        }
      }, 0);
    }
  }, [params.q, params.autoSearch, searchNotes, router]);

  // Reset the auto-search flag when query changes
  useEffect(() => {
    if (!params.q) {
      hasAutoSearchedRef.current = false;
    }
  }, [params.q]);

  // Show history when not searching and history is loaded
  useEffect(() => {
    if (!hasSearched && searchHistory.length > 0 && !isLoadingHistory) {
      setShowHistory(true);
    }
  }, [hasSearched, searchHistory, isLoadingHistory]);

  const handleSearch = useCallback(() => {
    if (searchQuery.trim()) {
      // Haptic feedback when search is clicked
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      
      console.log('[SearchScreen] Manual search triggered with query:', searchQuery);
      setShowHistory(false);
      setHasSearched(true);
      setIsAnswerExpanded(false);
      setIsSearching(true);
      
      searchNotes(searchQuery, true).finally(() => {
        console.log('[SearchScreen] Manual search completed');
        setIsSearching(false);
        
        // Reload search history after search completes
        setTimeout(() => {
          loadSearchHistory();
        }, 500);
      });
    }
  }, [searchQuery, searchNotes, loadSearchHistory]);

  const handleHistoryItemPress = useCallback((searchText: string) => {
    console.log('[SearchScreen] Executing search from history:', searchText);
    setSearchQuery(searchText);
    setShowHistory(false);
    setHasSearched(true);
    setIsAnswerExpanded(false);
    setIsSearching(true);
    
    searchNotes(searchText, true).finally(() => {
      console.log('[SearchScreen] History search completed');
      setIsSearching(false);
    });
  }, [searchNotes]);

  const handleNotePress = useCallback((noteId: string) => {
    // FIXED: Use setTimeout to break the call stack and prevent recursion
    setTimeout(() => {
      try {
        router.push(`/note-editor?id=${noteId}`);
      } catch (error) {
        console.error('[SearchScreen] Error navigating to note editor:', error);
      }
    }, 0);
  }, [router]);

  const handleClear = useCallback(() => {
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAnswerExpanded(false);
    setIsSearching(false);
    searchNotes('');
  }, [searchNotes]);

  const handleBack = useCallback(() => {
    console.log('[SearchScreen] Back button pressed - clearing search results');
    
    // Clear search results
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAnswerExpanded(false);
    setIsSearching(false);
    searchNotes('');
    
    // FIXED: Navigate back with error handling and setTimeout to break call stack
    setTimeout(() => {
      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          // If can't go back, navigate to home
          router.replace('/(tabs)/(home)');
        }
      } catch (error) {
        console.error('[SearchScreen] Error navigating back:', error);
        // Fallback to home
        try {
          router.replace('/(tabs)/(home)');
        } catch (fallbackError) {
          console.error('[SearchScreen] Error in fallback navigation:', fallbackError);
        }
      }
    }, 0);
  }, [searchNotes, router]);

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

  // Render skeleton loaders for recent search history
  const renderHistorySkeletons = useMemo(() => {
    return (
      <Animated.View entering={FadeIn.duration(600)} style={styles.historyContainer}>
        <Text style={styles.historyTitle}>Recent Searches</Text>
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

  // Memoize search tips to prevent re-renders
  const searchTips = useMemo(() => (
    <View style={styles.searchTipsContainer}>
      <Text style={styles.searchTipsTitle}>Try searching for:</Text>
      <View style={styles.searchTipsList}>
        <View style={styles.searchTipItem}>
          <IconSymbol name="location.fill" size={16} color={colors.primary} />
          <Text style={styles.searchTipText}>Places you&apos;ve been</Text>
        </View>
        <View style={styles.searchTipItem}>
          <IconSymbol name="person.fill" size={16} color={colors.primary} />
          <Text style={styles.searchTipText}>People you&apos;ve mentioned</Text>
        </View>
        <View style={styles.searchTipItem}>
          <IconSymbol name="photo.fill" size={16} color={colors.primary} />
          <Text style={styles.searchTipText}>Things in your photos</Text>
        </View>
      </View>
    </View>
  ), []);

  // Memoize feature list to prevent re-renders
  const featureList = useMemo(() => (
    <View style={styles.featureList}>
      <View style={styles.featureItem}>
        <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
        <Text style={styles.featureText}>What&apos;s coming up next month?</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
        <Text style={styles.featureText}>Restaurants in Collingwood that are on my wishlist </Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
        <Text style={styles.featureText}>Any Recalls that mention Elly</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
        <Text style={styles.featureText}>What wines did I have at Bistro Marigold?</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
        <Text style={styles.featureText}>What vaccinations has Kiki had and when is it due?</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
        <Text style={styles.featureText}>My cocktail recipes that use lime, ginger and agave</Text>
      </View>
      <View style={styles.featureItem}>
        <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
        <Text style={styles.featureText}>Steak night specials on Thursdays</Text>
      </View>
    </View>
  ), []);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Search',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable 
              onPress={handleBack} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable 
              onPress={toggleKeyboard} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol 
                name={keyboardVisible ? "keyboard.chevron.compact.down" : "keyboard"} 
                size={24} 
                color={colors.text} 
              />
            </Pressable>
          ),
        }}
      />

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <IconSymbol name="magnifyingglass" size={20} color={colors.textSecondary} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Do a smart search..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            enablesReturnKeyAutomatically={true}
            blurOnSubmit={true}
          />
          {searchQuery.length > 0 && (
            <Pressable 
              onPress={handleClear} 
              style={styles.clearButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
          <Pressable 
            onPress={handleSearch} 
            style={styles.searchIconButton}
            disabled={!searchQuery.trim() || isLoadingHistory || isSearching}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={[
              styles.searchIconContainer,
              (!searchQuery.trim() || isLoadingHistory || isSearching) && styles.searchIconDisabled
            ]}>
              {(isLoadingHistory || isSearching) ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <IconSymbol 
                  name="sparkles" 
                  size={18} 
                  color="#FFFFFF" 
                />
              )}
            </View>
          </Pressable>
        </View>

        {/* Intent Badges Container */}
        {hasSearched && !isSearching && (locationInfo || personInfo) && (
          <View style={styles.intentBadgesContainer}>
            {/* Person Info Badge */}
            {personInfo && personInfo.matchedNames.length > 0 && (
              <Animated.View entering={FadeIn.duration(400)} style={styles.intentBadge}>
                <IconSymbol name="person.circle.fill" size={20} color={colors.primary} />
                <View style={styles.intentBadgeText}>
                  <Text style={styles.intentBadgeTitle}>Person Search</Text>
                  <Text style={styles.intentBadgeSubtitle}>
                    {personInfo.matchedNames.join(', ')}
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* Location Info Badge */}
            {locationInfo && (
              <Animated.View entering={FadeIn.duration(400)} style={styles.intentBadge}>
                <IconSymbol name="mappin.circle.fill" size={20} color={colors.primary} />
                <View style={styles.intentBadgeText}>
                  <Text style={styles.intentBadgeTitle}>Location Search</Text>
                  <Text style={styles.intentBadgeSubtitle}>
                    Within {locationInfo.proximity}km of {locationInfo.resolvedPlace}
                  </Text>
                </View>
              </Animated.View>
            )}
          </View>
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Show history with skeleton when loading, or actual history when loaded */}
        {showHistory && isLoadingHistory ? (
          renderHistorySkeletons
        ) : showHistory && searchHistory.length > 0 ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.historyContainer}>
            <Text style={styles.historyTitle}>Recent Searches</Text>
            {searchHistory.map((item) => (
              <Pressable
                key={item.id}
                style={styles.historyItem}
                onPress={() => handleHistoryItemPress(item.search_text)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol name="clock" size={18} color={colors.textSecondary} />
                <Text style={styles.historyText}>{item.search_text}</Text>
                <IconSymbol name="arrow.up.left" size={16} color={colors.textTertiary} />
              </Pressable>
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
        ) : isSearching ? (
          // Show progress indicator when search is running
          <SearchProgressIndicator 
            stage={searchStage} 
            locationName={searchLocationName}
            personNames={searchPersonNames}
          />
        ) : !hasSearched ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
            <IconSymbol 
              name="photo.on.rectangle" 
              size={80} 
              color={colors.textTertiary} 
            />
            <Text style={styles.emptyTitle}>
              Smart Searching
            </Text>
            <Text style={styles.emptyText}>
              Search your Recalls like you&apos;re talking to a friend
            </Text>
            {featureList}
          </Animated.View>
        ) : notes.length === 0 && !searchAnswer ? (
          // Show empty state only when search is complete and no results
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
          // Show results only when search is complete
          <View style={styles.notesContainer}>
            {/* Search Time Display - Only for specific user */}
            {shouldShowSearchTime && searchTimeMs !== undefined && (
              <Animated.View entering={FadeIn.duration(400)} style={styles.searchTimeContainer}>
                <IconSymbol name="clock.fill" size={16} color={colors.textSecondary} />
                <Text style={styles.searchTimeText}>
                  Search completed in {(searchTimeMs / 1000).toFixed(2)}s
                </Text>
              </Animated.View>
            )}

            {/* Answer Section */}
            {searchAnswer && searchConfidence !== undefined && (
              <Animated.View entering={FadeIn.duration(600)} style={styles.answerContainer}>
                <View style={styles.answerHeader}>
                  <View style={styles.answerHeaderLeft}>
                    <IconSymbol name="lightbulb.fill" size={20} color={colors.primary} />
                    <Text style={styles.answerTitle}>Answer</Text>
                  </View>
                  <View style={styles.confidenceBadge}>
                    <IconSymbol name="checkmark.seal.fill" size={14} color={colors.primary} />
                    <Text style={styles.confidenceText}>{searchConfidence}% confident</Text>
                  </View>
                </View>
                <Text style={styles.answerText}>
                  {isAnswerExpanded ? searchAnswer : getAnswerPreview(searchAnswer)}
                </Text>
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

            {/* Results Section */}
            {notes.length > 0 && (
              <React.Fragment>
                <Text style={styles.resultsText}>
                  {notes.length} {notes.length === 1 ? 'result' : 'results'} found
                  {locationInfo && ` near ${locationInfo.resolvedPlace}`}
                  {personInfo && personInfo.matchedNames.length > 0 && ` for ${personInfo.matchedNames.join(', ')}`}
                </Text>
                {notes.map((note) => (
                  <View key={note.id} style={styles.noteWrapper}>
                    {/* Badge row with "used for answer" badge */}
                    {note.used_for_answer && (
                      <View style={styles.badgeRow}>
                        <View style={styles.answerSourceBadge}>
                          <IconSymbol name="checkmark.seal.fill" size={14} color={colors.primary} />
                          <Text style={styles.answerSourceText}>Used for answer</Text>
                        </View>
                      </View>
                    )}
                    <View style={styles.noteCardContainer}>
                      <NoteCard
                        note={note}
                        onPress={() => handleNotePress(note.id)}
                        loading={false}
                      />
                    </View>
                  </View>
                ))}
              </React.Fragment>
            )}
          </View>
        )}
      </ScrollView>

      {/* Map FAB - Bottom Right */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          // FIXED: Use setTimeout to break the call stack and prevent recursion
          setTimeout(() => {
            try {
              router.push(`/map-view?hasSearch=${hasSearched ? 'true' : 'false'}`);
            } catch (error) {
              console.error('[SearchScreen] Error navigating to map view:', error);
            }
          }, 0);
        }}
        style={styles.mapFab}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
  searchContainer: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16 * 1.15,
    paddingVertical: 12 * 1.15,
    gap: 12,
    minHeight: 48 * 1.1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    minHeight: 24 * 1.1,
  },
  clearButton: {
    padding: 4 * 1.15,
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
  intentBadgesContainer: {
    marginTop: 12,
    gap: 8,
  },
  intentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  intentBadgeText: {
    flex: 1,
  },
  intentBadgeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 2,
  },
  intentBadgeSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  historyContainer: {
    width: '100%',
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    padding: 16 * 1.15,
    borderRadius: 12,
    marginBottom: 8,
    minHeight: 56 * 1.1,
  },
  historyText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
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
  searchTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  searchTimeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
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
  mapFab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60 * 1.15,
    height: 60 * 1.15,
    borderRadius: 30 * 1.15,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 16px rgba(255, 107, 122, 0.4)',
    elevation: 8,
  },
});
