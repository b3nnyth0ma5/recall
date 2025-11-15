
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import Animated, { FadeIn } from 'react-native-reanimated';
import { supabase } from '@/utils/supabase';

interface Category {
  id: string;
  category_name: string;
  icon_cdn_url: string | null;
  recollection_count?: number;
}

interface CategoryCarouselProps {
  onCategorySelect?: (categoryId: string | null) => void;
  selectedCategoryId?: string | null;
  userId?: string;
  refreshTrigger?: number;
}

const CATEGORY_SIZE = 80;
const CATEGORY_SPACING = 20;

export function CategoryCarousel({ onCategorySelect, selectedCategoryId, userId, refreshTrigger }: CategoryCarouselProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCategoriesWithRecollections = useCallback(async () => {
    console.log('[CategoryCarousel] loadCategoriesWithRecollections called with userId:', userId);
    
    if (!userId) {
      console.log('[CategoryCarousel] No user ID provided, skipping category load');
      setCategories([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('[CategoryCarousel] Loading categories with recollections from Supabase for user:', userId);
      
      // Use RPC or direct query to get categories with recollections
      // First get all category IDs that have recollections for this user
      const { data: recollectionsData, error: recollectionsError } = await supabase
        .from('recollections')
        .select('category_id')
        .eq('user_id', userId);

      console.log('[CategoryCarousel] Recollections query result:', { 
        count: recollectionsData?.length, 
        error: recollectionsError 
      });

      if (recollectionsError) {
        console.error('[CategoryCarousel] Error loading recollections:', recollectionsError);
        setCategories([]);
        setLoading(false);
        return;
      }

      if (!recollectionsData || recollectionsData.length === 0) {
        console.log('[CategoryCarousel] No recollections found for user');
        setCategories([]);
        setLoading(false);
        return;
      }

      // Get unique category IDs
      const categoryIds = [...new Set(recollectionsData.map(r => r.category_id))];
      console.log(`[CategoryCarousel] Found ${categoryIds.length} unique category IDs`);

      // Fetch category details for these IDs
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('recollection_categories')
        .select('id, category_name, icon_cdn_url')
        .in('id', categoryIds)
        .order('category_name', { ascending: true });

      console.log('[CategoryCarousel] Categories query result:', { 
        count: categoriesData?.length, 
        error: categoriesError,
        categories: categoriesData?.map(c => c.category_name)
      });

      if (categoriesError) {
        console.error('[CategoryCarousel] Error loading categories:', categoriesError);
        setCategories([]);
        setLoading(false);
        return;
      }

      console.log(`[CategoryCarousel] Successfully loaded ${categoriesData?.length || 0} categories`);
      setCategories(categoriesData || []);
    } catch (error) {
      console.error('[CategoryCarousel] Exception loading categories:', error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    console.log('[CategoryCarousel] useEffect triggered - userId:', userId, 'refreshTrigger:', refreshTrigger);
    if (userId) {
      loadCategoriesWithRecollections();
    } else {
      console.log('[CategoryCarousel] No userId, setting empty categories');
      setCategories([]);
      setLoading(false);
    }
  }, [userId, refreshTrigger, loadCategoriesWithRecollections]);

  const handleCategoryPress = (category: Category) => {
    if (!onCategorySelect) {
      return;
    }

    // If already selected, deselect it
    if (selectedCategoryId === category.id) {
      console.log('[CategoryCarousel] Deselecting category:', category.id);
      onCategorySelect(null);
    } else {
      console.log('[CategoryCarousel] Selecting category:', category.id);
      onCategorySelect(category.id);
    }
  };

  console.log('[CategoryCarousel] Render - loading:', loading, 'categories.length:', categories.length);

  if (loading) {
    console.log('[CategoryCarousel] Rendering loading state');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading categories...</Text>
      </View>
    );
  }

  // Show zero state if no categories with recollections
  if (categories.length === 0) {
    console.log('[CategoryCarousel] Rendering zero state');
    return (
      <Animated.View entering={FadeIn.duration(400)} style={styles.zeroStateContainer}>
        <Text style={styles.zeroStateText}>
          Create your first recall to see categories here
        </Text>
      </Animated.View>
    );
  }

  console.log('[CategoryCarousel] Rendering categories carousel with', categories.length, 'categories');

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((category, index) => {
          const isSelected = selectedCategoryId === category.id;
          
          return (
            <Pressable
              key={category.id}
              onPress={() => handleCategoryPress(category)}
              style={[
                styles.categoryItem,
                index === 0 && styles.categoryItemFirst,
              ]}
            >
              <View
                style={[
                  styles.categoryImageContainer,
                  isSelected && styles.categoryImageContainerSelected,
                ]}
              >
                {category.icon_cdn_url ? (
                  <Image
                    source={{ uri: category.icon_cdn_url }}
                    style={styles.categoryImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.categoryPlaceholder}>
                    <Text style={styles.categoryPlaceholderText}>
                      {category.category_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  zeroStateContainer: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },
  zeroStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  container: {
    marginBottom: 16,
    paddingTop: 8,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: CATEGORY_SPACING,
    width: CATEGORY_SIZE,
  },
  categoryItemFirst: {
    marginLeft: 8,
  },
  categoryImageContainer: {
    width: CATEGORY_SIZE,
    height: CATEGORY_SIZE,
    borderRadius: CATEGORY_SIZE / 2,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 2,
    borderColor: colors.border || colors.textTertiary,
  },
  categoryImageContainerSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight || colors.cardBackground,
  },
  categoryImage: {
    width: CATEGORY_SIZE - 30,
    height: CATEGORY_SIZE - 30,
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
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: CATEGORY_SIZE,
  },
  categoryNameSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
