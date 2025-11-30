
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { IconSymbol } from './IconSymbol';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

interface Category {
  id: string;
  category_name: string;
  icon_cdn_url: string | null;
  recollection_count?: number;
  is_matching?: boolean;
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
      
      // Fetch all categories for this user
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('recollection_categories')
        .select('id, category_name, icon_cdn_url, is_matching')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

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

  useEffect(() => {
    if (userId) {
      loadAllUserCategories();
    } else {
      setCategories([]);
      setLoading(false);
    }
  }, [userId, refreshTrigger, loadAllUserCategories]);

  const handleCategoryPress = (category: Category) => {
    if (!onCategorySelect) {
      return;
    }

    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }

    // If already selected, deselect it
    if (selectedCategoryId === category.id) {
      console.log('Deselecting category:', category.id);
      onCategorySelect(null);
    } else {
      console.log('Selecting category:', category.id);
      onCategorySelect(category.id);
    }
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
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
        {/* Create Your Own Category Button - Always First */}
        <Pressable
          onPress={handleCreatePress}
          style={[styles.categoryItem, styles.categoryItemFirst]}
        >
          <View style={[styles.categoryImageContainer, styles.createCategoryContainer]}>
            <IconSymbol 
              ios_icon_name="plus.circle.fill" 
              android_material_icon_name="add_circle" 
              size={40} 
              color={colors.primary} 
            />
            {/* Plus badge on bottom left */}
            <View style={styles.plusBadge}>
              <IconSymbol 
                ios_icon_name="plus" 
                android_material_icon_name="add" 
                size={12} 
                color="#FFFFFF" 
              />
            </View>
          </View>
          <Text style={styles.categoryName} numberOfLines={1}>
            Create
          </Text>
        </Pressable>

        {/* User Categories */}
        {categories.map((category) => {
          const isSelected = selectedCategoryId === category.id;
          
          return (
            <Pressable
              key={category.id}
              onPress={() => handleCategoryPress(category)}
              style={styles.categoryItem}
            >
              <View
                style={[
                  styles.categoryImageContainer,
                  isSelected && styles.categoryImageContainerSelected,
                ]}
              >
                {category.is_matching ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : category.icon_cdn_url ? (
                  <Image
                    source={{ uri: category.icon_cdn_url }}
                    style={styles.categoryImage}
                    resizeMode="cover"
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
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 3,
    borderColor: colors.borderLight,
  },
  createCategoryContainer: {
    borderColor: colors.primary,
    borderWidth: 3,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255, 107, 122, 0.1)',
    position: 'relative',
  },
  plusBadge: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
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
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: CATEGORY_SIZE,
    fontWeight: '500',
  },
  categoryNameSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
});
