
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Keyboard,
  Switch,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import { SearchHistory } from '@/types/Note';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function SearchScreen() {
  const router = useRouter();
  const { notes, loading, searchNotes, getSearchHistory, locationInfo, searchAnswer, searchConfidence } = useNotes();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAiSearch, setIsAiSearch] = useState(false);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(false);
  const [useV2Search, setUseV2Search] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  const loadSearchHistory = useCallback(async () => {
    const history = await getSearchHistory();
    setSearchHistory(history);
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

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setShowHistory(false);
      setHasSearched(true);
      setIsAiSearch(true);
      setIsAnswerExpanded(false);
      searchNotes(searchQuery, useV2Search);
      setTimeout(() => {
        loadSearchHistory();
      }, 500);
    }
  };

  const handleHistoryItemPress = (searchText: string) => {
    setSearchQuery(searchText);
    setShowHistory(false);
    setHasSearched(true);
    setIsAiSearch(true);
    setIsAnswerExpanded(false);
    searchNotes(searchText, useV2Search);
  };

  const handleNotePress = (noteId: string) => {
    router.push(`/note-editor?id=${noteId}`);
  };

  const handleClear = () => {
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAiSearch(false);
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
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={toggleKeyboard} style={styles.headerButton}>
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
            <Pressable onPress={handleClear} style={styles.clearButton}>
              <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
          <Pressable 
            onPress={handleSearch} 
            style={styles.searchIconButton}
            disabled={!searchQuery.trim()}
          >
            <View style={[
              styles.searchIconContainer,
              !searchQuery.trim() && styles.searchIconDisabled
            ]}>
              <IconSymbol 
                name="sparkles" 
                size={18} 
                color="#FFFFFF" 
              />
            </View>
          </Pressable>
        </View>
        
        {/* V2 Search Toggle */}
        <View style={styles.toggleContainer}>
          <View style={styles.toggleLeft}>
            <IconSymbol 
              name={useV2Search ? "photo.fill" : "doc.text.fill"} 
              size={16} 
              color={colors.primary} 
            />
            <Text style={styles.toggleLabel}>
              {useV2Search ? 'Image-based search' : 'Text-based search'}
            </Text>
          </View>
          <Switch
            value={useV2Search}
            onValueChange={setUseV2Search}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={colors.border}
          />
        </View>
        
        {isAiSearch && hasSearched && (
          <View style={styles.indicatorsContainer}> 
            {locationInfo && !useV2Search && (
              <View style={styles.locationIndicator}>
                <IconSymbol name="location.fill" size={14} color={colors.primary} />
                <Text style={styles.locationIndicatorText}>
                  Near {locationInfo.resolvedPlace} ({locationInfo.proximity}km)
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {showHistory && searchHistory.length > 0 ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.historyContainer}>
            <Text style={styles.historyTitle}>Recent Searches</Text>
            {searchHistory.map((item) => (
              <Pressable
                key={item.id}
                style={styles.historyItem}
                onPress={() => handleHistoryItemPress(item.search_text)}
              >
                <IconSymbol name="clock" size={18} color={colors.textSecondary} />
                <Text style={styles.historyText}>{item.search_text}</Text>
                <IconSymbol name="arrow.up.left" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </Animated.View>
        ) : loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Analyzing with AI...</Text>
          </View>
        ) : !hasSearched ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
            <IconSymbol 
              name={useV2Search ? "photo.on.rectangle" : "sparkles"} 
              size={80} 
              color={colors.textTertiary} 
            />
            <Text style={styles.emptyTitle}>
              {useV2Search ? 'Image-Based AI Search' : 'Text-Based AI Search'}
            </Text>
            <Text style={styles.emptyText}>
              {useV2Search 
                ? 'Search your recalls using image embeddings and visual content analysis'
                : 'Search your recalls using advanced NLP and named entity recognition'
              }
            </Text>
            <View style={styles.featureList}>
              {useV2Search ? (
                <React.Fragment>
                  <View style={styles.featureItem}>
                    <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                    <Text style={styles.featureText}>Image embedding similarity</Text>
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
                    <Text style={styles.featureText}>Top 8 closest matches</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                    <Text style={styles.featureText}>Question answering</Text>
                  </View>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <View style={styles.featureItem}>
                    <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                    <Text style={styles.featureText}>Semantic understanding</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                    <Text style={styles.featureText}>Location & proximity filtering</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                    <Text style={styles.featureText}>Named entity recognition</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                    <Text style={styles.featureText}>Google Places integration</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <IconSymbol name="checkmark.circle.fill" size={20} color={colors.primary} />
                    <Text style={styles.featureText}>Question answering</Text>
                  </View>
                </React.Fragment>
              )}
            </View>
          </Animated.View>
        ) : notes.length === 0 && !searchAnswer ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
            <IconSymbol name="doc.text.magnifyingglass" size={80} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Results Found</Text>
            <Text style={styles.emptyText}>
              Try a different search term or add more details
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
                </Text>
                {notes.map((note) => (
                  <View key={note.id} style={styles.noteWrapper}>
                    <NoteCard
                      note={note}
                      onPress={() => handleNotePress(note.id)}
                    />
                    {note.relevance_score !== undefined && (
                      <View style={styles.relevanceInfo}>
                        <View style={styles.relevanceScore}>
                          <IconSymbol name="star.fill" size={14} color={colors.primary} />
                          <Text style={styles.relevanceScoreText}>
                            {note.relevance_score}% match
                          </Text>
                        </View>
                        {note.relevance_reason && (
                          <Text style={styles.relevanceReason}>{note.relevance_reason}</Text>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </React.Fragment>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 8,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: {
    padding: 4,
  },
  searchIconButton: {
    padding: 4,
  },
  searchIconContainer: {
    backgroundColor: colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconDisabled: {
    opacity: 0.4,
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  indicatorsContainer: {
    marginTop: 8,
    gap: 6,
  },
  aiIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  aiIndicatorText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  locationIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  locationIndicatorText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
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
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  historyText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 8,
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
    padding: 16,
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
    paddingVertical: 4,
    paddingHorizontal: 10,
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
    paddingVertical: 4,
    paddingHorizontal: 8,
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
  relevanceInfo: {
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 8,
    marginTop: -8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  relevanceScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  relevanceScoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  relevanceReason: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
