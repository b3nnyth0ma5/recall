
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
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Linking,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/Note';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, reverseGeocode, uploadImageToDatabase, deleteImageRecord } from '@/utils/supabase';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

interface ImageData {
  id?: string;
  uri: string;
  localUri?: string;
  contentType: string;
}

export default function NoteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { notes, addNote, updateNote, deleteNote, refreshNotes } = useNotes();

  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const textInputRef = useRef<TextInput>(null);

  const isEditing = !!params.id;
  const existingNote = notes.find((n) => n.id === params.id);
  const canSave = text.trim().length > 0 || images.length > 0;

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
      
      if (existingNote.images && existingNote.imageIds) {
        const loadedImages: ImageData[] = existingNote.images.map((uri, index) => ({
          id: existingNote.imageIds?.[index],
          uri: uri,
          contentType: 'image/jpeg',
        }));
        setImages(loadedImages);
      }
      
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

  useEffect(() => {
    if (params.selectedLatitude && params.selectedLongitude && params.selectedLocationName) {
      const latitude = parseFloat(params.selectedLatitude as string);
      const longitude = parseFloat(params.selectedLongitude as string);
      const locationName = params.selectedLocationName as string;

      console.log('Location updated from search:', { latitude, longitude, locationName });
      setLocation({ latitude, longitude });
      setLocationName(locationName);

      router.setParams({
        selectedLatitude: undefined,
        selectedLongitude: undefined,
        selectedLocationName: undefined,
      });
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });

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

  const convertImageToSuitableFormat = async (uri: string): Promise<{ uri: string; contentType: string }> => {
    try {
      console.log('Converting image to suitable format:', uri);
      
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [
          { resize: { width: 2048 } }
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      console.log('Image converted successfully:', manipulatedImage.uri);
      return {
        uri: manipulatedImage.uri,
        contentType: 'image/jpeg',
      };
    } catch (error) {
      console.error('Error converting image:', error);
      return {
        uri: uri,
        contentType: 'image/jpeg',
      };
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
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        setLoading(true);
        const newImages: ImageData[] = [];

        for (const asset of result.assets) {
          const converted = await convertImageToSuitableFormat(asset.uri);

          newImages.push({
            uri: converted.uri,
            localUri: converted.uri,
            contentType: converted.contentType,
          });
        }

        setImages([...images, ...newImages]);
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
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        setLoading(true);
        const asset = result.assets[0];
        
        const converted = await convertImageToSuitableFormat(asset.uri);

        setImages([...images, {
          uri: converted.uri,
          localUri: converted.uri,
          contentType: converted.contentType,
        }]);
        
        setLoading(false);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const removeImage = async (index: number) => {
    const image = images[index];
    
    if (image.id) {
      try {
        await deleteImageRecord(image.id);
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }
    
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
  };

  const hasUrl = (text: string): boolean => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return urlRegex.test(text);
  };

  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <Text
            key={index}
            style={styles.linkText}
            onPress={() => {
              console.log('Opening URL:', part);
              Linking.openURL(part).catch(err => {
                console.error('Failed to open URL:', err);
              });
            }}
          >
            {part}
          </Text>
        );
      }
      return <Text key={index} style={styles.normalText}>{part}</Text>;
    });
  };

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    try {
      setSaving(true);

      const noteData = {
        text: text.trim(),
        latitude: location?.latitude,
        longitude: location?.longitude,
        location: locationName,
      };

      console.log('Saving note with location data:', noteData);

      let recallId: string;

      if (isEditing && params.id) {
        await updateNote(params.id as string, noteData);
        recallId = params.id as string;

        const { data: existingImages } = await supabase
          .from('recall_images')
          .select('id')
          .eq('recall_id', recallId);

        if (existingImages) {
          for (const img of existingImages) {
            await deleteImageRecord(img.id);
          }
        }
      } else {
        recallId = await addNote(noteData);
      }

      let uploadedCount = 0;
      let failedCount = 0;

      for (const image of images) {
        if (image.localUri) {
          console.log('Uploading image to database:', image.localUri);
          
          const imageId = await uploadImageToDatabase(image.localUri, recallId, image.contentType);
          
          if (imageId) {
            uploadedCount++;
            console.log('Image uploaded successfully to database');
          } else {
            failedCount++;
            console.error('Failed to upload image to database');
          }
        }
      }

      console.log(`Upload complete: ${uploadedCount} succeeded, ${failedCount} failed`);

      if (failedCount > 0) {
        Alert.alert(
          'Partial Upload',
          `${uploadedCount} image(s) uploaded successfully, but ${failedCount} failed. Check console logs for details.`,
          [{ text: 'OK' }]
        );
      }

      router.back();
      setTimeout(() => {
        refreshNotes();
      }, 500);
    } catch (error) {
      console.error('Error saving recall:', error);
      Alert.alert('Error', 'Failed to save recall. Check console logs for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing || !params.id) {
      return;
    }

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

  const handleLocationSearch = () => {
    router.push('/location-search');
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
            <Pressable
              onPress={handleSave}
              disabled={saving || !canSave}
              style={[
                styles.saveButton,
                (saving || !canSave) && styles.saveButtonDisabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.checkmarkContainer}>
                  <IconSymbol name="checkmark" size={20} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          ),
        }}
      />

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeIn.duration(600)} style={styles.textInputContainer}>
          {hasUrl(text) ? (
            <View style={styles.richTextContainer}>
              <Text style={styles.richText}>
                {renderTextWithLinks(text)}
              </Text>
              <TextInput
                ref={textInputRef}
                style={[styles.textInput, styles.hiddenInput]}
                placeholder="Start writing your recall..."
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={setText}
                multiline
                autoFocus={!isEditing}
              />
            </View>
          ) : (
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
          )}
        </Animated.View>
      </ScrollView>

      <View style={styles.bottomSection}>
        {images.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.imagesContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {images.map((image, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri: image.uri }} style={styles.imagePreview} />
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

        {locationName && (
          <Animated.View entering={FadeIn.duration(600).delay(200)} style={styles.locationInfo}>
            <IconSymbol name="location.fill" size={16} color={colors.textSecondary} />
            <Text style={styles.locationText}>{locationName}</Text>
          </Animated.View>
        )}

        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
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
              onPress={handleLocationSearch}
              style={styles.toolbarButton}
            >
              <IconSymbol name="mappin.circle.fill" size={28} color={colors.primary} />
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

          {isEditing && (
            <Pressable
              onPress={handleDelete}
              style={styles.toolbarButton}
            >
              <IconSymbol name="trash" size={28} color={colors.error} />
            </Pressable>
          )}
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
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  checkmarkContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  richTextContainer: {
    position: 'relative',
    minHeight: 300,
  },
  richText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    minHeight: 300,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  normalText: {
    color: colors.text,
  },
  linkText: {
    color: colors.primary,
    textDecorationLine: 'underline',
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  toolbarButton: {
    padding: 8,
  },
});
