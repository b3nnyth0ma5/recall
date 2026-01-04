
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Note, Person } from '@/types/Note';
import { IconSymbol } from '@/components/IconSymbol';
import { PeopleAvatarsRow } from '@/components/PeopleAvatarsRow';
import { extractLocationFromImage } from '@/utils/imageLocationExtractor';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { supabase, reverseGeocode, uploadImageToDatabase, deleteImageRecord, getImageDataUrl, triggerOCRProcessing, triggerCategoryMatching, triggerRecallEmbedding } from '@/utils/supabase';
import { useNotes } from '@/hooks/useNotes';
import { useAuth } from '@/contexts/AuthContext';
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
  Platform,
  Keyboard,
  Linking,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Modal,
} from 'react-native';
import { processRecallUrls } from '@/utils/urlProcessor';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  runOnJS,
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';
import { FullScreenImage } from '@/components/FullScreenImage';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';

interface ImageData {
  id?: string;
  uri: string;
  localUri?: string;
  contentType: string;
}

interface NoteEditorSlideUpProps {
  visible: boolean;
  noteId?: string;
  onClose: () => void;
  onSave?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_CAROUSEL_WIDTH = SCREEN_WIDTH * 0.35;
const IMAGE_CAROUSEL_SPACING = 8;

const hasUrl = (text: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
};

export function NoteEditorSlideUp({ visible, noteId, onClose, onSave }: NoteEditorSlideUpProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { getCachedNote, updateNote } = useNotes();
  
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageData[]>([]);
  const [loadedImages, setLoadedImages] = useState<Record<number, boolean>>({});
  const [location, setLocation] = useState<{ latitude: number; longitude: number; name: string; primaryType?: string } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [fullScreenImageVisible, setFullScreenImageVisible] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Load note data when modal opens
  useEffect(() => {
    if (visible && noteId && user) {
      loadNoteData();
    } else if (!visible) {
      // Reset state when modal closes
      setText('');
      setImages([]);
      setLoadedImages({});
      setLocation(null);
      setPeople([]);
      setShowPlusMenu(false);
    }
  }, [visible, noteId, user]);

  // Handle router params for location and people selection
  useEffect(() => {
    if (!visible) return;

    const handleRouterParams = () => {
      const params = router.params as any;
      
      // Handle location selection
      if (params?.selectedLatitude && params?.selectedLongitude) {
        setLocation({
          latitude: parseFloat(params.selectedLatitude),
          longitude: parseFloat(params.selectedLongitude),
          name: params.selectedLocationName || 'Selected Location',
          primaryType: params.selectedPrimaryType,
        });
        
        // Clear the params
        router.setParams({
          selectedLatitude: undefined,
          selectedLongitude: undefined,
          selectedLocationName: undefined,
          selectedPrimaryType: undefined,
        });
      }

      // Handle people selection
      if (params?.selectedPeople) {
        try {
          const selectedPeople = JSON.parse(params.selectedPeople);
          setPeople(selectedPeople);
          
          // Clear the params
          router.setParams({
            selectedPeople: undefined,
          });
        } catch (error) {
          console.error('Error parsing selected people:', error);
        }
      }
    };

    handleRouterParams();
  }, [visible, router]);

  // Keyboard listeners
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const loadNoteData = async () => {
    if (!noteId || !user) return;

    setIsLoadingNote(true);
    try {
      const note = await getCachedNote(noteId);
      
      if (note) {
        setText(note.text || '');
        
        // Load images
        if (note.images && note.images.length > 0) {
          const imagePromises = note.images.map(async (img) => {
            const imageUrl = await getImageDataUrl(img.id);
            return {
              id: img.id,
              uri: imageUrl,
              contentType: img.content_type || 'image/jpeg',
            };
          });
          
          const loadedImgs = await Promise.all(imagePromises);
          setImages(loadedImgs);
          
          // Mark all images as loaded initially
          const initialLoadedState: Record<number, boolean> = {};
          loadedImgs.forEach((_, index) => {
            initialLoadedState[index] = false;
          });
          setLoadedImages(initialLoadedState);
        }
        
        // Load location
        if (note.latitude && note.longitude) {
          setLocation({
            latitude: note.latitude,
            longitude: note.longitude,
            name: note.location_name || 'Location',
            primaryType: note.primary_type,
          });
        }
        
        // Load people
        if (note.people && note.people.length > 0) {
          setPeople(note.people);
        }
      }
    } catch (error) {
      console.error('Error loading note:', error);
      Alert.alert('Error', 'Failed to load note');
    } finally {
      setIsLoadingNote(false);
    }
  };

  const handleSave = async () => {
    if (!noteId || !user) return;
    
    if (!text.trim() && images.length === 0) {
      Alert.alert('Empty Note', 'Please add some text or images before saving.');
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Upload new images
      const uploadedImages = await Promise.all(
        images.map(async (img) => {
          if (img.id) {
            return img.id;
          } else {
            const uploadedId = await uploadImageToDatabase(img.uri, noteId, img.contentType);
            return uploadedId;
          }
        })
      );

      // Update note
      const { error: updateError } = await supabase
        .from('recalls')
        .update({
          text: text.trim(),
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          location_name: location?.name || null,
          primary_type: location?.primaryType || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', noteId)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Update people associations
      if (people.length > 0) {
        await supabase
          .from('recall_people')
          .delete()
          .eq('recall_id', noteId);

        const peopleInserts = people.map((person) => ({
          recall_id: noteId,
          person_id: person.id,
          user_id: user.id,
        }));

        await supabase.from('recall_people').insert(peopleInserts);
      }

      // Trigger edge functions
      if (uploadedImages.length > 0) {
        for (const imageId of uploadedImages) {
          if (!images.find(img => img.id === imageId)) {
            await triggerOCRProcessing(imageId);
          }
        }
      }

      await triggerCategoryMatching(noteId);
      await triggerRecallEmbedding(noteId);

      // Process URLs if present
      if (hasUrl(text)) {
        await processRecallUrls(noteId, text);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Call onSave callback to refresh the parent screen
      if (onSave) {
        onSave();
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving note:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlusPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPlusMenu(!showPlusMenu);
  };

  const handleTakePhoto = async () => {
    setShowPlusMenu(false);
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const convertedUri = await convertImageToSuitableFormat(asset.uri);
      
      const newImage: ImageData = {
        uri: convertedUri,
        contentType: 'image/jpeg',
      };
      
      setImages([...images, newImage]);
      
      // Try to extract location from image
      try {
        const imageLocation = await extractLocationFromImage(asset.uri);
        if (imageLocation && !location) {
          const locationName = await reverseGeocode(imageLocation.latitude, imageLocation.longitude);
          setLocation({
            latitude: imageLocation.latitude,
            longitude: imageLocation.longitude,
            name: locationName,
          });
        }
      } catch (error) {
        console.log('Could not extract location from image:', error);
      }
    }
  };

  const handleChooseFromLibrary = async () => {
    setShowPlusMenu(false);
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newImages = await Promise.all(
        result.assets.map(async (asset) => {
          const convertedUri = await convertImageToSuitableFormat(asset.uri);
          return {
            uri: convertedUri,
            contentType: 'image/jpeg',
          };
        })
      );
      
      setImages([...images, ...newImages]);
    }
  };

  const convertImageToSuitableFormat = async (uri: string): Promise<string> => {
    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      return manipResult.uri;
    } catch (error) {
      console.error('Error converting image:', error);
      return uri;
    }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    
    // Update loaded images state
    const newLoadedImages: Record<number, boolean> = {};
    Object.keys(loadedImages).forEach((key) => {
      const idx = parseInt(key);
      if (idx < index) {
        newLoadedImages[idx] = loadedImages[idx];
      } else if (idx > index) {
        newLoadedImages[idx - 1] = loadedImages[idx];
      }
    });
    setLoadedImages(newLoadedImages);
  };

  const handleLocationPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/location-search',
      params: { 
        returnTo: 'noteEditorSlideUp',
        noteId: noteId,
      },
    });
  };

