
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, TextInput, Alert, Platform, Keyboard, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { IconSymbol } from '@/components/IconSymbol';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';

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
          user_id: user.id,
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
      console.error('Error creating category:', error);
      Alert.alert('Error', 'Failed to create category');
    } finally {
      setIsCreating(false);
    }
  };

  const triggerCategoryMatchingForNewCategory = async (categoryId: string) => {
    try {
      console.log('Triggering category matching for new category:', categoryId);
      
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

      // Update is_matching flag to false
      await supabase
        .from('recollection_categories')
        .update({ is_matching: false })
        .eq('id', categoryId);
    } catch (error) {
      console.error('Exception in triggerCategoryMatchingForNewCategory:', error);
      
      // Still update is_matching flag to false
      await supabase
        .from('recollection_categories')
        .update({ is_matching: false })
        .eq('id', categoryId);
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
          },
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
          {/* Main Content Container with Horizontal Layout */}
          <View style={styles.contentContainer}>
            {/* Left Side - Category Photo */}
            <View style={styles.leftColumn}>
              <Text style={styles.sectionLabel}>Category Icon</Text>
              <Pressable onPress={handleSelectImage} style={styles.imageSelector}>
                {categoryImage ? (
                  <Image source={{ uri: categoryImage }} style={styles.selectedImage} resizeMode="cover" />
                ) : (
                  <View style={styles.emptyImagePlaceholder}>
                    <IconSymbol 
                      ios_icon_name="photo" 
                      android_material_icon_name="image" 
                      size={48} 
                      color={colors.textSecondary} 
                    />
                    <Text style={styles.emptyImageText}>Tap to select</Text>
                  </View>
                )}
              </Pressable>
              <Text style={styles.optionalText}>(Optional)</Text>
            </View>

            {/* Right Side - Category Name and Description */}
            <View style={styles.rightColumn}>
              {/* Category Name */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Category Name *</Text>
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

              {/* Category Description */}
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Search Description *</Text>
                <Text style={styles.hint}>Describe what recalls should be in this category. Be as detailed as you want.</Text>
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
            </View>
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
    marginLeft: 8,
  },
  contentContainer: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 32,
  },
  leftColumn: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  rightColumn: {
    flex: 1,
    gap: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  imageSelector: {
    width: 140,
    height: 140,
    borderRadius: 70,
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
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  optionalText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  fieldContainer: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
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
