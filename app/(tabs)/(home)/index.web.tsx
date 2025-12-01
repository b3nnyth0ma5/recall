
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Modal, Animated } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { CategoryCarousel } from '@/components/CategoryCarousel';
import { supabase, getImageDataUrl } from '@/utils/supabase';
import { Note } from '@/types/Note';

// Constants
const PULL_THRESHOLD = 80;
const FAB_SIZE = 60;
const ACTION_BUTTON_SIZE = 46.8;
const BUTTON_SPACING = 77;
const DIAGONAL_OFFSET = 54.45;

export default function HomeScreen() {
  // Hooks
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, isDeletingNote } = useNotes();
  const router = useRouter();
  const { user } = useAuth();

  // State - UI
  const [refreshing, setRefreshing] = useState(false);
  const [showActionButtons, setShowActionButtons] = useState(false);
  const [isNavigating, setIsNavigating] = useState<'camera' | 'text' | 'location' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pullIndicatorVisible, setPullIndicatorVisible] = useState(false);
  const [pullIndicatorText, setPullIndicatorText] = useState('Pull to refresh');

  // State - Category filtering
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [loadingFiltered, setLoadingFiltered] = useState(false);
  const [categoryRefreshTrigger, setCategoryRefreshTrigger] = useState(0);

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const previousNotesCountRef = useRef(notes.length);
  const isFirstFocusRef = useRef(true);
  const handleRefreshRef = useRef<(clearCategory?: boolean) => Promise<void>>();
  
  // Pull-to-refresh refs
  const pullStartYRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const isPullingRef = useRef(false);

  // Animation refs
  const cameraButtonAnim = useRef(new Animated.Value(0)).current;
  const textButtonAnim = useRef(new Animated.Value(0)).current;
  const locationButtonAnim = useRef(new Animated.Value(0)).current;

  // ============================================================================
  // Effects
  // ============================================================================

  // Update previous notes count
  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  // Animate FAB buttons
  useEffect(() => {
    if (showActionButtons) {
      Animated.stagger(50, [
        Animated.spring(cameraButtonAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 7,
        }),
        Animated.spring(textButtonAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 7,
        }),
        Animated.spring(locationButtonAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 7,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(cameraButtonAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(textButtonAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(locationButtonAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showActionButtons, cameraButtonAnim, textButtonAnim, locationButtonAnim]);

  // Filter notes by category
  useEffect(() => {
    const filterNotesByCategory = async () => {
      if (!selectedCategoryId) {
        setFilteredNotes([]);
        return;
      }

      if (!user?.id) {
        console.error('[filterNotesByCategory] No user logged in');
        setFilteredNotes([]);
        return;
      }

      try {
        setLoadingFiltered(true);
        console.log('[filterNotesByCategory] Filtering notes by category:', selectedCategoryId);

        // Fetch recollections for this category
        const { data: recollections, error: recollectionsError } = await supabase
          .from('recollections')
          .select('recall_id, match_score, category_id')
          .eq('category_id', selectedCategoryId)
          .eq('user_id', user.id)
          .order('match_score', { ascending: false });

        if (recollectionsError) {
          console.error('[filterNotesByCategory] Error fetching recollections:', recollectionsError);
          setFilteredNotes([]);
          return;
        }

        if (!recollections || recollections.length === 0) {
          console.log('[filterNotesByCategory] No recollections found for this category');
          setFilteredNotes([]);
          return;
        }

        console.log(`[filterNotesByCategory] Found ${recollections.length} recollections`);

        // Extract recall IDs
        const recallIds = recollections.map(r => r.recall_id);
        
        // Fetch the actual recalls
        const { data: recalls, error: recallsError } = await supabase
          .from('recalls')
          .select('*')
          .in('id', recallIds);

        if (recallsError) {
          console.error('[filterNotesByCategory] Error fetching recalls:', recallsError);
          setFilteredNotes([]);
          return;
        }

        if (!recalls || recalls.length === 0) {
          console.log('[filterNotesByCategory] No recalls found');
          setFilteredNotes([]);
          return;
        }

        console.log(`[filterNotesByCategory] Found ${recalls.length} recalls`);

        // Create match score map
        const matchScoreMap = new Map(
          recollections.map(r => [r.recall_id, r.match_score])
        );

        // Process recalls and load images
        const notesWithImages = await Promise.all(
          recalls.map(async (recall) => {
            try {
              // Load images for this recall
              const { data: imagesData, error: imagesError } = await supabase
                .from('recall_images')
                .select('id')
                .eq('recall_id', recall.id)
                .order('created_at', { ascending: true });

              if (imagesError) {
                console.error('[filterNotesByCategory] Error loading images:', imagesError);
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
                    return { url: dataUrl || '', id: img.id };
                  } catch (error) {
                    console.error(`[filterNotesByCategory] Error processing image ${img.id}:`, error);
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
              console.error(`[filterNotesByCategory] Exception processing recall ${recall.id}:`, error);
              return { 
                ...recall, 
                images: [], 
                imageIds: [],
                match_score: matchScoreMap.get(recall.id) || 0
              };
            }
          })
        );

        // Sort by match score
        notesWithImages.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

        console.log(`[filterNotesByCategory] Filtered ${notesWithImages.length} notes`);
        setFilteredNotes(notesWithImages);
      } catch (error) {
        console.error('[filterNotesByCategory] Error filtering notes:', error);
        setFilteredNotes([]);
      } finally {
        setLoadingFiltered(false);
      }
    };

    filterNotesByCategory();
  }, [selectedCategoryId, user?.id]);

  // ============================================================================
  // Focus Effect
  // ============================================================================

  useFocusEffect(
    useCallback(() => {
      console.log('[useFocusEffect] Home screen focused');
      
      // Skip auto-refresh on first focus
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      
      // Check if a new note was created
      const currentCount = notes.length;
      const previousCount = previousNotesCountRef.current;
      
      if (currentCount > previousCount) {
        console.log('[useFocusEffect] New note detected, auto-refreshing...');
        refreshNotes();
      }
      
      // Restore scroll position
      const savedScrollPosition = scrollPositionRef.current;
      if (savedScrollPosition > 0 && scrollViewRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: savedScrollPosition, animated: false });
        }, 100);
      }
      
      return () => {
        console.log('[useFocusEffect] Home screen unfocused');
      };
    }, [notes.length, refreshNotes])
  );

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleRefresh = useCallback(async (clearCategory: boolean = false) => {
    setRefreshing(true);
    console.log('[handleRefresh] Refreshing landing page data...');
    
    try {
      // Refresh categories
      console.log('[handleRefresh] Triggering category refresh...');
      setCategoryRefreshTrigger(prev => prev + 1);
      
      // Refresh notes
      if (selectedCategoryId && !clearCategory) {
        console.log('[handleRefresh] Refreshing filtered notes for category:', selectedCategoryId);
        const currentCategory = selectedCategoryId;
        setSelectedCategoryId(null);
        setTimeout(() => setSelectedCategoryId(currentCategory), 100);
      } else {
        console.log('[handleRefresh] Refreshing all notes...');
        await refreshNotes();
      }
      
      if (clearCategory) {
        setSelectedCategoryId(null);
      }
    } catch (error) {
      console.error('[handleRefresh] Error refreshing data:', error);
    } finally {
      setRefreshing(false);
      console.log('[handleRefresh] Refresh complete');
    }
  }, [selectedCategoryId, refreshNotes]);

  // Store handleRefresh in ref to avoid circular dependencies
  useEffect(() => {
    handleRefreshRef.current = handleRefresh;
  }, [handleRefresh]);

  const handleRecallIconPress = useCallback(async () => {
    console.log('[handleRecallIconPress] Recall icon pressed - clearing categories and reloading');
    
    try {
      setSelectedCategoryId(null);
      
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: true });
      }
      
      await handleRefreshRef.current?.(true);
    } catch (error) {
      console.error('[handleRecallIconPress] Error:', error);
    }
  }, []);

  const handleTouchStart = useCallback((e: any) => {
    try {
      const touch = e.touches?.[0] || e.nativeEvent?.touches?.[0];
      if (touch && scrollPositionRef.current === 0) {
        pullStartYRef.current = touch.clientY;
        isPullingRef.current = true;
      }
    } catch (error) {
      console.error('[handleTouchStart] Error:', error);
    }
  }, []);

  const handleTouchMove = useCallback((e: any) => {
    if (!isPullingRef.current) return;
    
    try {
      const touch = e.touches?.[0] || e.nativeEvent?.touches?.[0];
      if (touch && scrollPositionRef.current === 0) {
        const distance = Math.max(0, touch.clientY - pullStartYRef.current);
        const clampedDistance = Math.min(distance, PULL_THRESHOLD * 1.5);
        pullDistanceRef.current = clampedDistance;
        
        if (clampedDistance > 0) {
          setPullIndicatorVisible(true);
          setPullIndicatorText(clampedDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh');
        }
      }
    } catch (error) {
      console.error('[handleTouchMove] Error:', error);
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    try {
      if (isPullingRef.current && pullDistanceRef.current >= PULL_THRESHOLD) {
        await handleRefreshRef.current?.(false);
      }
    } catch (error) {
      console.error('[handleTouchEnd] Error:', error);
    } finally {
      isPullingRef.current = false;
      pullDistanceRef.current = 0;
      pullStartYRef.current = 0;
      setPullIndicatorVisible(false);
    }
  }, []);

  const toggleActionButtons = useCallback(() => {
    setShowActionButtons(!showActionButtons);
  }, [showActionButtons]);

  const handleCameraPress = useCallback(() => {
    if (isNavigating) return;
    console.log('[handleCameraPress] Camera button pressed');
    setIsNavigating('camera');
    setShowActionButtons(false);
    
    setTimeout(() => {
      try {
        router.push('/note-editor?openCamera=true');
      } catch (error) {
        console.error('[handleCameraPress] Error navigating:', error);
      }
      setTimeout(() => setIsNavigating(null), 1000);
    }, 200);
  }, [isNavigating, router]);

  const handleTextPress = useCallback(() => {
    if (isNavigating) return;
    console.log('[handleTextPress] Text button pressed');
    setIsNavigating('text');
    setShowActionButtons(false);
    
    setTimeout(() => {
      try {
        router.push('/note-editor');
      } catch (error) {
        console.error('[handleTextPress] Error navigating:', error);
      }
      setTimeout(() => setIsNavigating(null), 1000);
    }, 200);
  }, [isNavigating, router]);

  const handleLocationPress = useCallback(() => {
    if (isNavigating) return;
    console.log('[handleLocationPress] Location button pressed');
    setIsNavigating('location');
    setShowActionButtons(false);
    
    setTimeout(() => {
      try {
        router.push('/note-editor?openLocation=true');
      } catch (error) {
        console.error('[handleLocationPress] Error navigating:', error);
      }
      setTimeout(() => setIsNavigating(null), 1000);
    }, 200);
  }, [isNavigating, router]);

  const handleNotePress = useCallback((noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('[handleNotePress] Error navigating:', error);
    }
  }, [router]);

  const handleSearch = useCallback(() => {
    try {
      router.push('/search');
    } catch (error) {
      console.error('[handleSearch] Error navigating:', error);
    }
  }, [router]);

  const handleProfile = useCallback(() => {
    try {
      router.push('/(tabs)/profile');
    } catch (error) {
      console.error('[handleProfile] Error navigating:', error);
    }
  }, [router]);

  const handleCategorySelect = useCallback((categoryId: string | null) => {
    console.log('[handleCategorySelect] Category selected:', categoryId);
    setSelectedCategoryId(categoryId);
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  }, []);

  const handleScroll = useCallback((event: any) => {
    try {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      
      scrollPositionRef.current = contentOffset.y;
      
      if (contentOffset.y > 0 && isPullingRef.current) {
        isPullingRef.current = false;
        pullDistanceRef.current = 0;
        setPullIndicatorVisible(false);
      }
      
      if (selectedCategoryId) {
        return;
      }

      const paddingToBottom = 20;
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

      if (isCloseToBottom && hasMore && !isLoadingMore && !loading) {
        console.log('[handleScroll] Loading more notes...');
        loadMoreNotes();
      }
    } catch (error) {
      console.error('[handleScroll] Error:', error);
    }
  }, [hasMore, isLoadingMore, loading, loadMoreNotes, selectedCategoryId]);

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol name="house.fill" size={80} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>
        {selectedCategoryId ? 'No Recalls in This Category' : 'No Recalls Yet'}
      </Text>
      <Text style={styles.emptyText}>
        {selectedCategoryId 
          ? 'Try selecting a different category or create a new recall'
          : 'Tap the + button to create your first recall'
        }
      </Text>
    </View>
  );

  // ============================================================================
  // Animation Calculations
  // ============================================================================

  const pullProgress = Math.min(pullDistanceRef.current / PULL_THRESHOLD, 1);
  const pullIndicatorOpacity = pullProgress;
  const pullIndicatorScale = 0.5 + (pullProgress * 0.5);

  // Camera button - directly to the left
  const cameraTranslateX = cameraButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -BUTTON_SPACING],
  });
  const cameraTranslateY = cameraButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0],
  });

  // Text button - at 45 degree angle
  const textTranslateX = textButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -DIAGONAL_OFFSET],
  });
  const textTranslateY = textButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -DIAGONAL_OFFSET],
  });

  // Location button - directly above
  const locationTranslateX = locationButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0],
  });
  const locationTranslateY = locationButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -BUTTON_SPACING],
  });

  // ============================================================================
  // Render
  // ============================================================================

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

      {/* Pull-to-refresh indicator */}
      {pullIndicatorVisible && (
        <View 
          style={[
            styles.pullIndicator,
            {
              opacity: pullIndicatorOpacity,
              transform: [{ scale: pullIndicatorScale }],
            }
          ]}
        >
          <Text style={styles.pullIndicatorText}>{pullIndicatorText}</Text>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {/* Main Content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Category Carousel */}
        <View style={styles.categoryCarouselContainer}>
          <CategoryCarousel 
            onCategorySelect={handleCategorySelect}
            selectedCategoryId={selectedCategoryId}
            userId={user?.id}
            refreshTrigger={categoryRefreshTrigger}
          />
        </View>

        {/* Content */}
        {isLoading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : displayNotes.length === 0 ? (
          renderEmptyState()
        ) : (
          <View style={styles.notesContainer}>
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

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {/* Search FAB */}
        <Pressable onPress={handleSearch} style={styles.searchFab}>
          <IconSymbol name="magnifyingglass" size={28} color="#FFFFFF" />
        </Pressable>

        {/* Action Buttons Container */}
        <View style={styles.actionButtonsContainer}>
          {/* Camera Button */}
          {showActionButtons && (
            <Animated.View 
              style={[
                styles.actionButton,
                {
                  transform: [
                    { translateX: cameraTranslateX },
                    { translateY: cameraTranslateY },
                    { scale: cameraButtonAnim },
                  ],
                  opacity: cameraButtonAnim,
                }
              ]}
            >
              <Pressable
                onPress={handleCameraPress}
                style={styles.cameraButton}
                disabled={isNavigating !== null}
              >
                {isNavigating === 'camera' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="camera.fill" size={22} color="#FFFFFF" />
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* Text Button */}
          {showActionButtons && (
            <Animated.View 
              style={[
                styles.actionButton,
                {
                  transform: [
                    { translateX: textTranslateX },
                    { translateY: textTranslateY },
                    { scale: textButtonAnim },
                  ],
                  opacity: textButtonAnim,
                }
              ]}
            >
              <Pressable
                onPress={handleTextPress}
                style={styles.textButton}
                disabled={isNavigating !== null}
              >
                {isNavigating === 'text' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="text.alignleft" size={22} color="#FFFFFF" />
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* Location Button */}
          {showActionButtons && (
            <Animated.View 
              style={[
                styles.actionButton,
                {
                  transform: [
                    { translateX: locationTranslateX },
                    { translateY: locationTranslateY },
                    { scale: locationButtonAnim },
                  ],
                  opacity: locationButtonAnim,
                }
              ]}
            >
              <Pressable
                onPress={handleLocationPress}
                style={styles.locationButton}
                disabled={isNavigating !== null}
              >
                {isNavigating === 'location' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="map.fill" size={22} color="#FFFFFF" />
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* Main FAB */}
          <Pressable onPress={toggleActionButtons} style={styles.fab}>
            <IconSymbol 
              name={showActionButtons ? "xmark" : "plus"} 
              size={28} 
              color="#FFFFFF" 
            />
          </Pressable>
        </View>
      </View>

      {/* Deletion Modal */}
      <Modal visible={isDeletingNote} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.modalText}>Deleting note...</Text>
          </View>
        </View>
      </Modal>

      {/* Saving Modal */}
      <Modal visible={isSaving} transparent={true} animationType="fade">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.modalText}>Saving note...</Text>
          </View>
        </View>
      </Modal>

      {/* Refreshing Overlay */}
      {refreshing && (
        <View style={styles.refreshingOverlay}>
          <View style={styles.refreshingContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.refreshingText}>Refreshing...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

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
  categoryCarouselContainer: {
    paddingTop: 8,
    paddingBottom: 8,
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
    paddingTop: 8,
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
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.searchAccent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  actionButtonsContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    position: 'absolute',
  },
  cameraButton: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    borderRadius: ACTION_BUTTON_SIZE / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B7A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  textButton: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    borderRadius: ACTION_BUTTON_SIZE / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B7A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  locationButton: {
    width: ACTION_BUTTON_SIZE,
    height: ACTION_BUTTON_SIZE,
    borderRadius: ACTION_BUTTON_SIZE / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B7A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  modalText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  pullIndicator: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    paddingVertical: 12,
    gap: 8,
  },
  pullIndicatorText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  refreshingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  refreshingContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    minWidth: 150,
  },
  refreshingText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
});
