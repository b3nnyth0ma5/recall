
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image, Modal, Platform, Alert, Keyboard } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { CategoryCarousel } from '@/components/CategoryCarousel';
import { CombinedSearchAdd } from '@/components/CombinedSearchAdd';
import { supabase } from '@/utils/supabase';
import { uploadImageToDatabase } from '@/utils/supabase';

export default function HomeScreen() {
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, refreshSingleNote, isDeletingNote } = useNotes();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const previousNotesCountRef = useRef(notes.length);
  const isFirstFocusRef = useRef(true);
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [categoryRefreshTrigger, setCategoryRefreshTrigger] = useState(0);
  const [combinedAddSearchEnabled, setCombinedAddSearchEnabled] = useState(true);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [hasCheckedForRecalls, setHasCheckedForRecalls] = useState(false);
  const [hasRecalls, setHasRecalls] = useState(false);

  // Check if user has any recalls
  useEffect(() => {
    const checkForRecalls = async () => {
      if (!user) {
        setHasCheckedForRecalls(true);
        setHasRecalls(false);
        return;
      }

      try {
        const { data, error, count } = await supabase
          .from('recalls')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .limit(1);

        if (error) {
          console.error('Error checking for recalls:', error);
          setHasRecalls(false);
        } else {
          setHasRecalls((count || 0) > 0);
        }
      } catch (error) {
        console.error('Exception checking for recalls:', error);
        setHasRecalls(false);
      } finally {
        setHasCheckedForRecalls(true);
      }
    };

    checkForRecalls();
  }, [user]);

  // Load user preferences
  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!user) {
        setLoadingPreferences(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('combined_add_search_enabled')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading user preferences:', error);
        } else if (data) {
          setCombinedAddSearchEnabled(data.combined_add_search_enabled !== false);
        }
      } catch (error) {
        console.error('Exception loading user preferences:', error);
      } finally {
        setLoadingPreferences(false);
      }
    };

    loadUserPreferences();
  }, [user]);

  // Update the previous notes count whenever notes change
  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  useFocusEffect(
    useCallback(() => {
      console.log('[useFocusEffect] Home screen focused');
      
      // Skip auto-refresh on first focus (initial load)
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      
      // Check if a new recall was created (notes count increased)
      const currentCount = notes.length;
      const previousCount = previousNotesCountRef.current;
      
      if (currentCount > previousCount) {
        console.log('[useFocusEffect] New recall detected, auto-refreshing...');
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
      console.log('[handleRefresh] Refreshing all recalls...');
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

  const handleAddRecall = () => {
    console.log('[handleAddRecall] Add recall button pressed');
    
    // Haptic feedback when add icon is clicked
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    // Navigate directly to recall editor
    try {
      router.push('/note-editor');
    } catch (error) {
      console.error('Error navigating to recall editor:', error);
    }
  };

  const handleNotePress = (noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to recall editor:', error);
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

      // Dismiss keyboard when scrolling
      Keyboard.dismiss();

      // Load more recalls when near bottom
      const paddingToBottom = 20;
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

      if (isCloseToBottom && hasMore && !isLoadingMore && !loading) {
        console.log('[handleScroll] Loading more recalls...');
        loadMoreNotes();
      }
    } catch (error) {
      console.error('Error handling scroll:', error);
    }
  }, [hasMore, isLoadingMore, loading, loadMoreNotes]);

  const handleCreateRecallFromCombined = async (data: {
    text: string;
    images: string[];
    location?: { latitude: number; longitude: number; name: string };
  }) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a recall');
      return;
    }

    console.log('[handleCreateRecallFromCombined] Starting recall creation');
    console.log('[handleCreateRecallFromCombined] Text length:', data.text.length);
    console.log('[handleCreateRecallFromCombined] Number of images:', data.images.length);
    console.log('[handleCreateRecallFromCombined] Has location:', !!data.location);

    try {
      setIsSaving(true);

      // Step 1: Create the recall first (fast operation)
      console.log('[handleCreateRecallFromCombined] Step 1: Creating recall record...');
      const recallStartTime = Date.now();
      
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert({
          text: data.text,
          user_id: user.id,
          latitude: data.location?.latitude,
          longitude: data.location?.longitude,
          location: data.location?.name,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      const recallDuration = Date.now() - recallStartTime;
      console.log(`[handleCreateRecallFromCombined] Recall created in ${recallDuration}ms`);

      if (recallError) {
        console.error('[handleCreateRecallFromCombined] Error creating recall:', recallError);
        Alert.alert('Error', 'Failed to create recall');
        return;
      }

      console.log('[handleCreateRecallFromCombined] Recall created with ID:', recallData.id);

      // Step 2: Upload first image synchronously, remaining images asynchronously
      if (data.images.length > 0) {
        console.log('[handleCreateRecallFromCombined] Step 2: Uploading first image synchronously...');
        const firstImageStartTime = Date.now();
        
        // Upload first image synchronously
        const firstImageUri = data.images[0];
        console.log(`[handleCreateRecallFromCombined] Uploading first image (1/${data.images.length})...`);
        
        try {
          const firstImageId = await uploadImageToDatabase(firstImageUri, recallData.id, 'image/jpeg');
          
          if (firstImageId) {
            console.log(`[handleCreateRecallFromCombined] First image uploaded successfully with ID:`, firstImageId);
          } else {
            console.error(`[handleCreateRecallFromCombined] First image upload failed - no ID returned`);
          }
        } catch (uploadError) {
          console.error(`[handleCreateRecallFromCombined] Exception uploading first image:`, uploadError);
        }
        
        const firstImageDuration = Date.now() - firstImageStartTime;
        console.log(`[handleCreateRecallFromCombined] First image uploaded in ${firstImageDuration}ms`);

        // Upload remaining images asynchronously in the background
        if (data.images.length > 1) {
          console.log(`[handleCreateRecallFromCombined] Uploading remaining ${data.images.length - 1} images asynchronously in background...`);
          
          // Don't await this - let it run in the background
          (async () => {
            const remainingImages = data.images.slice(1);
            
            for (let i = 0; i < remainingImages.length; i++) {
              const uri = remainingImages[i];
              const imageNumber = i + 2; // +2 because we already uploaded the first image
              console.log(`[handleCreateRecallFromCombined] [ASYNC] Uploading image ${imageNumber}/${data.images.length}...`);
              
              try {
                const imageId = await uploadImageToDatabase(uri, recallData.id, 'image/jpeg');
                
                if (imageId) {
                  console.log(`[handleCreateRecallFromCombined] [ASYNC] Image ${imageNumber} uploaded successfully with ID:`, imageId);
                } else {
                  console.error(`[handleCreateRecallFromCombined] [ASYNC] Image ${imageNumber} upload failed - no ID returned`);
                }
                
                // Small delay between uploads to prevent overwhelming the system
                if (i < remainingImages.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (uploadError) {
                console.error(`[handleCreateRecallFromCombined] [ASYNC] Exception uploading image ${imageNumber}:`, uploadError);
                // Continue with next image even if one fails
              }
            }
            
            console.log(`[handleCreateRecallFromCombined] [ASYNC] All remaining images uploaded`);
          })();
        }
      }

      // Step 3: Refresh the recalls list immediately (don't wait for async uploads)
      console.log('[handleCreateRecallFromCombined] Step 3: Refreshing recalls list...');
      await refreshNotes();

      // Show success feedback
      console.log('[handleCreateRecallFromCombined] Recall creation complete!');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      // Note: OCR, people finder, and category matching are triggered automatically
      // by database triggers in the background. No need to wait for them.
      console.log('[handleCreateRecallFromCombined] Background processing (OCR, people finder) will run asynchronously');
      console.log('[handleCreateRecallFromCombined] Remaining image uploads will continue in background');
      
    } catch (error) {
      console.error('[handleCreateRecallFromCombined] Exception in recall creation:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsSaving(false);
    }
  };

  const renderEmptyState = () => {
    const { ZeroState } = require('@/components/ZeroState');
    return (
      <ZeroState
        icon="doc.text"
        title="No Recalls Yet"
        message="Start capturing your thoughts, memories, and moments"
        actionText="Create Your First Recall"
        onActionPress={handleAddRecall}
        animatedIcon={true}
      />
    );
  };

  // Render skeleton loaders for initial load
  const renderSkeletons = () => {
    return (
      <View style={styles.allNotesSection}>
        {[...Array(3)].map((_, index) => (
          <NoteCard
            key={`skeleton-${index}`}
            note={{} as any}
            onPress={() => {}}
            loading={true}
          />
        ))}
      </View>
    );
  };

  // Determine what to show
  const shouldShowSkeletons = loading && !hasCheckedForRecalls;
  const shouldShowZeroState = hasCheckedForRecalls && !hasRecalls && notes.length === 0 && !loading;
  const shouldShowContent = hasCheckedForRecalls && (hasRecalls || notes.length > 0);

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
        contentContainerStyle={[
          styles.scrollContent,
          combinedAddSearchEnabled && styles.scrollContentWithCombined,
        ]}
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

        {shouldShowSkeletons ? (
          renderSkeletons()
        ) : shouldShowZeroState ? (
          renderEmptyState()
        ) : shouldShowContent ? (
          <View style={styles.notesContainer}>
            {/* Recalls section */}
            <View style={styles.allNotesSection}>
              {notes.map((note, index) => (
                <NoteCard
                  key={`${note.id}-${index}`}
                  note={note}
                  onPress={() => handleNotePress(note.id)}
                  loading={false}
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
        ) : null}
      </ScrollView>

      {/* Combined Search/Add Component - Now at bottom of screen */}
      {combinedAddSearchEnabled && user && !loadingPreferences && (
        <CombinedSearchAdd
          onCreateRecall={handleCreateRecallFromCombined}
          userId={user.id}
        />
      )}

      {/* Deletion Indicator Modal */}
      <Modal
        visible={isDeletingNote}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.deletionModalContainer}>
          <View style={styles.deletionModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.deletionModalText}>Deleting recall...</Text>
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
            <Text style={styles.deletionModalText}>Saving recall...</Text>
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
  scrollContentWithCombined: {
    paddingBottom: 200,
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
