
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import { SearchHistory } from '@/types/Note';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SearchProgressIndicator } from '@/components/SearchProgressIndicator';

export default function SearchScreen() {
  const router = useRouter();
  const { 
    notes, 
    loading, 
    searchNotes, 
    getSearchHistory, 
    searchAnswer, 
    searchConfidence,
    locationInfo,
    searchStage,
    searchLocationName,
  } = useNotes();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const searchInputRef = useRef<TextInput>(null);

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

  // Show history only after it's loaded
  useEffect(() => {
    if (!isLoadingHistory && !hasSearched) {
      setShowHistory(true);
    }
  }, [isLoadingHistory, hasSearched]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      // Haptic feedback when search is clicked
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      
      setShowHistory(false);
      setHasSearched(true);
      setIsAnswerExpanded(false);
      // Always use v2 search
      searchNotes(searchQuery, true);
      setTimeout(() => {
        loadSearchHistory();
      }, 500);
    }
  };

  const handleHistoryItemPress = (searchText: string) => {
    setSearchQuery(searchText);
    setShowHistory(false);
    setHasSearched(true);
    setIsAnswerExpanded(false);
    // Always use v2 search
    searchNotes(searchText, true);
  };

  const handleNotePress = (noteId: string) => {
    router.push(`/note-editor?id=${noteId}`);
  };

  const handleClear = () => {
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAnswerExpanded(false);
    searchNotes('');
  };

  const toggleKeyboard = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      searchInputRef.current?.focus();
    }
  };

  const getAnswerPreview = (answer: string) => {
    const lines = answer.split('\n');
    if (lines.length <= 3) {
      return answer;
    }
    return lines.slice(0, 3).join('\n') + '...';
  };

  const shouldShowAnswerToggle = (answer: string) => {
    const lines = answer.split('\n');
    return lines.length > 3;
  };

  const isSearching = loading && hasSearched;
  const showProgressIndicator = isSearching && searchStage !== 'idle' && searchStage !== 'complete';

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
              onPress={() => router.back()} 
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
            placeholder="Search recalls with AI..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
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
            disabled={!searchQuery.trim() || isLoadingHistory}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={[
              styles.searchIconContainer,
              (!searchQuery.trim() || isLoadingHistory) && styles.searchIconDisabled
            ]}>
              {isLoadingHistory ? (
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

        {/* Location Info Badge */}
        {locationInfo && hasSearched && (
          <Animated.View entering={FadeIn.duration(400)} style={styles.locationInfoBanner}>
            <IconSymbol name="mappin.circle.fill" size={20} color={colors.primary} />
            <View style={styles.locationInfoText}>
              <Text style={styles.locationInfoTitle}>Location Search</Text>
              <Text style={styles.locationInfoSubtitle}>
                Within {locationInfo.proximity}km of {locationInfo.resolvedPlace}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {isLoadingHistory ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading search history...</Text>
          </View>
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
        ) : showProgressIndicator ? (
          <SearchProgressIndicator 
            stage={searchStage} 
            locationName={searchLocationName}
          />
        ) : !hasSearched ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
            <IconSymbol 
              name="photo.on.rectangle" 
              size={80} 
              color={colors.textTertiary} 
            />
            <Text style={styles.emptyTitle}>
              AI-Powered Search
            </Text>
            <Text style={styles.emptyText}>
              Search your recalls using advanced AI and location-based filtering
            </Text>
            <View style={styles.featureList}>
              <React.Fragment>
                <View style={styles.featureItem}>
                  <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Image embedding similarity</Text>
                </View>
                <View style={styles.featureItem}>
                  <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Location-based filtering</Text>
                </View>
                <View style={styles.featureItem}>
                  <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>OCR text matching</Text>
                </View>
                <View style={styles.featureItem}>
                  <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Visual content analysis</Text>
                </View>
                <View style={styles.featureItem}>
                  <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Question answering</Text>
                </View>
              </React.Fragment>
            </View>
          </Animated.View>
        ) : notes.length === 0 && !searchAnswer ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
            <IconSymbol name="doc.text.magnifyingglass" size={80} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Results Found</Text>
            <Text style={styles.emptyText}>
              {locationInfo 
                ? `No recalls found within ${locationInfo.proximity}km of ${locationInfo.resolvedPlace}`
                : 'Try a different search term or add more details'
              }
            </Text>
          </Animated.View>
        ) : (
          <View style={styles.notesContainer}>
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
                </Text>
                {notes.map((note) => (
                  <View key={note.id} style={styles.noteWrapper}>
                    <View style={styles.badgeRow}>
                      <View style={styles.badgeRowLeft}>
                        {note.used_for_answer && (
                          <View style={styles.answerSourceBadge}>
                            <IconSymbol name="checkmark.seal.fill" size={14} color={colors.primary} />
                            <Text style={styles.answerSourceText}>Used for answer</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.badgeRowRight}>
                        {note.relevance_score !== undefined && (
                          <View style={styles.matchPercentageBadge}>
                            <IconSymbol name="star.fill" size={12} color={colors.primary} />
                            <Text style={styles.matchPercentageText}>
                              {note.relevance_score}%
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.noteCardContainer}>
                      <NoteCard
                        note={note}
                        onPress={() => handleNotePress(note.id)}
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
          router.push(`/map-view?hasSearch=${hasSearched ? 'true' : 'false'}`);
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
  locationInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  locationInfoText: {
    flex: 1,
  },
  locationInfoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 2,
  },
  locationInfoSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
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
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -12,
    marginLeft: 12,
    marginRight: 12,
    zIndex: 1,
  },
  badgeRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
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
  },
  answerSourceText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  matchPercentageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
    paddingVertical: 6 * 1.15,
    paddingHorizontal: 12 * 1.15,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  matchPercentageText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  noteCardContainer: {
    position: 'relative',
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
