
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image, Modal, Platform, Animated } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { CategoryCarousel } from '@/components/CategoryCarousel';

export default function HomeScreen() {
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, refreshSingleNote, isDeletingNote } = useNotes();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const previousNotesCountRef = useRef(notes.length);
  const isFirstFocusRef = useRef(true);
  const { user } = useAuth();
  const [showActionButtons, setShowActionButtons] = useState(false);
  const [isNavigating, setIsNavigating] = useState<'camera' | 'text' | 'location' | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [categoryRefreshTrigger, setCategoryRefreshTrigger] = useState(0);

  // Animation values for FAB buttons
  const cameraButtonAnim = useRef(new Animated.Value(0)).current;
  const textButtonAnim = useRef(new Animated.Value(0)).current;
  const locationButtonAnim = useRef(new Animated.Value(0)).current;

  // Update the previous notes count whenever notes change
  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  // Animate FAB buttons when showActionButtons changes
  useEffect(() => {
    if (showActionButtons) {
      // Stagger the animations with bounce effect
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
      // Reset animations
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

  const handleRefresh = async () => {
    setRefreshing(true);
    console.log('[handleRefresh] Refreshing landing page data from Supabase...');
    
    try {
      console.log('[handleRefresh] Refreshing all notes...');
      await refreshNotes();
      
      // Refresh categories
      setCategoryRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('[handleRefresh] Error refreshing data:', error);
    } finally {
      setRefreshing(false);
      console.log('[handleRefresh] Refresh complete');
    }
  };

  const handleRecallIconPress = async () => {
    console.log('[handleRecallIconPress] Recall icon pressed - reloading');
    
    // Scroll to top
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
    
    // Reload landing page data
    await handleRefresh();
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

  const handleLocationPress = () => {
    if (isNavigating) return;
    console.log('[handleLocationPress] Location button pressed');
    setIsNavigating('location');
    
    // Haptic feedback when location icon is clicked
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    // Close action buttons
    setShowActionButtons(false);
    
    // Navigate to note editor with location flag to immediately open location selection
    setTimeout(() => {
      router.push('/note-editor?openLocation=true');
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

  const handleScroll = useCallback((event: any) => {
    try {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      
      // Save scroll position to ref (doesn't trigger re-render)
      scrollPositionRef.current = contentOffset.y;

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
  }, [hasMore, isLoadingMore, loading, loadMoreNotes]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol 
        name="doc.text" 
        size={80} 
        color={colors.textTertiary} 
      />
      <Text style={styles.emptyTitle}>No Recalls Yet</Text>
      <Text style={styles.emptyText}>
        Tap the + button to create your first recall
      </Text>
    </View>
  );

  // Calculate button positions with new orientation
  // Camera: directly to the left (-77px, 0px)
  const cameraTranslateX = cameraButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -77],
  });
  const cameraTranslateY = cameraButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0],
  });

  // Text: at 45 degree angle (-54.45px, -54.45px)
  const textTranslateX = textButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -54.45],
  });
  const textTranslateY = textButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -54.45],
  });

  // Location: directly above (0px, -77px)
  const locationTranslateX = locationButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0],
  });
  const locationTranslateY = locationButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -77],
  });

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
            color: colors.primary,
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
              <IconSymbol 
                name="person.circle.fill" 
                size={32} 
                color={colors.text} 
              />
            </Pressable>
          ),
        }}
      />

      {/* Main Content ScrollView - Category Carousel is now inside and scrolls with content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Category Carousel - Now scrolls with content */}
        {user && (
          <View style={styles.categoryCarouselContainer}>
            <CategoryCarousel
              userId={user.id}
              refreshTrigger={categoryRefreshTrigger}
            />
          </View>
        )}

        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : notes.length === 0 ? (
          renderEmptyState()
        ) : (
          <View style={styles.notesContainer}>
            {/* Notes section */}
            <View style={styles.allNotesSection}>
              {notes.map((note, index) => (
                <NoteCard
                  key={`${note.id}-${index}`}
                  note={note}
                  onPress={() => handleNotePress(note.id)}
                />
              ))}
            </View>

            {isLoadingMore && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingMoreText}>Loading more...</Text>
              </View>
            )}
            {!hasMore && notes.length > 0 && (
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
          <IconSymbol 
            name="magnifyingglass" 
            size={24} 
            color={colors.text}
          />
        </Pressable>

        {/* Action Buttons Container with new orientation */}
        <View style={styles.actionButtonsContainer}>
          {/* Camera Button - Directly to the left */}
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
                  <IconSymbol 
                    name="camera.fill" 
                    size={20} 
                    color="#FFFFFF" 
                  />
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* Text Button - At 45 degree angle */}
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
                  <IconSymbol 
                    name="doc.text" 
                    size={20} 
                    color="#FFFFFF" 
                  />
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* Location Button - Directly above */}
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
                  <IconSymbol 
                    name="location.fill" 
                    size={20} 
                    color="#FFFFFF" 
                  />
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* Main FAB */}
          <Pressable
            onPress={toggleActionButtons}
            style={styles.fab}
          >
            <IconSymbol 
              name={showActionButtons ? "xmark" : "plus"} 
              size={24} 
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

      {/* Saving Indicator Modal */}
      <Modal
        visible={isSaving}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.deletionModalContainer}>
          <View style={styles.deletionModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.deletionModalText}>Saving note...</Text>
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
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    zIndex: 100,
    elevation: 100,
  },
  searchFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
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
