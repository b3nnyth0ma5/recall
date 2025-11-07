
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/Note';
import { IconSymbol } from '@/components/IconSymbol';
import { uploadImage, deleteImage, reverseGeocode, getImageUrl } from '@/utils/supabase';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function NoteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { notes, addNote, updateNote, deleteNote, refreshNotes } = useNotes();

  const [text, setText] = useState('');
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const textInputRef = useRef<TextInput>(null);

  const isEditing = !!params.id;
  const existingNote = notes.find((n) => n.id === params.id);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
    };
  }, []);

  useEffect(() => {
    if (existingNote) {
      setText(existingNote.text || '');
      setImagePaths(existingNote.imagePaths || []);
      setImageUris(existingNote.images || []);
      if (existingNote.latitude && existingNote.longitude) {
        setLocation({
          latitude: existingNote.latitude,
          longitude: existingNote.longitude,
        });
      }
      setLocationName(existingNote.location || '');
    }
  }, [existingNote]);

  useEffect(() => {
    if (!isEditing) {
      requestLocationPermission();
    }
  }, [isEditing]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });

        // Get location name
        const locationName = await reverseGeocode(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude
        );
        setLocationName(locationName);
        console.log('Location obtained:', locationName);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        setLoading(true);
        const uploadedPaths: string[] = [];
        const uploadedUris: string[] = [];

        for (const asset of result.assets) {
          const path = await uploadImage(asset.uri);
          if (path) {
            uploadedPaths.push(path);
            uploadedUris.push(getImageUrl(path));
          }
        }

        setImagePaths([...imagePaths, ...uploadedPaths]);
        setImageUris([...imageUris, ...uploadedUris]);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        setLoading(true);
        const path = await uploadImage(result.assets[0].uri);
        if (path) {
          setImagePaths([...imagePaths, path]);
          setImageUris([...imageUris, getImageUrl(path)]);
        }
        setLoading(false);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const removeImage = async (index: number) => {
    const imagePath = imagePaths[index];
    const newImagePaths = imagePaths.filter((_, i) => i !== index);
    const newImageUris = imageUris.filter((_, i) => i !== index);
    setImagePaths(newImagePaths);
    setImageUris(newImageUris);

    // Delete from storage
    await deleteImage(imagePath);
  };

  const handleSave = async () => {
    if (!text.trim() && imagePaths.length === 0) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    try {
      setSaving(true);

      const noteData = {
        text: text.trim(),
        imagePaths: imagePaths,
        images: imageUris,
        latitude: location?.latitude,
        longitude: location?.longitude,
        location: locationName,
      };

      if (isEditing && params.id) {
        await updateNote(params.id as string, noteData);
      } else {
        await addNote(noteData);
      }

      // Navigate back and refresh
      router.back();
      setTimeout(() => {
        refreshNotes();
      }, 500);
    } catch (error) {
      console.error('Error saving recall:', error);
      Alert.alert('Error', 'Failed to save recall');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing || !params.id) return;

    Alert.alert(
      'Delete Recall',
      'Are you sure you want to delete this recall?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(params.id as string);
              router.back();
            } catch (error) {
              console.error('Error deleting recall:', error);
              Alert.alert('Error', 'Failed to delete recall');
            }
          },
        },
      ]
    );
  };

  const toggleKeyboard = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      textInputRef.current?.focus();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: isEditing ? 'Edit Recall' : 'New Recall',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerRightContainer}>
              {isEditing && (
                <Pressable onPress={handleDelete} style={styles.headerButton}>
                  <IconSymbol name="trash" size={22} color={colors.error} />
                </Pressable>
              )}
              <Pressable
                onPress={handleSave}
                disabled={saving}
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="checkmark" size={24} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          ),
        }}
      />

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Text Input */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.textInputContainer}>
          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            placeholder="Start writing your recall..."
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus={!isEditing}
          />
        </Animated.View>
      </ScrollView>

      {/* Bottom Section - Image Previews, Location, and Action Buttons */}
      <View style={styles.bottomSection}>
        {/* Image Preview */}
        {imageUris.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.imagesContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {imageUris.map((imageUri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                  <Pressable
                    onPress={() => removeImage(index)}
                    style={styles.removeImageButton}
                  >
                    <IconSymbol name="xmark.circle.fill" size={24} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* Location Info */}
        {locationName && (
          <Animated.View entering={FadeIn.duration(600).delay(200)} style={styles.locationInfo}>
            <IconSymbol name="location.fill" size={16} color={colors.textSecondary} />
            <Text style={styles.locationText}>{locationName}</Text>
          </Animated.View>
        )}

        {/* Action Buttons */}
        <View style={styles.toolbar}>
          <Pressable
            onPress={takePhoto}
            disabled={loading}
            style={styles.toolbarButton}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol name="camera.fill" size={28} color={colors.primary} />
            )}
          </Pressable>
          <Pressable
            onPress={pickImage}
            disabled={loading}
            style={styles.toolbarButton}
          >
            <IconSymbol name="photo.fill" size={28} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={toggleKeyboard}
            style={styles.toolbarButton}
          >
            <IconSymbol 
              name={keyboardVisible ? "keyboard.chevron.compact.down" : "keyboard"} 
              size={28} 
              color={colors.primary} 
            />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
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
    padding: 16,
    paddingBottom: 20,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  textInputContainer: {
    minHeight: 300,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    minHeight: 300,
    textAlignVertical: 'top',
  },
  bottomSection: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  imagesContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  imageWrapper: {
    marginRight: 12,
    position: 'relative',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  locationText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toolbarButton: {
    padding: 8,
  },
});
