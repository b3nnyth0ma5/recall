
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TextInput, Alert, Platform, Keyboard, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { IconSymbol } from '@/components/IconSymbol';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import Toast from 'react-native-toast-message';

export default function CreateCategoryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryImage, setCategoryImage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Refs for input fields
  const nameInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  const handleBack = () => {
    Keyboard.dismiss();
    router.back();
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

    if (!user) {
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setIsCreating(true);
      console.log('[CreateCategory] User tapped Create Category button');

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
          console.error('[CreateCategory] Failed to upload category image');
        }
      }

      // Create category in database
      console.log('[CreateCategory] Inserting category into DB');
      const { data, error } = await supabase
        .from('recollection_categories')
        .insert([{
          user_id: user.id,
          category_name: categoryName.trim(),
          category_search_description: categoryDescription.trim(),
          icon_cdn_url: iconUrl,
          is_matching: false,
        }])
        .select('id')
        .single();

      if (error) {
        console.error('[CreateCategory] Error creating category:', error);
        Alert.alert('Error', 'Failed to create category');
        return;
      }

      const newCategoryId = data.id;
      console.log('[CreateCategory] Category created successfully:', newCategoryId);

      // Clear spinner immediately — INSERT is done
      setIsCreating(false);

      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (hapticError) {
          console.error('[CreateCategory] Error triggering haptic feedback:', hapticError);
        }
      }

      // Show success toast
      Toast.show({
        type: 'success',
        text1: 'Category created — matching recalls in the background…',
        position: 'bottom',
      });

      // Navigate back immediately — don't wait for matching
      console.log('[CreateCategory] Navigating to category page:', newCategoryId);
      router.replace(`/(tabs)/(home)/category-viewer?id=${newCategoryId}`);

      // Fire-and-forget: invoke the async matching edge function
      console.log('[CreateCategory] Firing match-recalls-to-category-async for:', newCategoryId);
      (async () => {
        try {
          await supabase.functions.invoke('match-recalls-to-category-async', {
            body: { categoryId: newCategoryId, userId: user.id },
          });
        } catch (e) {
          console.error('[CreateCategory] match-recalls-to-category-async failed:', e);
        }
      })();
    } catch (error) {
      console.error('[CreateCategory] Error creating category:', error);
      Alert.alert('Error', 'Failed to create category');
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Create Category',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontSize: 20,
            fontWeight: 'bold',
            color: colors.primary,
          },
          headerLeft: () => (
            <Pressable 
              onPress={handleBack} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Category Icon - 25% smaller (105px -> 78.75px, rounded to 80px) */}
          <View style={styles.imageSection}>
            <Text style={styles.sectionLabel}>Category Icon</Text>
            <Pressable onPress={handleSelectImage} style={styles.imageSelector}>
              {categoryImage ? (
                <Image source={{ uri: categoryImage }} style={styles.selectedImage} resizeMode="cover" />
              ) : (
                <View style={styles.emptyImagePlaceholder}>
                  <IconSymbol 
                    ios_icon_name="photo" 
                    android_material_icon_name="image" 
                    size={36} 
                    color={colors.textSecondary} 
                  />
                  <Text style={styles.emptyImageText}>Tap to select</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Category Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}> Name *</Text>
            <Text style={styles.hint}>Keep it short (e.g., &quot;Travel&quot;, &quot;Food&quot;, &quot;Work&quot;)</Text>
            <TextInput
              ref={nameInputRef}
              style={styles.input}
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="Enter category name"
              placeholderTextColor={colors.textSecondary}
              maxLength={30}
              returnKeyType="next"
              onSubmitEditing={() => descriptionInputRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          {/* Search Description - Now on its own row below image and name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}> Description *</Text>
            <Text style={styles.hint}>Describe what Recalls should be in this category..</Text>
            <TextInput
              ref={descriptionInputRef}
              style={[styles.input, styles.textArea]}
              value={categoryDescription}
              onChangeText={setCategoryDescription}
              placeholder="E.g., 'Memories from trips, vacations, places I visited, travel experiences'"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit={true}
            />
          </View>

          {/* Create Button - Full Width at Bottom */}
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
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  imageSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  imageSelector: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  optionalText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  fieldContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 8,
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
    minHeight: 50,
  },
  textArea: {
    minHeight: 140,
    paddingTop: 14,
  },
  createButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
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
