
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image, Modal, Platform, Alert, Keyboard } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { NoteCardSkeleton } from '@/components/NoteCardSkeleton';
import { ZeroState } from '@/components/ZeroState';

export default function HomeScreen() {
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, refreshSingleNote, isDeletingNote, deleteNote } = useNotes();
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
  const insets = useSafeAreaInsets();
  const pendingImageUploadsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const checkForRecalls = async () => {
      if (!user) {
        setHasCheckedForRecalls(true);
        setHasRecalls(false);
        return;
      }

      try {
        const { error, count } = await supabase
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

  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  useFocusEffect(
    useCallback(() => {
      console.log('[useFocusEffect] Home screen focused');
      
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      
      const currentCount = notes.length;
      const previousCount = previousNotesCountRef.current;
      
      if (currentCount > previousCount) {
        console.log('[useFocusEffect] New recall detected, auto-refreshing...');
        refreshNotes();
      }
      
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

  const handleRefresh = async () => {
    setRefreshing(true);
    console.log('[handleRefresh] Refreshing landing page data from Supabase...');
    
    try {
      console.log('[handleRefresh] Refreshing all recalls...');
      await refreshNotes();
      
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
    
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
    
    await handleRefresh();
  };

  const handleAddRecall = () => {
    console.log('[handleAddRecall] Add recall button pressed');
    
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
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
      
      scrollPositionRef.current = contentOffset.y;

      Keyboard.dismiss();

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

      const totalImageCount = data.images.length;
      if (totalImageCount > 0) {
        pendingImageUploadsRef.current.set(recallData.id, totalImageCount);
        console.log(`[handleCreateRecallFromCombined] Tracking ${totalImageCount} pending image uploads for recall ${recallData.id}`);
      }

      if (data.images.length > 0) {
        console.log('[handleCreateRecallFromCombined] Step 2: Uploading images...');
        const imageStartTime = Date.now();
        
        console.log(`[handleCreateRecallFromCombined] Uploading first image synchronously (1/${data.images.length})...`);
        try {
          const firstImageId = await uploadImageToDatabase(data.images[0], recallData.id, 'image/jpeg');
          
          if (firstImageId) {
            console.log(`[handleCreateRecallFromCombined] First image uploaded successfully with ID:`, firstImageId);
          } else {
            console.error(`[handleCreateRecallFromCombined] First image upload failed - no ID returned`);
          }
        } catch (uploadError) {
          console.error(`[handleCreateRecallFromCombined] Exception uploading first image:`, uploadError);
        }
        
        const firstImageDuration = Date.now() - imageStartTime;
        console.log(`[handleCreateRecallFromCombined] First image uploaded in ${firstImageDuration}ms`);
        
        if (data.images.length > 1) {
          console.log(`[handleCreateRecallFromCombined] Uploading remaining ${data.images.length - 1} images asynchronously...`);
          
          (async () => {
            for (let i = 1; i < data.images.length; i++) {
              const uri = data.images[i];
              console.log(`[handleCreateRecallFromCombined] [ASYNC] Uploading image ${i + 1}/${data.images.length}...`);
              
              try {
                const imageId = await uploadImageToDatabase(uri, recallData.id, 'image/jpeg');
                
                if (imageId) {
                  console.log(`[handleCreateRecallFromCombined] [ASYNC] Image ${i + 1} uploaded successfully with ID:`, imageId);
                  
                  console.log(`[handleCreateRecallFromCombined] [ASYNC] Refreshing note ${recallData.id} after image ${i + 1} upload`);
                  await refreshSingleNote(recallData.id);
                } else {
                  console.error(`[handleCreateRecallFromCombined] [ASYNC] Image ${i + 1} upload failed - no ID returned`);
                }
                
                if (i < data.images.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (uploadError) {
                console.error(`[handleCreateRecallFromCombined] [ASYNC] Exception uploading image ${i + 1}:`, uploadError);
              }
            }
            
            console.log(`[handleCreateRecallFromCombined] [ASYNC] All remaining images uploaded`);
            
            pendingImageUploadsRef.current.delete(recallData.id);
            console.log(`[handleCreateRecallFromCombined] [ASYNC] Cleared pending uploads tracking for recall ${recallData.id}`);
            
            console.log(`[handleCreateRecallFromCombined] [ASYNC] Final refresh of note ${recallData.id}`);
            await refreshSingleNote(recallData.id);
          })();
        } else {
          pendingImageUploadsRef.current.delete(recallData.id);
        }
      }

      console.log('[handleCreateRecallFromCombined] Step 3: Refreshing recalls list...');
      await refreshNotes();

      console.log('[handleCreateRecallFromCombined] Recall creation complete!');
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      console.log('[handleCreateRecallFromCombined] Background processing (OCR, people finder) will run asynchronously');
      
    } catch (error) {
      console.error('[handleCreateRecallFromCombined] Exception in recall creation:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    console.log('[handleDeleteNote] Deleting note:', noteId);
    try {
      await deleteNote(noteId);
      console.log('[handleDeleteNote] Note deleted successfully');
    } catch (error) {
      console.error('[handleDeleteNote] Error deleting note:', error);
      Alert.alert('Error', 'Failed to delete recall. Please try again.');
    }
  };

  const renderEmptyState = () => {
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

  const renderSkeletons = () => {
    return (
      <View style={styles.allNotesSection}>
        {[...Array(3)].map((_, index) => (
          <NoteCardSkeleton key={`skeleton-${index}`} />
        ))}
      </View>
    );
  };

  const shouldShowSkeletons = loading && (!hasCheckedForRecalls || notes.length === 0);
  const shouldShowZeroState = hasCheckedForRecalls && !hasRecalls && notes.length === 0 && !loading;
  const shouldShowContent = hasCheckedForRecalls && (hasRecalls || notes.length > 0);

  const getExpectedImageCount = (noteId: string): number | undefined => {
    return pendingImageUploadsRef.current.get(noteId);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

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
        <View style={[styles.customHeader, { paddingTop: insets.top }]}>
          <Pressable 
            onPress={handleRecallIconPress} 
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Image
              source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
              style={styles.headerIcon}
              resizeMode="contain"
            />
          </Pressable>
          
          <Text style={styles.headerTitle}>Recall</Text>
          
          <Pressable 
            onPress={handleProfile} 
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol 
              name="person.circle.fill" 
              size={32} 
              color={colors.text} 
            />
          </Pressable>
        </View>

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
            <View style={styles.allNotesSection}>
              {notes.map((note, index) => (
                <NoteCard
                  key={`${note.id}-${index}`}
                  note={note}
                  onPress={() => handleNotePress(note.id)}
                  onDelete={() => handleDeleteNote(note.id)}
                  loading={false}
                  expectedImageCount={getExpectedImageCount(note.id)}
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

      {combinedAddSearchEnabled && user && !loadingPreferences && (
        <CombinedSearchAdd
          onCreateRecall={handleCreateRecallFromCombined}
          userId={user.id}
        />
      )}

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
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
  },
  headerIconButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 36,
    height: 36,
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
    paddingTop: 3.89,
    paddingBottom: 3.89,
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