  const handleLocationSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: '/location-search',
      params: { 
        returnTo: 'noteEditorSlideUp',
        noteId: noteId,
      },
    });
  };

  const handleRichTextPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentPeople = JSON.stringify(people);
    router.push({
      pathname: '/people-word-cloud',
      params: { 
        returnTo: 'noteEditorSlideUp',
        noteId: noteId,
        initialSelectedPeople: currentPeople,
      },
    });
  };

  const handleImagePress = (index: number) => {
    setFullScreenImageIndex(index);
    setFullScreenImageVisible(true);
  };

  const toggleKeyboard = () => {
    if (isKeyboardVisible) {
      Keyboard.dismiss();
    } else {
      textInputRef.current?.focus();
    }
  };

  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return (
      <Text style={styles.noteText}>
        {parts.map((part, index) => {
          if (part.match(urlRegex)) {
            return (
              <Text
                key={index}
                style={styles.linkText}
                onPress={() => Linking.openURL(part)}
              >
                {part}
              </Text>
            );
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  const handleBackdropPress = () => {
    if (showPlusMenu) {
      setShowPlusMenu(false);
    } else {
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Animated.View 
          entering={SlideInDown.duration(300)}
          style={styles.slideUpContainer}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            {/* Header with rounded top border */}
            <View style={styles.header}>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <IconSymbol 
                  ios_icon_name="xmark" 
                  android_material_icon_name="close" 
                  size={24} 
                  color={colors.text} 
                />
              </Pressable>
              <Text style={styles.headerTitle}>Edit Recall</Text>
              <Pressable 
                onPress={handleSave} 
                disabled={isSaving || (!text.trim() && images.length === 0)}
                style={styles.saveButton}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[
                    styles.saveButtonText,
                    (!text.trim() && images.length === 0) && styles.saveButtonTextDisabled
                  ]}>
                    Save
                  </Text>
                )}
              </Pressable>
            </View>

            {isLoadingNote ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <ScrollView 
                ref={scrollViewRef}
                style={styles.content}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Text Input */}
                <TextInput
                  ref={textInputRef}
                  style={styles.textInput}
                  placeholder="What's on your mind?"
                  placeholderTextColor={colors.textTertiary}
                  value={text}
                  onChangeText={setText}
                  multiline
                  textAlignVertical="top"
                  autoFocus={false}
                />

                {/* Image Counter */}
                {images.length > 0 && (
                  <View style={styles.imageCounterContainer}>
                    <Text style={styles.imageCounter}>
                      {images.length} {images.length === 1 ? 'image' : 'images'}
                    </Text>
                  </View>
                )}

                {/* Horizontally Scrollable Image Carousel - No lazy loading */}
                {images.length > 0 && (
                  <ScrollView
                    horizontal
                    pagingEnabled={false}
                    showsHorizontalScrollIndicator={false}
                    style={styles.imageCarousel}
                    contentContainerStyle={styles.imageCarouselContent}
                  >
                    {images.map((image, index) => (
                      <View key={index} style={styles.imageContainer}>
                        <Pressable onPress={() => handleImagePress(index)}>
                          <Image
                            source={{ uri: image.uri }}
                            style={styles.carouselImage}
                            onLoadEnd={() => {
                              // Mark image as loaded
                              setLoadedImages(prev => ({ ...prev, [index]: true }));
                            }}
                          />
                          {!loadedImages[index] && (
                            <View style={styles.imageLoadingOverlay}>
                              <ActivityIndicator size="small" color={colors.primary} />
                            </View>
                          )}
                        </Pressable>
                        <Pressable
                          style={styles.removeImageButton}
                          onPress={() => removeImage(index)}
                        >
                          <IconSymbol 
                            ios_icon_name="xmark.circle.fill" 
                            android_material_icon_name="cancel" 
                            size={24} 
                            color="#FF3B30" 
                          />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {/* Location Display */}
                {location && (
                  <Pressable style={styles.locationContainer} onPress={handleLocationPress}>
                    <IconSymbol 
                      ios_icon_name="location.fill" 
                      android_material_icon_name="location-on" 
                      size={20} 
                      color={colors.primary} 
                    />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {location.name}
                    </Text>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        setLocation(null);
                      }}
                      style={styles.removeLocationButton}
                    >
                      <IconSymbol 
                        ios_icon_name="xmark.circle.fill" 
                        android_material_icon_name="cancel" 
                        size={18} 
                        color={colors.textSecondary} 
                      />
                    </Pressable>
                  </Pressable>
                )}

                {/* People Display */}
                {people.length > 0 && (
                  <Pressable style={styles.peopleContainer} onPress={handleRichTextPress}>
                    <PeopleAvatarsRow people={people} maxVisible={5} size={32} />
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        setPeople([]);
                      }}
                      style={styles.removePeopleButton}
                    >
                      <IconSymbol 
                        ios_icon_name="xmark.circle.fill" 
                        android_material_icon_name="cancel" 
                        size={18} 
                        color={colors.textSecondary} 
                      />
                    </Pressable>
                  </Pressable>
                )}

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <Pressable style={styles.actionButton} onPress={handlePlusPress}>
                    <IconSymbol 
                      ios_icon_name="photo" 
                      android_material_icon_name="image" 
                      size={24} 
                      color={colors.primary} 
                    />
                    <Text style={styles.actionButtonText}>Photos</Text>
                  </Pressable>

                  <Pressable style={styles.actionButton} onPress={handleLocationSearch}>
                    <IconSymbol 
                      ios_icon_name="location" 
                      android_material_icon_name="location-on" 
                      size={24} 
                      color={colors.primary} 
                    />
                    <Text style={styles.actionButtonText}>Location</Text>
                  </Pressable>

                  <Pressable style={styles.actionButton} onPress={handleRichTextPress}>
                    <IconSymbol 
                      ios_icon_name="person.2" 
                      android_material_icon_name="group" 
                      size={24} 
                      color={colors.primary} 
                    />
                    <Text style={styles.actionButtonText}>People</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}

            {/* Plus Menu */}
            {showPlusMenu && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.plusMenu}>
                <Pressable style={styles.plusMenuItem} onPress={handleTakePhoto}>
                  <IconSymbol 
                    ios_icon_name="camera.fill" 
                    android_material_icon_name="camera" 
                    size={24} 
                    color={colors.primary} 
                  />
                  <Text style={styles.plusMenuItemText}>Take Photo</Text>
                </Pressable>
                <Pressable style={styles.plusMenuItem} onPress={handleChooseFromLibrary}>
                  <IconSymbol 
                    ios_icon_name="photo.on.rectangle" 
                    android_material_icon_name="photo-library" 
                    size={24} 
                    color={colors.primary} 
                  />
                  <Text style={styles.plusMenuItemText}>Choose from Library</Text>
                </Pressable>
              </Animated.View>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>

      {/* Full Screen Image Viewer */}
      <FullScreenImage
        visible={fullScreenImageVisible}
        images={images.map(img => img.uri)}
        imageIds={images.map(img => img.id).filter(Boolean) as string[]}
        initialIndex={fullScreenImageIndex}
        onClose={() => setFullScreenImageVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  slideUpContainer: {
    height: SCREEN_HEIGHT * 0.85,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    padding: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  saveButtonTextDisabled: {
    color: colors.textTertiary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  textInput: {
    fontSize: 16,
    color: colors.text,
    minHeight: 180,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  imageCounterContainer: {
    marginBottom: 8,
  },
  imageCounter: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  imageCarousel: {
    marginBottom: 16,
  },
  imageCarouselContent: {
    paddingRight: 16,
  },
  imageContainer: {
    marginRight: IMAGE_CAROUSEL_SPACING,
    position: 'relative',
  },
  carouselImage: {
    width: IMAGE_CAROUSEL_WIDTH,
    height: IMAGE_CAROUSEL_WIDTH * 1.2,
    borderRadius: 12,
    backgroundColor: colors.border,
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  locationText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
  },
  removeLocationButton: {
    padding: 4,
  },
  peopleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  removePeopleButton: {
    marginLeft: 8,
    padding: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingBottom: 16,
  },
  actionButton: {
    alignItems: 'center',
    padding: 12,
  },
  actionButtonText: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  plusMenu: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  plusMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
  },
  plusMenuItemText: {
    marginLeft: 12,
    fontSize: 16,
    color: colors.text,
  },
  noteText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  linkText: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
