
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator, Modal, TextInput, Alert, Platform } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { IconSymbol } from './IconSymbol';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryImage, setCategoryImage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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
    setShowCreateModal(true);
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setCategoryName('');
    setCategoryDescription('');
    setCategoryImage(null);
  };

  const handleSelectImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCategoryImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) {
      Alert.alert('Name Required', 'Please enter a category name');
      return;
    }

    if (!categoryDescription.trim()) {
      Alert.alert('Description Required', 'Please enter a category description');
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setIsCreating(true);

      // Upload image to Cloudflare if provided
      let iconUrl: string | null = null;
      if (categoryImage) {
        const { uploadImageToCloudflare } = await import('@/utils/cloudflareCDN');
        const { File } = await import('expo-file-system');
        
        const file = new File(categoryImage);
        const base64 = await file.base64();
        const fileName = `category-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        
        iconUrl = await uploadImageToCloudflare(base64, fileName, 'image/jpeg');
        
        if (!iconUrl) {
          console.error('Failed to upload category image');
        }
      }

      // Create category in database
      const { data, error } = await supabase
        .from('recollection_categories')
        .insert([{
          user_id: userId,
          category_name: categoryName.trim(),
          category_search_description: categoryDescription.trim(),
          icon_cdn_url: iconUrl,
          is_matching: true, // Set to true while matching is in progress
        }])
        .select('id')
        .single();

      if (error) {
        console.error('Error creating category:', error);
        Alert.alert('Error', 'Failed to create category');
        return;
      }

      console.log('Category created successfully:', data.id);

      // Trigger category matching asynchronously
      triggerCategoryMatchingForNewCategory(data.id);

      // Reload categories
      await loadAllUserCategories();

      // Close modal
      handleCloseModal();

      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }
    } catch (error) {
      console.error('Error creating category:', error);
      Alert.alert('Error', 'Failed to create category');
    } finally {
      setIsCreating(false);
    }
  };

  const triggerCategoryMatchingForNewCategory = async (categoryId: string) => {
    try {
      console.log('Triggering category matching for new category:', categoryId);
      
      const { data, error } = await supabase.functions.invoke('match-recollection-category', {
        body: { 
          categoryId: categoryId,
          mode: 'category' // Indicate we're matching a category against all recalls
        },
      });

      if (error) {
        console.error('Error invoking category matching:', error);
      } else {
        console.log('Category matching triggered successfully:', data);
      }

      // Update is_matching flag to false
      await supabase
        .from('recollection_categories')
        .update({ is_matching: false })
        .eq('id', categoryId);

      // Reload categories to update UI
      await loadAllUserCategories();
    } catch (error) {
      console.error('Exception in triggerCategoryMatchingForNewCategory:', error);
      
      // Still update is_matching flag to false
      await supabase
        .from('recollection_categories')
        .update({ is_matching: false })
        .eq('id', categoryId);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
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

      {/* Create Category Modal */}
      <Modal
        visible={showCreateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Category</Text>
              <Pressable onPress={handleCloseModal} style={styles.closeButton}>
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Category Image */}
              <Text style={styles.label}>Category Icon (Optional)</Text>
              <Pressable onPress={handleSelectImage} style={styles.imageSelector}>
                {categoryImage ? (
                  <Image source={{ uri: categoryImage }} style={styles.selectedImage} resizeMode="cover" />
                ) : (
                  <View style={styles.emptyImagePlaceholder}>
                    <IconSymbol 
                      ios_icon_name="photo" 
                      android_material_icon_name="image" 
                      size={40} 
                      color={colors.textSecondary} 
                    />
                    <Text style={styles.emptyImageText}>Tap to select</Text>
                  </View>
                )}
              </Pressable>

              {/* Category Name */}
              <Text style={styles.label}>Category Name *</Text>
              <Text style={styles.hint}>Keep it short (e.g., &quot;Travel&quot;, &quot;Food&quot;, &quot;Work&quot;)</Text>
              <TextInput
                style={styles.input}
                value={categoryName}
                onChangeText={setCategoryName}
                placeholder="Enter category name"
                placeholderTextColor={colors.textSecondary}
                maxLength={30}
              />

              {/* Category Description */}
              <Text style={styles.label}>Search Description *</Text>
              <Text style={styles.hint}>Describe what recalls should be in this category. Be as detailed as you want.</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={categoryDescription}
                onChangeText={setCategoryDescription}
                placeholder="E.g., 'Memories from trips, vacations, places I visited, travel experiences'"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {/* Create Button */}
              <Pressable
                onPress={handleCreateCategory}
                style={[styles.createButton, isCreating && styles.createButtonDisabled]}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.createButtonText}>Create Category</Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
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
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 8,
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 16,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  imageSelector: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  selectedImage: {
    width: '100%',
    height: '100%',
  },
  emptyImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyImageText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 14,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 16,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
