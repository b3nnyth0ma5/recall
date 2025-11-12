
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { colors } from '@/styles/commonStyles';
import Animated, { FadeIn } from 'react-native-reanimated';
import { supabase } from '@/utils/supabase';
import { IconSymbol } from './IconSymbol';
import { useAuth } from '@/contexts/AuthContext';

interface Category {
  id: string;
  category_name: string;
  icon_cdn_url: string | null;
}

interface Recollection {
  id: number;
  category_id: string;
  recall_id: string;
  match_score: number;
}

interface CategoryCarouselProps {
  onCategorySelect?: (categoryId: string | null) => void;
  selectedCategoryId?: string | null;
}

const CATEGORY_SIZE = 80;
const CATEGORY_SPACING = 16;

export function CategoryCarousel({ onCategorySelect, selectedCategoryId }: CategoryCarouselProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [recollections, setRecollections] = useState<Recollection[]>([]);
  const [loadingRecollections, setLoadingRecollections] = useState(false);
  const { user } = useAuth();

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

  const loadRecollections = async (categoryId: string) => {
    if (!user?.id) {
      console.error('No user logged in');
      return;
    }

    try {
      setLoadingRecollections(true);
      console.log('Loading recollections for category:', categoryId);

      const { data, error } = await supabase
        .from('recollections')
        .select('id, category_id, recall_id, match_score')
        .eq('category_id', categoryId)
        .eq('user_id', user.id)
        .order('match_score', { ascending: false });

      if (error) {
        console.error('Error loading recollections:', error);
        setRecollections([]);
        return;
      }

      console.log(`Loaded ${data?.length || 0} recollections`);
      setRecollections(data || []);
    } catch (error) {
      console.error('Error loading recollections:', error);
      setRecollections([]);
    } finally {
      setLoadingRecollections(false);
    }
  };

  const handleCategoryPress = (category: Category) => {
    // Show modal with category information
    setSelectedCategory(category);
    setModalVisible(true);
    loadRecollections(category.id);
  };

  const handleCategorySelect = () => {
    if (selectedCategory && onCategorySelect) {
      // If already selected, deselect it
      if (selectedCategoryId === selectedCategory.id) {
        onCategorySelect(null);
      } else {
        onCategorySelect(selectedCategory.id);
      }
    }
    setModalVisible(false);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedCategory(null);
    setRecollections([]);
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
    <>
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

      {/* Category Information Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCloseModal}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Category Information</Text>
              <Pressable onPress={handleCloseModal} style={styles.closeButton}>
                <IconSymbol name="xmark" size={24} color={colors.text} />
              </Pressable>
            </View>

            {/* Category Details */}
            {selectedCategory && (
              <View style={styles.categoryDetails}>
                <View style={styles.categoryIconContainer}>
                  {selectedCategory.icon_cdn_url ? (
                    <Image
                      source={{ uri: selectedCategory.icon_cdn_url }}
                      style={styles.modalCategoryImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.modalCategoryPlaceholder}>
                      <Text style={styles.modalCategoryPlaceholderText}>
                        {selectedCategory.category_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.categoryNameLarge}>{selectedCategory.category_name}</Text>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Category ID:</Text>
                  <Text style={styles.infoValue}>{selectedCategory.id}</Text>
                </View>
              </View>
            )}

            {/* Recollections List */}
            <View style={styles.recollectionsSection}>
              <Text style={styles.sectionTitle}>Recollections</Text>
              
              {loadingRecollections ? (
                <View style={styles.loadingRecollections}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingText}>Loading recollections...</Text>
                </View>
              ) : recollections.length === 0 ? (
                <View style={styles.emptyRecollections}>
                  <Text style={styles.emptyText}>No recollections found for this category</Text>
                </View>
              ) : (
                <ScrollView style={styles.recollectionsList} showsVerticalScrollIndicator={true}>
                  {recollections.map((recollection, index) => (
                    <View key={recollection.id} style={styles.recollectionItem}>
                      <View style={styles.recollectionHeader}>
                        <Text style={styles.recollectionIndex}>#{index + 1}</Text>
                        <View style={styles.matchScoreBadge}>
                          <Text style={styles.matchScoreText}>{recollection.match_score}%</Text>
                        </View>
                      </View>
                      <View style={styles.recollectionInfo}>
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Category ID:</Text>
                          <Text style={styles.infoValueSmall} numberOfLines={1}>
                            {recollection.category_id}
                          </Text>
                        </View>
                        <View style={styles.infoRow}>
                          <Text style={styles.infoLabel}>Recall ID:</Text>
                          <Text style={styles.infoValueSmall} numberOfLines={1}>
                            {recollection.recall_id}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.actionButton, styles.selectButton]}
                onPress={handleCategorySelect}
              >
                <Text style={styles.selectButtonText}>
                  {selectedCategoryId === selectedCategory?.id ? 'Deselect Category' : 'Select Category'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.cancelButton]}
                onPress={handleCloseModal}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
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
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryImageContainerSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight || colors.cardBackground,
  },
  categoryImage: {
    width: CATEGORY_SIZE - 16,
    height: CATEGORY_SIZE - 16,
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
  },
  categoryNameSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  categoryDetails: {
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || colors.textTertiary,
  },
  categoryIconContainer: {
    marginBottom: 12,
  },
  modalCategoryImage: {
    width: 80,
    height: 80,
  },
  modalCategoryPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCategoryPlaceholderText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  categoryNameLarge: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
    width: '100%',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginRight: 8,
    minWidth: 100,
  },
  infoValue: {
    fontSize: 12,
    color: colors.text,
    fontFamily: 'monospace',
    flex: 1,
  },
  infoValueSmall: {
    fontSize: 11,
    color: colors.text,
    fontFamily: 'monospace',
    flex: 1,
  },
  recollectionsSection: {
    flex: 1,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  loadingRecollections: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyRecollections: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  recollectionsList: {
    maxHeight: 300,
  },
  recollectionItem: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border || colors.textTertiary,
  },
  recollectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recollectionIndex: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  matchScoreBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  matchScoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  recollectionInfo: {
    gap: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectButton: {
    backgroundColor: colors.primary,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  cancelButton: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border || colors.textTertiary,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
