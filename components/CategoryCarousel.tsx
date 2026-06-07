
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { debounce } from '@/utils/debounce';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
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

    const debouncedRefresh = debounce(() => {
      console.log('[CategoryCarousel] Real-time category change detected — reloading');
      loadAllUserCategories();
    }, 300);

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
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      console.log('[CategoryCarousel] Cleaning up real-time subscription');
      debouncedRefresh.cancel();
      supabase.removeChannel(channel);
    };
  }, [userId, loadAllUserCategories]);

  const handleCategoryPress = (category: Category) => {
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

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Pressable
          onPress={handleCreatePress}
          style={[styles.categoryItem, styles.categoryItemFirst]}
        >
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
          <Text style={styles.categoryName} numberOfLines={1}>
            New Category
          </Text>
        </Pressable>

        {categories.map((category) => {
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
                {hasUnseen && <View style={styles.unseenDot} />}
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
        })}
      </ScrollView>
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
    top: 4,
    right: 4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF8A8A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
