
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image, Modal } from 'react-native';
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

  const handleRefresh = async () => {
    setRefreshing(true);
    console.log('[handleRefresh] Refreshing landing page data from Supabase...');
    
    try {
      // Refresh categories by triggering a re-render in CategoryCarousel
      console.log('[handleRefresh] Triggering category refresh...');
      setCategoryRefreshTrigger(prev => prev + 1);
      
      // Refresh notes/recalls
      if (selectedCategoryId) {
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

  const handleCreateNote = () => {
    router.push('/note-editor');
  };

  const handleNotePress = (noteId: string) => {
    router.push(`/note-editor?id=${noteId}`);
  };

  const handleSearch = () => {
    router.push('/search');
  };

  const handleProfile = () => {
    router.push('/(tabs)/profile');
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
            <Image
              source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
              style={styles.headerIcon}
              resizeMode="contain"
            />
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
            onRefresh={handleRefresh}
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

        <Pressable
          onPress={handleCreateNote}
          style={styles.fab}
        >
          <IconSymbol name="plus" size={28} color="#FFFFFF" />
        </Pressable>
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
    marginLeft: 8,
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
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
