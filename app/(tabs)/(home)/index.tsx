
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, getImageDataUrl } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Category {
  id: string;
  category_name: string;
  icon_cdn_url: string | null;
}

interface RecollectionWithCategory {
  id: string;
  text: string;
  images: string[];
  imageIds: string[];
  created_at: string;
  updated_at: string;
  latitude?: number;
  longitude?: number;
  location?: string;
  user_id?: string;
  match_score?: number;
}

const CATEGORY_SIZE = 80;
const CATEGORY_SPACING = 12;

export default function HomeScreen() {
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, refreshSingleNote } = useNotes();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollPositionRef = useRef(0);
  const previousNotesCountRef = useRef(notes.length);
  const isFirstFocusRef = useRef(true);
  const { user } = useAuth();

  // Category filtering state
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [filteredNotes, setFilteredNotes] = useState<RecollectionWithCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingFilteredNotes, setLoadingFilteredNotes] = useState(false);

  // DEBUG: Single category for testing
  const [debugCategory, setDebugCategory] = useState<Category | null>(null);

  // Update the previous notes count whenever notes change
  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  // Load categories on mount
  useEffect(() => {
    if (user) {
      loadCategories();
    }
  }, [user]);

  // Update filtered notes when category selection changes
  useEffect(() => {
    if (selectedCategoryId) {
      loadRecollectionsByCategory(selectedCategoryId);
    } else {
      setFilteredNotes([]);
    }
  }, [selectedCategoryId]);

  const loadCategories = async () => {
    if (!user) {
      console.log('No user found, skipping category load');
      return;
    }

    try {
      setLoadingCategories(true);
      console.log('Loading categories for user:', user.id);

      // Get distinct category_ids from recollections for this user
      const { data: recollectionsData, error: recollectionsError } = await supabase
        .from('recollections')
        .select('category_id')
        .eq('user_id', user.id)
        .not('category_id', 'is', null);

      if (recollectionsError) {
        console.error('Error loading recollections:', recollectionsError);
        return;
      }

      console.log('Recollections data:', recollectionsData);

      if (!recollectionsData || recollectionsData.length === 0) {
        console.log('No recollections found for user');
        setCategories([]);
        setDebugCategory(null);
        return;
      }

      // Get unique category IDs and filter out any nulls/undefined
      const uniqueCategoryIds = [...new Set(recollectionsData.map(r => r.category_id))].filter(id => id != null);
      console.log('Found unique category IDs:', uniqueCategoryIds);

      if (uniqueCategoryIds.length === 0) {
        console.log('No valid category IDs found');
        setCategories([]);
        setDebugCategory(null);
        return;
      }

      // Fetch category details
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('recollection_categories')
        .select('id, category_name, icon_cdn_url')
        .in('id', uniqueCategoryIds);

      if (categoriesError) {
        console.error('Error loading categories:', categoriesError);
        return;
      }

      console.log('Loaded categories:', categoriesData);
      setCategories(categoriesData || []);
      
      // DEBUG: Set only the first category for testing
      if (categoriesData && categoriesData.length > 0) {
        const firstCategory = categoriesData[0];
        console.log('DEBUG: Setting first category for testing:', firstCategory);
        setDebugCategory(firstCategory);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadRecollectionsByCategory = async (categoryId: string) => {
    if (!user) return;

    try {
      setLoadingFilteredNotes(true);
      console.log('Loading recollections for category:', categoryId);

      // Get recollections for this category, sorted by match_score
      const { data: recollectionsData, error: recollectionsError } = await supabase
        .from('recollections')
        .select('recall_id, match_score')
        .eq('user_id', user.id)
        .eq('category_id', categoryId)
        .order('match_score', { ascending: false });

      if (recollectionsError) {
        console.error('Error loading recollections:', recollectionsError);
        return;
      }

      if (!recollectionsData || recollectionsData.length === 0) {
        console.log('No recollections found for category');
        setFilteredNotes([]);
        return;
      }

      // Get recall IDs
      const recallIds = recollectionsData.map(r => r.recall_id);
      console.log('Found recall IDs:', recallIds);

      // Fetch recall details
      const { data: recallsData, error: recallsError } = await supabase
        .from('recalls')
        .select('*')
        .in('id', recallIds);

      if (recallsError) {
        console.error('Error loading recalls:', recallsError);
        return;
      }

      // Load images for each recall
      const notesWithImages = await Promise.all(
        (recallsData || []).map(async (recall) => {
          try {
            const { data: imagesData, error: imagesError } = await supabase
              .from('recall_images')
              .select('id')
              .eq('recall_id', recall.id)
              .order('created_at', { ascending: true });

            if (imagesError) {
              console.error('Error loading images for recall:', recall.id, imagesError);
              return { ...recall, images: [], imageIds: [], match_score: 0 };
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

            // Find the match_score for this recall
            const recollection = recollectionsData.find(r => r.recall_id === recall.id);
            const matchScore = recollection?.match_score || 0;

            return {
              ...recall,
              images: validImageUrls,
              imageIds: imageIds,
              match_score: matchScore,
            };
          } catch (error) {
            console.error(`Exception processing recall ${recall.id}:`, error);
            return { ...recall, images: [], imageIds: [], match_score: 0 };
          }
        })
      );

      // Sort by match_score (highest first)
      const sortedNotes = notesWithImages.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

      console.log('Loaded filtered notes:', sortedNotes.length);
      setFilteredNotes(sortedNotes);
    } catch (error) {
      console.error('Error loading recollections by category:', error);
    } finally {
      setLoadingFilteredNotes(false);
    }
  };

  const handleCategoryPress = (categoryId: string) => {
    if (selectedCategoryId === categoryId) {
      // If clicking the same category, deselect it (return to default view)
      setSelectedCategoryId(null);
    } else {
      // Select the new category
      setSelectedCategoryId(categoryId);
    }
  };

  const handleClearFilter = () => {
    setSelectedCategoryId(null);
  };

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
        // Reload categories in case new categories were added
        loadCategories();
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
    await loadCategories();
    // Reload filtered notes if a category is selected
    if (selectedCategoryId) {
      await loadRecollectionsByCategory(selectedCategoryId);
    }
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
    
    // Only load more notes when not filtering by category
    if (!selectedCategoryId) {
      // Load more notes when near bottom
      const paddingToBottom = 20;
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

      if (isCloseToBottom && hasMore && !isLoadingMore && !loading) {
        console.log('Loading more notes...');
        loadMoreNotes();
      }
    }
  }, [hasMore, isLoadingMore, loading, loadMoreNotes, selectedCategoryId]);

  const renderEmptyState = () => (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
      <IconSymbol name="note.text" size={80} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>No Recalls Yet</Text>
      <Text style={styles.emptyText}>
        Tap the + button to create your first recall
      </Text>
    </Animated.View>
  );

  const renderCategoryFilteredEmptyState = () => (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
      <IconSymbol name="tray" size={80} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>No Recalls in This Category</Text>
      <Text style={styles.emptyText}>
        Try selecting a different category or create a new recall
      </Text>
    </Animated.View>
  );

  // Determine which notes to display
  const displayNotes = selectedCategoryId ? filteredNotes : notes;
  const isDisplayLoading = selectedCategoryId ? loadingFilteredNotes : loading;

  console.log('Render - Categories count:', categories.length);
  console.log('Render - Categories:', categories);
  console.log('Render - Debug category:', debugCategory);

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

      {/* DEBUG: Single Category Display */}
      {loadingCategories ? (
        <View style={styles.categoryLoadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.debugText}>Loading categories...</Text>
        </View>
      ) : debugCategory ? (
        <Animated.View entering={FadeIn.duration(400)} style={styles.categoryDebugSection}>
          <Text style={styles.debugTitle}>DEBUG: Single Category Test</Text>
          <View style={styles.debugInfo}>
            <Text style={styles.debugText}>Category ID: {debugCategory.id}</Text>
            <Text style={styles.debugText}>Name: {debugCategory.category_name}</Text>
            <Text style={styles.debugText}>Icon URL: {debugCategory.icon_cdn_url || 'null'}</Text>
            <Text style={styles.debugText}>Total Categories: {categories.length}</Text>
          </View>
          
          <View style={styles.categoryDebugDisplay}>
            <Pressable
              onPress={() => handleCategoryPress(debugCategory.id)}
              style={styles.categoryReelItem}
            >
              <LinearGradient
                colors={selectedCategoryId === debugCategory.id 
                  ? ['#FF6B35', '#F7931E', '#FDC830']
                  : ['rgba(255, 107, 53, 0.3)', 'rgba(247, 147, 30, 0.3)', 'rgba(253, 200, 48, 0.3)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.categoryGradientBorder}
              >
                <View style={styles.categoryImageContainer}>
                  {debugCategory.icon_cdn_url ? (
                    <Image
                      source={{ uri: debugCategory.icon_cdn_url }}
                      style={styles.categoryImage}
                      resizeMode="cover"
                      onError={(e) => console.log('Image load error:', e.nativeEvent.error)}
                      onLoad={() => console.log('Image loaded successfully')}
                    />
                  ) : (
                    <View style={styles.categoryPlaceholder}>
                      <IconSymbol 
                        name="folder.fill" 
                        size={32} 
                        color={colors.textSecondary} 
                      />
                    </View>
                  )}
                </View>
              </LinearGradient>
              <Text style={styles.categoryLabel} numberOfLines={1}>
                {debugCategory.category_name}
              </Text>
            </Pressable>
          </View>

          {selectedCategoryId && (
            <Pressable onPress={handleClearFilter} style={styles.clearFilterButton}>
              <Text style={styles.clearFilterText}>Clear Filter</Text>
            </Pressable>
          )}
        </Animated.View>
      ) : (
        <View style={styles.categoryLoadingContainer}>
          <Text style={styles.debugText}>No categories found</Text>
        </View>
      )}

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
        {isDisplayLoading && !refreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : displayNotes.length === 0 ? (
          selectedCategoryId ? renderCategoryFilteredEmptyState() : renderEmptyState()
        ) : (
          <View style={styles.notesContainer}>
            {/* Notes section */}
            <View style={styles.allNotesSection}>
              {displayNotes.map((note) => (
                <NoteCard
                  key={note.id}
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
  // DEBUG: Category Debug Section
  categoryDebugSection: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 8,
  },
  debugInfo: {
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  debugText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  categoryDebugDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  clearFilterButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 8,
  },
  clearFilterText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryLoadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  categoryReelItem: {
    alignItems: 'center',
    marginHorizontal: CATEGORY_SPACING,
    width: CATEGORY_SIZE + 6,
  },
  categoryGradientBorder: {
    width: CATEGORY_SIZE + 6,
    height: CATEGORY_SIZE + 6,
    borderRadius: (CATEGORY_SIZE + 6) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryImageContainer: {
    width: CATEGORY_SIZE,
    height: CATEGORY_SIZE,
    borderRadius: CATEGORY_SIZE / 2,
    backgroundColor: colors.background,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  categoryImage: {
    width: CATEGORY_SIZE - 6,
    height: CATEGORY_SIZE - 6,
    borderRadius: (CATEGORY_SIZE - 6) / 2,
  },
  categoryPlaceholder: {
    width: CATEGORY_SIZE - 6,
    height: CATEGORY_SIZE - 6,
    borderRadius: (CATEGORY_SIZE - 6) / 2,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    maxWidth: CATEGORY_SIZE + 6,
    textAlign: 'center',
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
