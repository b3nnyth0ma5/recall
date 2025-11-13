
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import Animated, { FadeIn } from 'react-native-reanimated';
import { supabase } from '@/utils/supabase';

interface Category {
  id: string;
  category_name: string;
  icon_cdn_url: string | null;
}

interface CategoryCarouselProps {
  onCategorySelect?: (categoryId: string | null) => void;
  selectedCategoryId?: string | null;
}

const CATEGORY_SIZE = 80;
const CATEGORY_SPACING = 20;

export function CategoryCarousel({ onCategorySelect, selectedCategoryId }: CategoryCarouselProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setLoading(true);
      console.log('Loading categories from Supabase...');
      
      const { data, error } = await supabase
        .from('recollection_categories')
        .select('id, category_name, icon_cdn_url')
        .order('id', { ascending: true });

      if (error) {
        console.error('Error loading categories:', error);
        setCategories([]);
        return;
      }

      console.log(`Loaded ${data?.length || 0} categories`);
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryPress = (category: Category) => {
    if (!onCategorySelect) {
      return;
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (categories.length === 0) {
    return null;
  }

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
    borderColor: colors.primary,
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
