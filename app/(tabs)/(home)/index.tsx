
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image, Modal, Platform } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAuth } from '@/contexts/AuthContext';
import { CategoryCarousel } from '@/components/CategoryCarousel';
import { supabase, getImageDataUrl } from '@/utils/supabase';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';

export default function HomeScreen() {
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, refreshSingleNote, isDeletingNote } = useNotes();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const previousNotesCountRef = useRef(notes.length);
  const isFirstFocusRef = useRef(true);
  const { user } = useAuth();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [loadingFiltered, setLoadingFiltered] = useState(false);
  const [categoryRefreshTrigger, setCategoryRefreshTrigger] = useState(0);
  const [showActionButtons, setShowActionButtons] = useState(false);
  const [isNavigating, setIsNavigating] = useState<'camera' | 'text' | null>(null);

  // Update the previous notes count whenever notes change
  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  // Filter notes when category is selected - USING recollections.recall_id
  useEffect(() => {
    const filterNotesByCategory = async () => {
      if (!selectedCategoryId) {
        setFilteredNotes([]);
        return;
      }

      if (!user?.id) {
        console.error('No user logged in');
        setFilteredNotes([]);
        return;
      }

      try {
        setLoadingFiltered(true);
        console.log('Filtering notes by category:', selectedCategoryId);
        console.log('User ID:', user.id);

        // Fetch recollections using recall_id
        const { data: recollections, error: recollectionsError } = await supabase
          .from('recollections')
          .select('recall_id, match_score, category_id')
          .eq('category_id', selectedCategoryId)
          .eq('user_id', user.id)
          .order('match_score', { ascending: false });

        if (recollectionsError) {
          console.error('Error fetching recollections:', recollectionsError);
          setFilteredNotes([]);
          return;
        }

        if (!recollections || recollections.length === 0) {
          console.log('No recollections found for this category');
          setFilteredNotes([]);
          return;
        }

        console.log(`Found ${recollections.length} recollections for category`);
        console.log('Recollections data:', recollections);

        // Extract recall_ids from recollections
        const recallIds = recollections.map(r => r.recall_id);
        console.log('Recall IDs to fetch:', recallIds);
        
        // Fetch the actual recalls using recall_id
        const { data: recalls, error: recallsError } = await supabase
          .from('recalls')
          .select('*')
          .in('id', recallIds);

        if (recallsError) {
          console.error('Error fetching recalls:', recallsError);
          setFilteredNotes([]);
          return;
        }

        if (!recalls || recalls.length === 0) {
          console.log('No recalls found for the recollection recall_ids');
          setFilteredNotes([]);
          return;
        }

        console.log(`Found ${recalls.length} recalls`);

        // Create a map of recall_id to match_score
        const matchScoreMap = new Map(
          recollections.map(r => [r.recall_id, r.match_score])
        );

        // Process the recalls and load their images
        const notesWithImages = await Promise.all(
          recalls.map(async (recall) => {
            try {
              // Load images for this recall using recall_id
              const { data: imagesData, error: imagesError } = await supabase
                .from('recall_images')
                .select('id')
                .eq('recall_id', recall.id)
                .order('created_at', { ascending: true });

              if (imagesError) {
                console.error('Error loading images for recall:', recall.id, imagesError);
                return { 
                  ...recall, 
                  images: [], 
                  imageIds: [],
                  match_score: matchScoreMap.get(recall.id) || 0
                };
              }

              const imageResults = await Promise.all(
                (imagesData || []).map(async (img) => {
                  try {
                    const dataUrl = await getImageDataUrl(img.id);
                    if (!dataUrl) {
                      return { url: '', id: img.id };
                    }
                    return { url: dataUrl, id: img.id };
                  } catch (error) {
                    console.error(`Exception processing image ${img.id}:`, error);
                    return { url: '', id: img.id };
                  }
                })
              );

              const validImageUrls = imageResults.filter(result => result.url !== '').map(result => result.url);
              const imageIds = imageResults.map(result => result.id);
              
              return { 
                ...recall, 
                images: validImageUrls, 
                imageIds: imageIds,
                match_score: matchScoreMap.get(recall.id) || 0
              };
            } catch (error) {
              console.error(`Exception processing recall ${recall.id}:`, error);
              return { 
                ...recall, 
                images: [], 
                imageIds: [],
                match_score: matchScoreMap.get(recall.id) || 0
              };
            }
          })
        );

        // Sort by match_score (highest first)
        notesWithImages.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

        console.log(`Filtered ${notesWithImages.length} notes for category (sorted by match_score)`);
        setFilteredNotes(notesWithImages);
      } catch (error) {
        console.error('Error filtering notes:', error);
        setFilteredNotes([]);
      } finally {
        setLoadingFiltered(false);
      }
    };

    filterNotesByCategory();
  }, [selectedCategoryId, user?.id]);

  useFocusEffect(
    useCallback(() => {
      console.log('[useFocusEffect] Home screen focused');
      
      // Skip auto-refresh on first focus (initial load)
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      
      // Check if a new note was created (notes count increased)
      const currentCount = notes.length;
      const previousCount = previousNotesCountRef.current;
      
      if (currentCount > previousCount) {
        console.log('[useFocusEffect] New note detected, auto-refreshing...');
        refreshNotes();
      }
      
      // Restore scroll position after a short delay
      const savedScrollPosition = scrollPositionRef.current;
      if (savedScrollPosition > 0 && scrollViewRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: savedScrollPosition, animated: false });
        }, 100);
      }
      
      // Cleanup function
      return () => {
        console.log('[useFocusEffect] Home screen unfocused');
      };
    }, [notes.length, refreshNotes])
  );

  const handleRefresh = async (clearCategory: boolean = false) => {
    setRefreshing(true);
    console.log('[handleRefresh] Refreshing landing page data from Supabase...');
    
    try {
      // Refresh categories by triggering a re-render in CategoryCarousel
      console.log('[handleRefresh] Triggering category refresh...');
      setCategoryRefreshTrigger(prev => prev + 1);
      
      // Refresh notes/recalls
      if (selectedCategoryId && !clearCategory) {
        console.log('[handleRefresh] Refreshing filtered notes for category:', selectedCategoryId);
        // Trigger re-fetch of filtered notes by temporarily clearing and resetting category
        const currentCategory = selectedCategoryId;
        setSelectedCategoryId(null);
        setTimeout(() => setSelectedCategoryId(currentCategory), 100);
      } else {
        console.log('[handleRefresh] Refreshing all notes...');
        await refreshNotes();
      }
    } catch (error) {
      console.error('[handleRefresh] Error refreshing data:', error);
    } finally {
      setRefreshing(false);
      console.log('[handleRefresh] Refresh complete');
    }
  };

  const handleRecallIconPress = async () => {
    console.log('[handleRecallIconPress] Recall icon pressed - clearing categories and reloading');
    
    // Clear selected category
    setSelectedCategoryId(null);
    
    // Scroll to top
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
    
    // Reload landing page data with clearCategory flag set to true
    await handleRefresh(true);
  };

  const toggleActionButtons = () => {
    const newState = !showActionButtons;
    setShowActionButtons(newState);

    // Haptic feedback when add note icon is clicked
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
  };

  const handleCameraPress = () => {
    if (isNavigating) return;
    console.log('[handleCameraPress] Camera button pressed');
    setIsNavigating('camera');
    
    // Haptic feedback when camera icon is clicked
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    // Close action buttons
    setShowActionButtons(false);
    
    // Navigate to note editor with camera flag
    setTimeout(() => {
      router.push('/note-editor?openCamera=true');
      // Reset navigation state after a delay
      setTimeout(() => setIsNavigating(null), 1000);
    }, 200);
  };

  const handleTextPress = () => {
    if (isNavigating) return;
    console.log('[handleTextPress] Text button pressed');
    setIsNavigating('text');
    
    // Haptic feedback when text icon is clicked
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    // Close action buttons
    setShowActionButtons(false);
    
    // Navigate to note editor normally
    setTimeout(() => {
      router.push('/note-editor');
      // Reset navigation state after a delay
      setTimeout(() => setIsNavigating(null), 1000);
    }, 200);
  };

  const handleNotePress = (noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to note editor:', error);
    }
  };

  const handleSearch = () => {
    // Haptic feedback when search icon is clicked
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    try {
      router.push('/search');
    } catch (error) {
      console.error('Error navigating to search:', error);
    }
  };

  const handleProfile = () => {
    try {
      router.push('/(tabs)/profile');
    } catch (error) {
      console.error('Error navigating to profile:', error);
    }
  };

  const handleCategorySelect = (categoryId: string | null) => {
    console.log('Category selected:', categoryId);
    setSelectedCategoryId(categoryId);
    // Scroll to top when category changes
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  };

  const handleScroll = useCallback((event: any) => {
    try {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      
      // Save scroll position to ref (doesn't trigger re-render)
      scrollPositionRef.current = contentOffset.y;
      
      // Only load more if not filtering by category
      if (selectedCategoryId) {
        return;
      }

      // Load more notes when near bottom
      const paddingToBottom = 20;
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

      if (isCloseToBottom && hasMore && !isLoadingMore && !loading) {
        console.log('[handleScroll] Loading more notes...');
        loadMoreNotes();
      }
    } catch (error) {
      console.error('Error handling scroll:', error);
    }
  }, [hasMore, isLoadingMore, loading, loadMoreNotes, selectedCategoryId]);

  const renderEmptyState = () => (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
      <IconSymbol name="note.text" size={80} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>
        {selectedCategoryId ? 'No Recalls in This Category' : 'No Recalls Yet'}
      </Text>
      <Text style={styles.emptyText}>
        {selectedCategoryId 
          ? 'Try selecting a different category or create a new recall'
          : 'Tap the + button to create your first recall'
        }
      </Text>
    </Animated.View>
  );

  // Determine which notes to display
  const displayNotes = selectedCategoryId ? filteredNotes : notes;
  const isLoading = selectedCategoryId ? loadingFiltered : loading;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Recall',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontSize: 32,
            fontWeight: 'bold',
						fontColor: colors.primary,
          },
          headerLeft: () => (
            <Pressable onPress={handleRecallIconPress} style={styles.headerButton}>
              <Image
                source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
                style={styles.headerIcon}
                resizeMode="contain"
              />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={handleProfile} style={styles.headerButton}>
              <IconSymbol name="person.circle.fill" size={32} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      {/* Main Content ScrollView */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => handleRefresh(false)}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Category Carousel - Only show categories with recollections */}
        <CategoryCarousel 
          onCategorySelect={handleCategorySelect}
          selectedCategoryId={selectedCategoryId}
          userId={user?.id}
          refreshTrigger={categoryRefreshTrigger}
        />

        {isLoading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : displayNotes.length === 0 ? (
          renderEmptyState()
        ) : (
          <View style={styles.notesContainer}>
            {/* Notes section */}
            <View style={styles.allNotesSection}>
              {displayNotes.map((note, index) => (
                <NoteCard
                  key={`${note.id}-${index}`}
                  note={note}
                  onPress={() => handleNotePress(note.id)}
                />
              ))}
            </View>

            {!selectedCategoryId && isLoadingMore && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingMoreText}>Loading more...</Text>
              </View>
            )}
            {!selectedCategoryId && !hasMore && displayNotes.length > 0 && (
              <View style={styles.endContainer}>
                <Text style={styles.endText}>You&apos;ve reached the end</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomActions}>
        <Pressable
          onPress={handleSearch}
          style={styles.searchFab}
        >
          <IconSymbol name="magnifyingglass" size={28} color="#FFFFFF" />
        </Pressable>

        {/* Action Buttons Container - Simple visibility toggle without animations */}
        <View style={styles.actionButtonsContainer}>
          {/* Camera Button */}
          {showActionButtons && (
            <View style={styles.actionButton}>
              <Pressable
                onPress={handleCameraPress}
                style={styles.cameraButton}
                disabled={isNavigating !== null}
              >
                {isNavigating === 'camera' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="camera.fill" size={24} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          )}

          {/* Text Button */}
          {showActionButtons && (
            <View style={[styles.actionButton, styles.textButtonContainer]}>
              <Pressable
                onPress={handleTextPress}
                style={styles.textButton}
                disabled={isNavigating !== null}
              >
                {isNavigating === 'text' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="text.alignleft" size={24} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          )}

          {/* Main FAB */}
          <Pressable
            onPress={toggleActionButtons}
            style={styles.fab}
          >
            <IconSymbol 
              name={showActionButtons ? "xmark" : "plus"} 
              size={28} 
              color="#FFFFFF" 
            />
          </Pressable>
        </View>
      </View>

      {/* Deletion Indicator Modal */}
      <Modal
        visible={isDeletingNote}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.deletionModalContainer}>
          <View style={styles.deletionModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.deletionModalText}>Deleting note...</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
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
  },
  notesContainer: {
    width: '100%',
  },
  allNotesSection: {
    paddingHorizontal: 16,
  },
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingMoreText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  endContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  endText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  headerIcon: {
    width: 36,
    height: 36,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomActions: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  searchFab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.searchAccent,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 16px rgba(74, 144, 226, 0.4)',
    elevation: 8,
  },
  actionButtonsContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButton: {
    position: 'absolute',
    bottom: 70,
  },
  textButtonContainer: {
    bottom: 140,
  },
  cameraButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 12px rgba(255, 107, 122, 0.4)',
    elevation: 6,
  },
  textButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 12px rgba(255, 107, 122, 0.4)',
    elevation: 6,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 16px rgba(255, 107, 53, 0.4)',
    elevation: 8,
  },
  deletionModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletionModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  deletionModalText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
});
