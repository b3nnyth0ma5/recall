
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, TextInput, Image, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

interface Category {
  id: string;
  category_name: string;
  category_search_description: string;
  icon_cdn_url: string | null;
  user_id: string;
}

export default function CategoryViewerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [category, setCategory] = useState<Category | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImage, setEditImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const nameInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  const loadCategoryAndRecalls = useCallback(async () => {
    if (!id || !user) {
      console.log('[CategoryViewer] No category ID or user');
      setLoading(false);
      return;
    }

    try {
      console.log('[CategoryViewer] Loading category and recalls for:', id);
      
      // Fetch category details
      const { data: categoryData, error: categoryError } = await supabase
        .from('recollection_categories')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (categoryError) {
        console.error('[CategoryViewer] Error loading category:', categoryError);
        Alert.alert('Error', 'Failed to load category');
        router.back();
        return;
      }

      setCategory(categoryData);
      console.log('[CategoryViewer] Category loaded:', categoryData.category_name);

      // Fetch recall IDs that match this category from recollections table
      const { data: recollectionsData, error: recollectionsError } = await supabase
        .from('recollections')
        .select('recall_id, match_score')
        .eq('category_id', id)
        .eq('user_id', user.id)
        .order('match_score', { ascending: false });

      if (recollectionsError) {
        console.error('[CategoryViewer] Error fetching recollections:', recollectionsError);
        setNotes([]);
        return;
      }

      if (!recollectionsData || recollectionsData.length === 0) {
        console.log('[CategoryViewer] No recalls found for this category');
        setNotes([]);
        return;
      }

      console.log(`[CategoryViewer] Found ${recollectionsData.length} recollections`);

      const recallIds = recollectionsData.map(r => r.recall_id);
      
      // Create a map of recall_id to match_score for sorting
      const matchScoreMap = new Map(
        recollectionsData.map(r => [r.recall_id, r.match_score])
      );

      // Fetch the actual recalls
      const { data: recallsData, error: recallsError } = await supabase
        .from('recalls')
        .select(`
          id,
          text,
          created_at,
          updated_at,
          location,
          latitude,
          longitude,
          location_primary_type,
          recall_images (
            id,
            cdn_url,
            ocr_text,
            image_explanation
          ),
          recall_urls (
            id,
            url,
            url_data
          ),
          recall_people (
            id,
            person_id,
            persons (
              id,
              person_name
            )
          )
        `)
        .in('id', recallIds)
        .eq('user_id', user.id);

      if (recallsError) {
        console.error('[CategoryViewer] Error fetching recalls:', recallsError);
        setNotes([]);
        return;
      }

      // Transform recalls to Note format and add match_score
      const transformedNotes: Note[] = (recallsData || []).map((recall: any) => {
        console.log(`[CategoryViewer] Processing recall ${recall.id}, images:`, recall.recall_images);
        
        return {
          id: recall.id,
          text: recall.text || '',
          created_at: recall.created_at,
          updated_at: recall.updated_at,
          location: recall.location,
          latitude: recall.latitude,
          longitude: recall.longitude,
          location_primary_type: recall.location_primary_type,
          images: recall.recall_images?.map((img: any) => img.cdn_url).filter((url: string) => url) || [],
          imageIds: recall.recall_images?.map((img: any) => img.id) || [],
          urls: recall.recall_urls?.map((url: any) => ({
            id: url.id,
            url: url.url,
            url_data: url.url_data,
          })) || [],
          people: recall.recall_people?.map((rp: any) => ({
            id: rp.persons?.id,
            person_name: rp.persons?.person_name,
          })) || [],
          match_score: matchScoreMap.get(recall.id) || 0,
        };
      });

      // Sort by match_score
      transformedNotes.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

      console.log(`[CategoryViewer] Loaded ${transformedNotes.length} recalls`);
      transformedNotes.forEach(note => {
        console.log(`[CategoryViewer] Note ${note.id}: ${note.images?.length || 0} images`);
      });
      
      setNotes(transformedNotes);
    } catch (error) {
      console.error('[CategoryViewer] Error loading data:', error);
      Alert.alert('Error', 'Failed to load category data');
    } finally {
      setLoading(false);
    }
  }, [id, user, router]);

  useEffect(() => {
    loadCategoryAndRecalls();
  }, [loadCategoryAndRecalls]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCategoryAndRecalls();
    setRefreshing(false);
  };

  const handleBack = () => {
    router.back();
  };

  const handleNotePress = (noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to note editor:', error);
    }
  };

  const handleEditPress = () => {
    if (!category) return;
    
    setEditName(category.category_name);
    setEditDescription(category.category_search_description);
    setEditImage(category.icon_cdn_url);
    setShowEditModal(true);

    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
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
        setEditImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const handleSaveEdit = async () => {
    if (!category || !user) return;

    if (!editName.trim()) {
      Alert.alert('Name Required', 'Please enter a category name');
      return;
    }

    if (!editDescription.trim()) {
      Alert.alert('Description Required', 'Please enter a category description');
      return;
    }

    try {
      setIsSaving(true);

      // Check if name or description changed
      const nameChanged = editName.trim() !== category.category_name;
      const descriptionChanged = editDescription.trim() !== category.category_search_description;

      // Upload new image if changed
      let iconUrl = category.icon_cdn_url;
      if (editImage && editImage !== category.icon_cdn_url) {
        const { uploadImageToCloudflare } = await import('@/utils/cloudflareCDN');
        const { File } = await import('expo-file-system');
        
        const file = new File(editImage);
        const base64 = await file.base64();
        const fileName = `category-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        
        const uploadedUrl = await uploadImageToCloudflare(base64, fileName, 'image/jpeg');
        
        if (uploadedUrl) {
          iconUrl = uploadedUrl;
        }
      }

      // Update category in database
      const { error } = await supabase
        .from('recollection_categories')
        .update({
          category_name: editName.trim(),
          category_search_description: editDescription.trim(),
          icon_cdn_url: iconUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', category.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating category:', error);
        Alert.alert('Error', 'Failed to update category');
        return;
      }

      console.log('Category updated successfully');

      // Trigger new-category-matching edge function if name or description changed
      if (nameChanged || descriptionChanged) {
        console.log('Category name or description changed, triggering new-category-matching...');
        triggerCategoryMatching(category.id);
      }

      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }

      // Reload category data
      await loadCategoryAndRecalls();
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating category:', error);
      Alert.alert('Error', 'Failed to update category');
    } finally {
      setIsSaving(false);
    }
  };

  const triggerCategoryMatching = async (categoryId: string) => {
    try {
      console.log('Triggering category matching for updated category:', categoryId);
      
      const { data, error } = await supabase.functions.invoke('new-category-matching', {
        body: { 
          categoryId: categoryId
        },
      });

      if (error) {
        console.error('Error invoking category matching:', error);
      } else {
        console.log('Category matching triggered successfully:', data);
      }
    } catch (error) {
      console.error('Exception in triggerCategoryMatching:', error);
    }
  };

  const handleDeletePress = () => {
    Alert.alert(
      'Delete Category',
      'Are you sure you want to delete this category? This will not delete your recalls, only the category grouping.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: handleDeleteConfirm,
        },
      ]
    );
  };

  const handleDeleteConfirm = async () => {
    if (!category || !user) return;

    try {
      setIsDeleting(true);

      // Delete all recollections for this category first
      const { error: recollectionsError } = await supabase
        .from('recollections')
        .delete()
        .eq('category_id', category.id)
        .eq('user_id', user.id);

      if (recollectionsError) {
        console.error('Error deleting recollections:', recollectionsError);
        Alert.alert('Error', 'Failed to delete category');
        return;
      }

      // Delete the category
      const { error: categoryError } = await supabase
        .from('recollection_categories')
        .delete()
        .eq('id', category.id)
        .eq('user_id', user.id);

      if (categoryError) {
        console.error('Error deleting category:', categoryError);
        Alert.alert('Error', 'Failed to delete category');
        return;
      }

      console.log('Category deleted successfully');

      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }

      // Navigate back
      router.back();
    } catch (error) {
      console.error('Error deleting category:', error);
      Alert.alert('Error', 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol 
        ios_icon_name="tray" 
        android_material_icon_name="inbox" 
        size={80} 
        color={colors.textTertiary} 
      />
      <Text style={styles.emptyTitle}>No Recalls in This Category</Text>
      <Text style={styles.emptyText}>
        Create recalls that match this category&apos;s description, or the matching algorithm will automatically add relevant recalls.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Category',
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.text,
            headerTitleAlign: 'center',
            headerLeft: () => (
              <Pressable onPress={handleBack} style={styles.headerButton}>
                <IconSymbol 
                  ios_icon_name="chevron.left" 
                  android_material_icon_name="arrow_back" 
                  size={24} 
                  color={colors.text} 
                />
              </Pressable>
            ),
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!category) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Category',
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.text,
            headerTitleAlign: 'center',
            headerLeft: () => (
              <Pressable onPress={handleBack} style={styles.headerButton}>
                <IconSymbol 
                  ios_icon_name="chevron.left" 
                  android_material_icon_name="arrow_back" 
                  size={24} 
                  color={colors.text} 
                />
              </Pressable>
            ),
          }}
        />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Category Not Found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: category.category_name,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleAlign: 'center',
          headerLeft: () => (
            <Pressable 
              onPress={handleBack} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable 
              onPress={handleDeletePress} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="trash" size={24} color={colors.error} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Category Info - Updated Layout */}
        <View style={styles.categoryInfoContainer}>
          <View style={styles.categoryTopRow}>
            {/* Category Icon - 20% smaller and on the left */}
            {category.icon_cdn_url && (
              <Image
                source={{ uri: category.icon_cdn_url }}
                style={styles.categoryIcon}
                resizeMode="cover"
              />
            )}
            
            {/* Search Description and Recall Count - Vertically aligned */}
            <View style={styles.categoryTextContainer}>
              <View style={styles.descriptionRow}>
                <Text style={styles.categoryDescription}>{category.category_search_description}</Text>
                {/* Small Edit Icon */}
                <Pressable 
                  onPress={handleEditPress} 
                  style={styles.editIconButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol 
                    ios_icon_name="pencil.circle.fill" 
                    android_material_icon_name="edit" 
                    size={24} 
                    color={colors.primary} 
                  />
                </Pressable>
              </View>
              <Text style={styles.recallCount}>
                {notes.length} {notes.length === 1 ? 'Recall' : 'Recalls'}
              </Text>
            </View>
          </View>
        </View>

        {/* Recalls */}
        {notes.length === 0 ? (
          renderEmptyState()
        ) : (
          <View style={styles.notesContainer}>
            {notes.map((note, index) => (
              <NoteCard
                key={`${note.id}-${index}`}
                note={note}
                onPress={() => handleNotePress(note.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowEditModal(false)} style={styles.modalButton}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Edit Category</Text>
            <Pressable onPress={handleSaveEdit} style={styles.modalButton} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Save</Text>
              )}
            </Pressable>
          </View>

          <ScrollView 
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Category Icon */}
            <View style={styles.modalImageSection}>
              <Text style={styles.modalLabel}>Category Icon</Text>
              <Pressable onPress={handleSelectImage} style={styles.modalImageSelector}>
                {editImage ? (
                  <Image source={{ uri: editImage }} style={styles.modalSelectedImage} resizeMode="cover" />
                ) : (
                  <View style={styles.modalEmptyImagePlaceholder}>
                    <IconSymbol 
                      ios_icon_name="photo" 
                      android_material_icon_name="image" 
                      size={36} 
                      color={colors.textSecondary} 
                    />
                    <Text style={styles.modalEmptyImageText}>Tap to select</Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* Category Name */}
            <View style={styles.modalFieldContainer}>
              <Text style={styles.modalLabel}>Category Name *</Text>
              <TextInput
                ref={nameInputRef}
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter category name"
                placeholderTextColor={colors.textSecondary}
                maxLength={30}
                returnKeyType="next"
                onSubmitEditing={() => descriptionInputRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            {/* Search Description */}
            <View style={styles.modalFieldContainer}>
              <Text style={styles.modalLabel}>Search Description *</Text>
              <TextInput
                ref={descriptionInputRef}
                style={[styles.modalInput, styles.modalTextArea]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Describe what recalls should be in this category"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                returnKeyType="done"
                blurOnSubmit={true}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Deletion Indicator Modal */}
      <Modal
        visible={isDeleting}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.deletionModalContainer}>
          <View style={styles.deletionModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.deletionModalText}>Deleting category...</Text>
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
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  categoryInfoContainer: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  categoryIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  categoryTextContainer: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 80,
  },
  descriptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  categoryDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
    flex: 1,
  },
  editIconButton: {
    padding: 4,
  },
  recallCount: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    alignSelf: 'flex-start',
  },
  notesContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalButton: {
    padding: 8,
    minWidth: 60,
  },
  modalButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  modalButtonTextPrimary: {
    color: colors.primary,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  modalImageSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    alignSelf: 'flex-start',
    width: '100%',
  },
  modalImageSelector: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  modalSelectedImage: {
    width: '100%',
    height: '100%',
  },
  modalEmptyImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalEmptyImageText: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  modalFieldContainer: {
    marginBottom: 24,
  },
  modalInput: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
  },
  modalTextArea: {
    minHeight: 140,
    paddingTop: 14,
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
