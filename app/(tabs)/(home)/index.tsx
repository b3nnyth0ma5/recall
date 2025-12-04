
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
  const [combinedAddSearchEnabled, setCombinedAddSearchEnabled] = useState(false);
  const [loadingPreferences, setLoadingPreferences] = useState(true);

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
          setCombinedAddSearchEnabled(data.combined_add_search_enabled || false);
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
    
    // Navigate directly to note editor
    try {
      router.push('/note-editor');
    } catch (error) {
      console.error('Error navigating to note editor:', error);
    }
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

      // Dismiss keyboard when scrolling
      Keyboard.dismiss();

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

  const handleCreateRecallFromCombined = async (data: {
    text: string;
    images: string[];
    location?: { latitude: number; longitude: number; name: string };
  }) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a recall');
      return;
    }

    try {
      setIsSaving(true);

      // Create the recall
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

      if (recallError) {
        console.error('Error creating recall:', recallError);
        Alert.alert('Error', 'Failed to create recall');
        return;
      }

      // Upload images if any
      if (data.images.length > 0) {
        const uploadPromises = data.images.map(uri =>
          uploadImageToDatabase(uri, recallData.id, 'image/jpeg')
        );
        await Promise.all(uploadPromises);
      }

      // Refresh the notes list
      await refreshNotes();

      // Show success message
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error creating recall:', error);
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

      {/* Main Content ScrollView - Note cards scroll underneath the floating component */}
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

        {loading && !refreshing ? (
          renderSkeletons()
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
        )}
      </ScrollView>

      {/* Combined Search/Add Component - Floating at bottom of screen */}
      {combinedAddSearchEnabled && user && !loadingPreferences && (
        <CombinedSearchAdd
          onCreateRecall={handleCreateRecallFromCombined}
          userId={user.id}
        />
      )}

      {/* Only show FABs if combined add/search is disabled */}
      {!combinedAddSearchEnabled && (
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

          {/* Main Add Recall FAB - Now navigates directly to note editor */}
          <Pressable
            onPress={handleAddRecall}
            style={styles.fab}
          >
            <IconSymbol 
              name="plus" 
              size={24} 
              color="#FFFFFF" 
            />
          </Pressable>
        </View>
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
  scrollContentWithCombined: {
    paddingBottom: 250,
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
