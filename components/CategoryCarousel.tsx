import React, { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from '@/utils/debounce';
import { View, Text, StyleSheet, Pressable, FlatList, Platform, ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { cdnVariant } from '@/utils/cdnVariant';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { IconSymbol } from './IconSymbol';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { CategoryCarouselSkeleton } from './CategoryCarouselSkeleton';

interface Category {
  id: string;
  category_name: string;
  icon_cdn_url: string | null;
  recollection_count?: number;
  created_at: string;
  last_match_at: string | null;
  last_viewed_at: string | null;
}

interface CategoryCarouselProps {
  onCategorySelect?: (categoryId: string | null) => void;
  selectedCategoryId?: string | null;
  userId?: string;
  refreshTrigger?: number;
}

const CATEGORY_SIZE = 74;
const CATEGORY_SPACING = 11;

export function CategoryCarousel({ onCategorySelect, selectedCategoryId, userId, refreshTrigger }: CategoryCarouselProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const flatListRef = useRef<FlatList<Category>>(null);
  const viewableItemsRef = useRef<Set<number>>(new Set());

  const loadAllUserCategories = useCallback(async () => {
    if (!userId) {
      console.log('No user ID provided, skipping category load');
      setCategories([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('[CategoryCarousel] Loading all user categories from Supabase for user:', userId);
      
      // Fetch all categories for this user, sorted by most recent first
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('recollection_categories')
        .select('id, category_name, icon_cdn_url, created_at, last_match_at, last_viewed_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (categoriesError) {
        console.error('[CategoryCarousel] Error loading categories:', categoriesError);
        setCategories([]);
        return;
      }

      console.log(`[CategoryCarousel] Loaded ${categoriesData?.length || 0} categories from Supabase`);
      setCategories(categoriesData || []);
    } catch (error) {
      console.error('[CategoryCarousel] Error loading categories:', error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load categories on mount and when refreshTrigger changes
  useEffect(() => {
    if (userId) {
      loadAllUserCategories();
    } else {
      setCategories([]);
      setLoading(false);
    }
  }, [userId, refreshTrigger, loadAllUserCategories]);

  // Focus-based refetch as a safety net for slow/missed realtime events
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        console.log('[CategoryCarousel] Screen focused — refetching categories');
        loadAllUserCategories();
      }
    }, [userId, loadAllUserCategories])
  );

  // Set up real-time subscription for category changes
  useEffect(() => {
    if (!userId) {
      return;
    }

    const channelName = `realtime:${userId}:recollection_categories:${Math.random().toString(36).slice(2, 8)}`;
    console.log('[CategoryCarousel] Setting up real-time subscription for categories, channel:', channelName);

    // Subscribe to changes in recollection_categories table
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recollection_categories',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const eventType = payload.eventType ?? payload.type;

          if (eventType === 'UPDATE') {
            const updated = payload.new as Partial<Category> & { id: string };
            if (!updated?.id) {
              console.log('[CategoryCarousel] Real-time UPDATE missing id, reloading');
              loadAllUserCategories();
              return;
            }

            setCategories(prev => {
              const index = prev.findIndex(c => c.id === updated.id);
              if (index === -1) {
                // Unknown category — reload to pick it up
                loadAllUserCategories();
                return prev;
              }

              const prevCategory = prev[index];
              const newLastMatchAt = updated.last_match_at !== undefined
                ? updated.last_match_at
                : prevCategory.last_match_at;

              // Detect whether last_match_at actually changed / became newer
              const prevMatchAt = prevCategory.last_match_at;
              const matchAtChanged =
                newLastMatchAt !== null &&
                (prevMatchAt === null ||
                  new Date(newLastMatchAt) > new Date(prevMatchAt));

              const merged: Category = {
                ...prevCategory,
                ...(updated.last_match_at !== undefined && { last_match_at: updated.last_match_at }),
                ...(updated.last_viewed_at !== undefined && { last_viewed_at: updated.last_viewed_at }),
                ...(updated.category_name !== undefined && { category_name: updated.category_name }),
                ...(updated.icon_cdn_url !== undefined && { icon_cdn_url: updated.icon_cdn_url }),
              };

              const next = [...prev];
              next[index] = merged;

              if (matchAtChanged) {
                console.log('[CategoryCarousel] last_match_at updated for category:', updated.id, '— checking visibility');
                setTimeout(() => {
                  if (!viewableItemsRef.current.has(index)) {
                    console.log('[CategoryCarousel] Category not visible, scrolling to index:', index);
                    flatListRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
                  } else {
                    console.log('[CategoryCarousel] Category already visible, no scroll needed');
                  }
                }, 300);
              }

              return next;
            });
          } else {
            // INSERT or DELETE — reload
            console.log('[CategoryCarousel] Real-time category change detected — reloading');
            const debouncedRefresh = debounce(() => {
              loadAllUserCategories();
            }, 300);
            debouncedRefresh();
          }
        },
      )
      .subscribe();

    return () => {
      console.log('[CategoryCarousel] Cleaning up real-time subscription');
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [userId, loadAllUserCategories]);

  // Stable viewability config and callback pair (must not change between renders)
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const newSet = new Set<number>();
      viewableItems.forEach(item => {
        if (item.index !== null && item.index !== undefined) {
          newSet.add(item.index);
        }
      });
      viewableItemsRef.current = newSet;
    },
    [],
  );

  const viewabilityConfigCallbackPairs = useRef([
    { viewabilityConfig, onViewableItemsChanged },
  ]);

  const handleScrollToIndexFailed = useCallback(() => {
    // No-op: FlatList sometimes fires this for offscreen indices
  }, []);

  const handleCategoryPress = (category: Category) => {
    console.log('User tapped category:', category.id, category.category_name);
    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }

    // Navigate to category viewer
    router.push(`/(tabs)/(home)/category-viewer?id=${category.id}`);
  };

  const handleCreatePress = () => {
    console.log('User tapped Create Category button');
    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    // Navigate to create category screen
    router.push('/(tabs)/(home)/create-category');
  };

  // Show skeleton loader while loading
  if (loading) {
    return <CategoryCarouselSkeleton />;
  }

  // Show zero state if no categories exist
  if (categories.length === 0) {
    return (
      <View style={styles.zeroStateContainer}>
        <Pressable onPress={handleCreatePress} style={styles.zeroStateCard}>
          <View style={styles.zeroStateIconContainer}>
            <IconSymbol name="folder" size={40} color={colors.primary} />
          </View>
          <View style={styles.zeroStateTextContainer}>
            <Text style={styles.zeroStateTitle}>No Categories Yet</Text>
            <Text style={styles.zeroStateMessage}>
              Create smart categories for your recalls
            </Text>
          </View>
          <View style={styles.zeroStateArrow}>
            <IconSymbol name="plus" size={24} color={colors.primary} />
          </View>
        </Pressable>
      </View>
    );
  }

  const createButton = (
    <Pressable
      onPress={handleCreatePress}
      style={[styles.categoryItem, styles.categoryItemFirst]}
    >
      <View style={styles.categoryImageWrapper}>
        <View style={[styles.categoryImageContainer, styles.createCategoryContainer]}>
          {/* Transparent background with plus icon in primary color */}
          <View style={styles.createCategoryBackground}>
            <IconSymbol 
              name="plus" 
              size={32} 
              color={colors.primary} 
            />
          </View>
        </View>
      </View>
      <Text style={styles.categoryName} numberOfLines={1}>
        New Category
      </Text>
    </Pressable>
  );

  const renderCategory = ({ item: category }: { item: Category }) => {
    const isSelected = selectedCategoryId === category.id;
    const hasUnseen = !!category.last_match_at && (
      !category.last_viewed_at ||
      new Date(category.last_match_at) > new Date(category.last_viewed_at)
    );
    
    return (
      <Pressable
        key={category.id}
        onPress={() => handleCategoryPress(category)}
        style={styles.categoryItem}
      >
        <View style={styles.categoryImageWrapper}>
          <View
            style={[
              styles.categoryImageContainer,
              isSelected && styles.categoryImageContainerSelected,
            ]}
          >
            {category.icon_cdn_url ? (
              // cdnVariant 'thumbnail' requires the variant in Cloudflare Images dashboard.
              // If absent, cdnVariant is a no-op — still benefits from expo-image caching.
              <Image
                source={{ uri: cdnVariant(category.icon_cdn_url, 'thumbnail') as string }}
                style={styles.categoryImage}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.categoryPlaceholder}>
                <Text style={styles.categoryPlaceholderText}>
                  {category.category_name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          {hasUnseen && <View testID={`unseen-dot-${category.id}`} style={styles.unseenDot} />}
        </View>
        <Text
          style={[
            styles.categoryName,
            isSelected && styles.categoryNameSelected,
          ]}
          numberOfLines={1}
        >
          {category.category_name}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={categories}
        keyExtractor={item => item.id}
        renderItem={renderCategory}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={createButton}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs.current}
        onScrollToIndexFailed={handleScrollToIndexFailed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  zeroStateContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  zeroStateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  zeroStateIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zeroStateTextContainer: {
    flex: 1,
  },
  zeroStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  zeroStateMessage: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  zeroStateArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    marginBottom: 12,
    paddingTop: 0,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingVertical: -8,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: CATEGORY_SPACING,
    width: CATEGORY_SIZE,
  },
  categoryItemFirst: {
    // No asymmetric marginLeft — scrollContent paddingHorizontal provides the leading inset
  },
  categoryImageWrapper: {
    width: CATEGORY_SIZE,
    height: CATEGORY_SIZE,
    marginBottom: 6,
  },
  categoryImageContainer: {
    width: CATEGORY_SIZE,
    height: CATEGORY_SIZE,
    borderRadius: CATEGORY_SIZE / 2,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  unseenDot: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 10,
    backgroundColor: colors.appleRed,
    borderWidth: 1,
    borderColor: '#000000',
    zIndex: 2,
  },
  createCategoryContainer: {
    borderColor: colors.primary,
    borderWidth: 3,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
  },
  createCategoryBackground: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  categoryImageContainerSelected: {
    borderColor: colors.primary,
    borderWidth: 3,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
  },
  categoryImage: {
    width: CATEGORY_SIZE - 6,
    height: CATEGORY_SIZE - 6,
    borderRadius: (CATEGORY_SIZE - 6) / 2,
  },
  categoryPlaceholder: {
    width: CATEGORY_SIZE - 16,
    height: CATEGORY_SIZE - 16,
    borderRadius: (CATEGORY_SIZE - 16) / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryPlaceholderText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  categoryName: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
    width: CATEGORY_SIZE,
    maxWidth: CATEGORY_SIZE,
    fontWeight: '500',
  },
  categoryNameSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
});
