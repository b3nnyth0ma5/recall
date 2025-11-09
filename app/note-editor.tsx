
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
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/Note';
import { supabase, reverseGeocode, uploadImageToDatabase, deleteImageRecord } from '@/utils/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as ImageManipulator from 'expo-image-manipulator';
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
  const { notes, addNote, updateNote, deleteNote } = useNotes();
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageData[]>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [existingNote, setExistingNote] = useState<Note | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (params.selectedLatitude && params.selectedLongitude && params.selectedLocationName) {
      const lat = parseFloat(params.selectedLatitude as string);
      const lon = parseFloat(params.selectedLongitude as string);
      const loc = params.selectedLocationName as string;
      
      console.log('Received location from search:', { lat, lon, loc });
      
      setLatitude(lat);
      setLongitude(lon);
      setLocation(loc);

      if (isEditing && existingNote) {
        console.log('Updating existing recall with new location');
        updateRecallLocation(existingNote.id, lat, lon, loc);
      }
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName]);

  const updateRecallLocation = async (recallId: string, lat: number, lon: number, loc: string) => {
    try {
      const { error } = await supabase
        .from('recalls')
        .update({
          latitude: lat,
          longitude: lon,
          location: loc,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recallId);

      if (error) {
        console.error('Error updating recall location:', error);
      } else {
        console.log('Recall location updated successfully');
      }
    } catch (error) {
      console.error('Exception updating recall location:', error);
    }
  };

  useEffect(() => {
    if (params.id) {
      const note = notes.find((n) => n.id === params.id);
      if (note) {
        setExistingNote(note);
        setText(note.text || '');
        setLocation(note.location || null);
        setLatitude(note.latitude || null);
        setLongitude(note.longitude || null);
        setIsEditing(true);

        if (note.imageIds && note.images) {
          const imageData: ImageData[] = note.imageIds.map((id, index) => ({
            id,
            uri: note.images[index],
            contentType: 'image/jpeg',
          }));
          setImages(imageData);
        }
      }
    }
  }, [params.id, notes]);

  useEffect(() => {
    requestLocationPermission();
  }, []);

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

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted' && !isEditing) {
        const currentLocation = await Location.getCurrentPositionAsync({});
        const { latitude: lat, longitude: lon } = currentLocation.coords;
        setLatitude(lat);
        setLongitude(lon);

        const locationName = await reverseGeocode(lat, lon);
        setLocation(locationName);
        console.log('Current location:', locationName);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const convertImageToSuitableFormat = async (uri: string) => {
    try {
      console.log('Converting image to suitable format...');
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      console.log('Image converted successfully');
      return manipulatedImage.uri;
    } catch (error) {
      console.error('Error converting image:', error);
      return uri;
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newImages = await Promise.all(
          result.assets.map(async (asset) => {
            const convertedUri = await convertImageToSuitableFormat(asset.uri);
            return {
              uri: convertedUri,
              localUri: convertedUri,
              contentType: 'image/jpeg',
            };
          })
        );
        setImages([...images, ...newImages]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera permission is required to take photos');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const convertedUri = await convertImageToSuitableFormat(result.assets[0].uri);
        setImages([...images, {
          uri: convertedUri,
          localUri: convertedUri,
          contentType: 'image/jpeg',
        }]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const removeImage = async (index: number) => {
    const imageToRemove = images[index];
    
    if (imageToRemove.id && isEditing) {
      try {
        await deleteImageRecord(imageToRemove.id);
        console.log('Image deleted from database');
      } catch (error) {
        console.error('Error deleting image:', error);
      }
    }
    
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
  };

  const handleSave = async () => {
    if (!text.trim() && images.length === 0) {
      Alert.alert('Empty Note', 'Please add some text or images before saving');
      return;
    }

    try {
      setIsSaving(true);
      console.log('Saving recall...');

      if (isEditing && existingNote) {
        await updateNote(existingNote.id, {
          text,
          latitude,
          longitude,
          location,
        });

        for (const image of images) {
          if (!image.id && image.localUri) {
            console.log('Uploading new image for existing recall...');
            await uploadImageToDatabase(image.localUri, existingNote.id, image.contentType);
          }
        }

        console.log('Recall updated successfully');
      } else {
        const recallId = await addNote({
          text,
          latitude,
          longitude,
          location,
          images: [],
        });

        if (recallId) {
          for (const image of images) {
            if (image.localUri) {
              console.log('Uploading image for new recall...');
              await uploadImageToDatabase(image.localUri, recallId, image.contentType);
            }
          }
        }

        console.log('Recall created successfully');
      }

      router.back();
    } catch (error) {
      console.error('Error saving recall:', error);
      Alert.alert('Error', 'Failed to save recall');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existingNote) return;

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
              await deleteNote(existingNote.id);
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
            <View style={styles.headerRightContainer}>
              <Pressable onPress={toggleKeyboard} style={styles.headerButton}>
                <IconSymbol 
                  name={keyboardVisible ? "keyboard.chevron.compact.down" : "keyboard"} 
                  size={32} 
                  color={colors.text} 
                />
              </Pressable>
              {isEditing && (
                <Pressable onPress={handleDelete} style={styles.headerButton}>
                  <IconSymbol name="trash" size={24} color={colors.error} />
                </Pressable>
              )}
            </View>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            placeholder="What do you want to recall?"
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus={!isEditing}
          />

          {images.length > 0 && (
            <View style={styles.imagesContainer}>
              {images.map((image, index) => (
                <Animated.View
                  key={index}
                  entering={FadeInDown.delay(index * 100).duration(400)}
                  style={styles.imageWrapper}
                >
                  <Image source={{ uri: image.uri }} style={styles.image} />
                  <Pressable
                    style={styles.removeImageButton}
                    onPress={() => removeImage(index)}
                  >
                    <IconSymbol name="xmark.circle.fill" size={28} color={colors.error} />
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          )}

          <View style={styles.locationContainer}>
            <View style={styles.locationHeader}>
              <IconSymbol name="location.fill" size={20} color={colors.primary} />
              <Text style={styles.locationLabel}>Location</Text>
            </View>
            <Pressable onPress={handleLocationSearch} style={styles.locationButton}>
              <Text style={styles.locationText}>
                {location || 'Add location'}
              </Text>
              <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.actionsContainer}>
            <Pressable style={styles.actionButton} onPress={pickImage}>
              <IconSymbol name="photo" size={24} color={colors.primary} />
              <Text style={styles.actionText}>Gallery</Text>
            </Pressable>

            <Pressable style={styles.actionButton} onPress={takePhoto}>
              <IconSymbol name="camera" size={24} color={colors.primary} />
              <Text style={styles.actionText}>Camera</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <IconSymbol name="checkmark" size={24} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>
                {isEditing ? 'Update' : 'Save'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  content: {
    width: '100%',
  },
  textInput: {
    fontSize: 16,
    color: colors.text,
    minHeight: 150,
    textAlignVertical: 'top',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 16,
  },
  imagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  imageWrapper: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 14,
  },
  locationContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  locationLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  locationText: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
