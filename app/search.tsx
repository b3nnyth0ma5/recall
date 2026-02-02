
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
  Share,
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
import { MarkdownAnswer } from '@/components/MarkdownAnswer';
import Toast from 'react-native-toast-message';

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
    searchExtractedKeywords,
    searchTimeMs,
    searchTimings,
  } = useNotes();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isProgressExpanded, setIsProgressExpanded] = useState(true);
  const searchInputRef = useRef<TextInput>(null);
  const hasAutoSearchedRef = useRef(false);

  const shouldShowSearchTime = user?.email === 'benny_thomas21@yahoo.co.in';

  const filteredNotes = useMemo(() => {
    const hasUsedForAnswerFlag = notes.some(note => note.used_for_answer !== undefined);
    
    if (!hasUsedForAnswerFlag) {
      return notes;
    }
    
    const filtered = notes.filter(note => note.used_for_answer === true);
    
    if (filtered.length === 0 && notes.length > 0) {
      return notes;
    }
    
    return filtered;
  }, [notes]);

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
    if (searchQuery.trim()) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      
      setShowHistory(false);
      setHasSearched(true);
      setIsAnswerExpanded(false);
      setIsSearching(true);
      setIsProgressExpanded(true);
      
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
  const scrollViewRef = useRef<ScrollView>(null);

  const handleRecallLinkPress = useCallback((recallId: string, imageIndex?: number) => {
    console.log('[SearchScreen] Recall link pressed:', recallId, 'imageIndex:', imageIndex);
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    const recallElement = recallRefs.current[recallId];
    if (recallElement && scrollViewRef.current) {
      console.log('[SearchScreen] Found recall element, measuring position...');
      
      setTimeout(() => {
        recallElement.measureLayout(
          scrollViewRef.current as any,
          (x, y, width, height) => {
            console.log('[SearchScreen] Recall position:', { x, y, width, height });
            
            if (scrollViewRef.current) {
              // Scroll to ensure the TOP of the recall is visible
              // Subtract more offset to ensure the entire recall header is visible
              const scrollY = Math.max(0, y - 80);
              console.log('[SearchScreen] Scrolling to y:', scrollY);
              
              scrollViewRef.current.scrollTo({
                y: scrollY,
                animated: true,
              });
            }
          },
          () => {
            console.log('[SearchScreen] measureLayout failed, trying measure fallback');
            recallElement.measure((fx, fy, width, height, px, py) => {
              console.log('[SearchScreen] Recall absolute position:', { fx, fy, width, height, px, py });
              
              if (scrollViewRef.current) {
                // Scroll to ensure the TOP of the recall is visible
                const scrollY = Math.max(0, py - 80);
                console.log('[SearchScreen] Scrolling to y (fallback):', scrollY);
                
                scrollViewRef.current.scrollTo({
                  y: scrollY,
                  animated: true,
                });
              }
            });
          }
        );
      }, 100);
    } else {
      console.log('[SearchScreen] Recall element not found in refs');
    }
  }, []);

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
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAnswerExpanded(false);
    setIsSearching(false);
    setIsProgressExpanded(true);
    searchNotes('');
  }, [searchNotes]);

  const handleBack = useCallback(() => {
    setSearchQuery('');
    setShowHistory(true);
    setHasSearched(false);
    setIsAnswerExpanded(false);
    setIsSearching(false);
    setIsProgressExpanded(true);
    searchNotes('');
    
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
              <IconSymbol 
                name="chevron.left" 
                size={24} 
                color={colors.text} 
              />
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
          <IconSymbol 
            name="magnifyingglass" 
            size={20} 
            color={colors.textSecondary} 
          />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Do a smart search..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            blurOnSubmit={false}
            multiline={false}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="default"
          />
          {searchQuery.length > 0 && (
            <Pressable 
              onPress={handleClear} 
              style={styles.clearButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol 
                name="xmark.circle.fill" 
                size={20} 
                color={colors.textSecondary} 
              />
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
      </View>

      <ScrollView ref={scrollViewRef} style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
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
                <IconSymbol 
                  name="clock" 
                  size={18} 
                  color={colors.textSecondary} 
                />
                <Text style={styles.historyText}>{item.search_text}</Text>
                <IconSymbol 
                  name="arrow.up.left" 
                  size={16} 
                  color={colors.textTertiary} 
                />
              </Pressable>
            ))}
          </Animated.View>
        ) : showHistory && searchHistory.length === 0 && !isLoadingHistory ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyHistoryContainer}>
            <View style={styles.emptyHistoryIconContainer}>
              <IconSymbol 
                name="clock" 
                size={48} 
                color={colors.textTertiary} 
              />
            </View>
            <Text style={styles.emptyHistoryTitle}>No Search History</Text>
            <Text style={styles.emptyHistoryMessage}>
              Your recent searches will appear here
            </Text>
            {searchTips}
          </Animated.View>
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
                    <IconSymbol 
                      name="doc.text.magnifyingglass" 
                      size={80} 
                      color={colors.textTertiary} 
                    />
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
                            <IconSymbol 
                              name="lightbulb.fill" 
                              size={20} 
                              color={colors.primary} 
                            />
                            <Text style={styles.answerTitle}>Answer</Text>
                          </View>
                          <View style={styles.answerHeaderRight}>
                            <View style={styles.confidenceBadge}>
                              <IconSymbol 
                                name="checkmark.seal.fill" 
                                size={14} 
                                color={colors.primary} 
                              />
                              <Text style={styles.confidenceText}>{searchConfidence}% confident</Text>
                            </View>
                            <Pressable
                              onPress={handleShareAnswer}
                              style={styles.shareAnswerButton}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <IconSymbol 
                                name="paperplane.fill" 
                                size={18} 
                                color={colors.primary} 
                              />
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
                      <React.Fragment>
                        <Text style={styles.resultsText}>
                          {filteredNotes.length} {filteredNotes.length === 1 ? 'result' : 'results'} used for answer
                          {locationInfo && ` near ${locationInfo.resolvedPlace}`}
                          {personInfo && personInfo.matchedNames.length > 0 && ` for ${personInfo.matchedNames.join(', ')}`}
                        </Text>
                        {filteredNotes.map((note) => {
                          const recallRef = recallReferences.find(ref => ref.recallId === note.id);
                          const imageIndex = recallRef?.imageIndex;
                          
                          return (
                            <View 
                              key={note.id} 
                              style={styles.noteWrapper}
                              ref={(ref) => {
                                recallRefs.current[note.id] = ref;
                              }}
                            >
                              <View style={styles.badgeRow}>
                                <View style={styles.answerSourceBadge}>
                                  <IconSymbol 
                                    name="checkmark.seal.fill" 
                                    size={14} 
                                    color={colors.primary} 
                                  />
                                  <Text style={styles.answerSourceText}>Used for answer</Text>
                                </View>
                              </View>
                              <View style={styles.noteCardContainer}>
                                <NoteCard
                                  note={note}
                                  onPress={(scrollToImage) => {
                                    const finalImageIndex = scrollToImage !== undefined ? scrollToImage : imageIndex;
                                    handleNotePress(note.id, finalImageIndex);
                                  }}
                                  scrollToImageIndex={imageIndex}
                                  loading={false}
                                />
                              </View>
                            </View>
                          );
                        })}
                      </React.Fragment>
                    )}
                  </React.Fragment>
                )}
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
    padding: 8 * 1.15,
    marginHorizontal: 8,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16 * 1.15,
    paddingVertical: 12,
    gap: 12,
    minHeight: 48 * 1.1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    minHeight: 24,
    paddingVertical: 0,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
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
});
