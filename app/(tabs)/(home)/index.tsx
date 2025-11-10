
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import Animated, { FadeIn } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_ITEM_WIDTH = SCREEN_WIDTH - 48;
const CAROUSEL_ITEM_SPACING = 16;

export default function HomeScreen() {
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, refreshSingleNote } = useNotes();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const carouselScrollRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const previousNotesCountRef = useRef(notes.length);
  const isFirstFocusRef = useRef(true);

  // Update the previous notes count whenever notes change
  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  useFocusEffect(
    useCallback(() => {
      console.log('Home screen focused');
      
      // Skip auto-refresh on first focus (initial load)
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        return;
      }
      
      // Check if a new note was created (notes count increased)
      const currentCount = notes.length;
      const previousCount = previousNotesCountRef.current;
      
      if (currentCount > previousCount) {
        console.log('New note detected, auto-refreshing...');
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
        console.log('Home screen unfocused');
      };
    }, [notes.length, refreshNotes])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshNotes();
    setRefreshing(false);
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

  const handleScroll = useCallback((event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    
    // Save scroll position to ref (doesn't trigger re-render)
    scrollPositionRef.current = contentOffset.y;
    
    // Load more notes when near bottom
    const paddingToBottom = 20;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isCloseToBottom && hasMore && !isLoadingMore && !loading) {
      console.log('Loading more notes...');
      loadMoreNotes();
    }
  }, [hasMore, isLoadingMore, loading, loadMoreNotes]);

  const handleCarouselScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / (CAROUSEL_ITEM_WIDTH + CAROUSEL_ITEM_SPACING));
    setActiveCarouselIndex(index);
  };

  const renderEmptyState = () => (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
      <IconSymbol name="note.text" size={80} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>No Recalls Yet</Text>
      <Text style={styles.emptyText}>
        Tap the + button to create your first recall
      </Text>
    </Animated.View>
  );

  // Get notes with images for the carousel
  const notesWithImages = notes.filter(note => note.images && note.images.length > 0);

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
          headerTitleAlign: 'left',
          headerTitleStyle: {
            fontSize: 32,
            fontWeight: 'bold',
          },
          headerRight: () => (
            <Pressable onPress={handleProfile} style={styles.headerButton}>
              <IconSymbol name="person.circle.fill" size={28} color={colors.text} />
            </Pressable>
          ),
        }}
      />

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
        {loading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : notes.length === 0 ? (
          renderEmptyState()
        ) : (
          <View style={styles.notesContainer}>
            {/* Carousel for notes with images */}
            {notesWithImages.length > 0 && (
              <View style={styles.carouselSection}>
                <Text style={styles.sectionTitle}>Recent Recalls with Images</Text>
                <ScrollView
                  ref={carouselScrollRef}
                  horizontal
                  pagingEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  snapToInterval={CAROUSEL_ITEM_WIDTH + CAROUSEL_ITEM_SPACING}
                  snapToAlignment="start"
                  contentContainerStyle={styles.carouselContentContainer}
                  onScroll={handleCarouselScroll}
                  scrollEventThrottle={16}
                >
                  {notesWithImages.slice(0, 5).map((note, index) => (
                    <View 
                      key={note.id} 
                      style={[
                        styles.carouselItem,
                        index === 0 && styles.carouselItemFirst,
                        index === notesWithImages.slice(0, 5).length - 1 && styles.carouselItemLast,
                      ]}
                    >
                      <NoteCard
                        note={note}
                        onPress={() => handleNotePress(note.id)}
                      />
                    </View>
                  ))}
                </ScrollView>
                
                {/* Pagination dots */}
                {notesWithImages.slice(0, 5).length > 1 && (
                  <View style={styles.paginationContainer}>
                    {notesWithImages.slice(0, 5).map((_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.paginationDot,
                          index === activeCarouselIndex && styles.paginationDotActive,
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* All notes section */}
            <View style={styles.allNotesSection}>
              <Text style={styles.sectionTitle}>All Recalls</Text>
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
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
          <IconSymbol name="magnifyingglass" size={28} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={handleCreateNote}
          style={styles.fab}
        >
          <IconSymbol name="plus" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
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
  carouselSection: {
    marginBottom: 24,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  carouselContentContainer: {
    paddingVertical: 8,
  },
  carouselItem: {
    width: CAROUSEL_ITEM_WIDTH,
    marginRight: CAROUSEL_ITEM_SPACING,
  },
  carouselItemFirst: {
    marginLeft: 24,
  },
  carouselItemLast: {
    marginRight: 24,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textTertiary,
    opacity: 0.3,
  },
  paginationDotActive: {
    backgroundColor: colors.primary,
    opacity: 1,
    width: 24,
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
});
