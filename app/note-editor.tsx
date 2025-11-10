
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
  Modal,
  Dimensions,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/Note';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, reverseGeocode, uploadImageToDatabase, deleteImageRecord, getImageDataUrl, triggerOCRProcessing, getImageOCRResults } from '@/utils/supabase';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/contexts/AuthContext';

interface ImageData {
  id?: string;
  uri: string;
  localUri?: string;
  contentType: string;
}

interface OCRData {
  ocrText?: string;
  explanation?: string;
  processedAt?: string;
  isProcessing?: boolean;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function NoteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { addNote, updateNote, deleteNote, refreshNotes, refreshSingleNote } = useNotes();

  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [selectedLocationData, setSelectedLocationData] = useState<{
    latitude: number;
    longitude: number;
    displayName: string;
    formattedName: string;
  } | null>(null);
  const [isOCRModalVisible, setIsOCRModalVisible] = useState(false);
  const [ocrDataList, setOcrDataList] = useState<OCRData[]>([]);
  const [loadingOCR, setLoadingOCR] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const imageScrollRef = useRef<ScrollView>(null);

  const isEditing = !!params.id;
  const canSave = text.trim().length > 0 || images.length > 0;
  const hasImages = images.length > 0;

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

  // Load note data directly from Supabase when editing
  useEffect(() => {
    const loadNoteFromDatabase = async () => {
      if (!isEditing || !params.id || !user) {
        return;
      }

      try {
        setLoadingNote(true);
        console.log('Loading note from database:', params.id);

        // Fetch the note data
        const { data: recallData, error: recallError } = await supabase
          .from('recalls')
          .select('*')
          .eq('id', params.id)
          .eq('user_id', user.id)
          .single();

        if (recallError || !recallData) {
          console.error('Error loading recall:', recallError);
          Alert.alert('Error', 'Failed to load note');
          router.back();
          return;
        }

        console.log('Note loaded from database:', recallData);

        // Set text and location data
        setText(recallData.text || '');
        setLocationName(recallData.location || '');
        
        if (recallData.latitude && recallData.longitude) {
          setLocation({
            latitude: recallData.latitude,
            longitude: recallData.longitude,
          });
        }

        // Load images for this note
        const { data: imagesData, error: imagesError } = await supabase
          .from('recall_images')
          .select('id')
          .eq('recall_id', params.id)
          .order('created_at', { ascending: true });

        if (imagesError) {
          console.error('Error loading images:', imagesError);
        } else if (imagesData && imagesData.length > 0) {
          console.log(`Loading ${imagesData.length} images for note`);
          
          const loadedImages: ImageData[] = [];
          
          for (const img of imagesData) {
            try {
              const dataUrl = await getImageDataUrl(img.id);
              if (dataUrl) {
                loadedImages.push({
                  id: img.id,
                  uri: dataUrl,
                  contentType: 'image/jpeg',
                });
                console.log(`Image ${img.id} loaded successfully`);
              } else {
                console.error(`Failed to load image ${img.id}`);
              }
            } catch (error) {
              console.error(`Error loading image ${img.id}:`, error);
            }
          }
          
          setImages(loadedImages);
          console.log(`Loaded ${loadedImages.length}/${imagesData.length} images`);
        }
      } catch (error) {
        console.error('Error loading note:', error);
        Alert.alert('Error', 'Failed to load note');
        router.back();
      } finally {
        setLoadingNote(false);
      }
    };

    loadNoteFromDatabase();
  }, [params.id, isEditing, user, router]);

  useEffect(() => {
    if (!isEditing) {
      requestLocationPermission();
    }
  }, [isEditing]);

  useEffect(() => {
    if (params.selectedLatitude && params.selectedLongitude && params.selectedLocationName) {
      const latitude = parseFloat(params.selectedLatitude as string);
      const longitude = parseFloat(params.selectedLongitude as string);
      const displayName = params.selectedLocationName as string;

      console.log('Location updated from search:', { latitude, longitude, displayName });
      
      // Extract formatted location name
      const formattedName = extractLocationFromSelection(displayName);
      
      setLocation({ latitude, longitude });
      setLocationName(formattedName);
      setSelectedLocationData({ latitude, longitude, displayName, formattedName });
      setIsLocationModalVisible(true);

      router.setParams({
        selectedLatitude: undefined,
        selectedLongitude: undefined,
        selectedLocationName: undefined,
      });
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName, router]);

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

  const extractLocationFromSelection = (displayName: string): string => {
    const parts = displayName.split(',').map(p => p.trim());
    
    if (parts.length < 2) {
      return displayName;
    }

    const firstPart = parts[0];
    const secondPart = parts[1];
		const fourthPart = parts[3];
    
    // If first part is a street number, use second and third parts
    if (firstPart && /^\d/.test(firstPart)) {
      if (parts.length >= 3) {
        return `${secondPart}, ${parts[2]}`;
      }
      return secondPart;
    }
    
    // Otherwise use first and fourth parts
    return `${firstPart}, ${fourthPart}`;
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
      const uploadedImageIds: string[] = [];

      for (const image of images) {
        if (image.localUri) {
          console.log('Uploading image to database:', image.localUri);
          
          const imageId = await uploadImageToDatabase(image.localUri, recallId, image.contentType);
          
          if (imageId) {
            uploadedCount++;
            uploadedImageIds.push(imageId);
            console.log('Image uploaded successfully to database');
            
            // Trigger OCR processing for the uploaded image
            console.log('Triggering OCR processing for image:', imageId);
            triggerOCRProcessing(imageId).then(result => {
              if (result.success) {
                console.log('OCR processing triggered successfully for image:', imageId);
              } else {
                console.error('Failed to trigger OCR processing:', result.error);
              }
            }).catch(error => {
              console.error('Error triggering OCR processing:', error);
            });
          } else {
            failedCount++;
            console.error('Failed to upload image to database');
          }
        }
      }

      console.log(`Upload complete: ${uploadedCount} succeeded, ${failedCount} failed`);
      if (uploadedImageIds.length > 0) {
        console.log(`OCR processing triggered for ${uploadedImageIds.length} images`);
      }

      if (failedCount > 0) {
        Alert.alert(
          'Partial Upload',
          `${uploadedCount} image(s) uploaded successfully, but ${failedCount} failed. Check console logs for details.`,
          [{ text: 'OK' }]
        );
      }

      // Navigate back first
      router.back();
      
      // Refresh the specific note that was updated or the entire list for new notes
      if (isEditing && params.id) {
        setTimeout(() => {
          refreshSingleNote(params.id as string);
        }, 100);
      } else {
        setTimeout(() => {
          refreshNotes();
        }, 100);
      }
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

  const handleCloseLocationModal = () => {
    setIsLocationModalVisible(false);
    setSelectedLocationData(null);
  };

  const handleShowOCRInfo = async () => {
    if (!hasImages) {
      return;
    }

    setIsOCRModalVisible(true);
    setLoadingOCR(true);

    try {
      const ocrResults: OCRData[] = [];
      const fetchPromises: Promise<void>[] = [];

      // Fetch all OCR data in parallel
      for (const image of images) {
        const fetchPromise = (async () => {
          if (!image.id) {
            // Image not yet saved, skip
            ocrResults.push({
              ocrText: 'Image not yet saved',
              explanation: 'Please save the note first to process this image.',
            });
            return;
          }

          // Check if image has been processed
          const { data: imageData, error } = await supabase
            .from('recall_images')
            .select('processed_at')
            .eq('id', image.id)
            .single();

          if (error) {
            console.error('Error checking image processing status:', error);
            ocrResults.push({
              ocrText: 'Error loading OCR data',
              explanation: 'Failed to check processing status.',
            });
            return;
          }

          // If not processed, trigger OCR
          if (!imageData.processed_at) {
            console.log('Image not processed, triggering OCR:', image.id);
            const triggerResult = await triggerOCRProcessing(image.id);
            
            if (!triggerResult.success) {
              console.error('Failed to trigger OCR:', triggerResult.error);
              ocrResults.push({
                ocrText: 'Processing failed',
                explanation: 'Failed to trigger OCR processing.',
              });
              return;
            }

            // Wait for processing to complete (with timeout)
            let attempts = 0;
            const maxAttempts = 15; // 30 seconds max wait
            
            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              const ocrData = await getImageOCRResults(image.id);
              
              if (ocrData && !ocrData.isProcessing && ocrData.processedAt) {
                ocrResults.push({
                  ocrText: ocrData.ocrText || 'No text detected',
                  explanation: ocrData.explanation || 'No explanation available',
                  processedAt: ocrData.processedAt,
                  isProcessing: false,
                });
                return;
              }
              
              attempts++;
            }
            
            // Timeout - still processing
            ocrResults.push({
              ocrText: 'Processing...',
              explanation: 'Image is still being processed. Please try again in a moment.',
              isProcessing: true,
            });
            return;
          }

          // Fetch OCR results
          const ocrData = await getImageOCRResults(image.id);
          
          if (ocrData) {
            ocrResults.push({
              ocrText: ocrData.ocrText || 'No text detected',
              explanation: ocrData.explanation || 'No explanation available',
              processedAt: ocrData.processedAt,
              isProcessing: ocrData.isProcessing,
            });
          } else {
            ocrResults.push({
              ocrText: 'Loading...',
              explanation: 'Processing in progress...',
              isProcessing: true,
            });
          }
        })();

        fetchPromises.push(fetchPromise);
      }

      // Wait for all fetches to complete
      await Promise.all(fetchPromises);

      setOcrDataList(ocrResults);
    } catch (error) {
      console.error('Error loading OCR data:', error);
      Alert.alert('Error', 'Failed to load OCR data');
    } finally {
      setLoadingOCR(false);
    }
  };

  const handleCloseOCRModal = () => {
    setIsOCRModalVisible(false);
    setOcrDataList([]);
  };

  const handleImageScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const imageWidth = SCREEN_WIDTH - 32;
    const index = Math.round(contentOffsetX / (imageWidth + 12));
    if (index !== currentImageIndex && index >= 0 && index < images.length) {
      setCurrentImageIndex(index);
    }
  };

  // Show loading state while fetching note data
  if (loadingNote) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Loading...',
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.text,
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading note...</Text>
        </View>
      </View>
    );
  }

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
              {hasImages && (
                <Pressable onPress={handleShowOCRInfo} style={styles.headerIconButton}>
                  <IconSymbol name="sparkles" size={22} color={colors.primary} />
                </Pressable>
              )}
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
            </View>
          ),
        }}
      />

      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={true}
      >
        {/* Text Input Section */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.textInputContainer}>
          {hasUrl(text) ? (
            <View style={styles.richTextContainer}>
              <Text style={styles.richText}>
                {renderTextWithLinks(text)}
              </Text>
              <TextInput
                ref={textInputRef}
                style={[styles.textInput, styles.hiddenInput]}
                placeholder="What's on your mind?"
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={setText}
                multiline
                autoFocus={!isEditing}
                scrollEnabled={false}
              />
            </View>
          ) : (
            <TextInput
              ref={textInputRef}
              style={styles.textInput}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textTertiary}
              value={text}
              onChangeText={setText}
              multiline
              autoFocus={!isEditing}
              scrollEnabled={false}
            />
          )}
        </Animated.View>

        {/* Location Info */}
        {locationName && (
          <Animated.View entering={FadeIn.duration(600).delay(200)} style={styles.locationInfo}>
            <IconSymbol name="location.fill" size={16} color={colors.textSecondary} />
            <Text style={styles.locationText}>{locationName}</Text>
          </Animated.View>
        )}

        {/* Images Section */}
        {hasImages && (
          <Animated.View entering={FadeInDown.duration(600).delay(400)} style={styles.imagesContainer}>
            <View style={styles.imagesHeader}>
              <Text style={styles.imagesTitle}>{images.length} {images.length === 1 ? 'Image' : 'Images'}</Text>
              <View style={styles.paginationDots}>
                {images.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      index === currentImageIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            </View>
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imagesScrollContent}
              onScroll={handleImageScroll}
              scrollEventThrottle={16}
              decelerationRate="fast"
              snapToInterval={SCREEN_WIDTH - 32 + 12}
            >
              {images.map((image, index) => (
                <View key={`${image.id || 'new'}-${index}`} style={styles.imageWrapper}>
                  <Image source={{ uri: image.uri }} style={styles.image} resizeMode="cover" />
                  <Pressable
                    onPress={() => removeImage(index)}
                    style={styles.removeImageButton}
                  >
                    <View style={styles.removeButtonCircle}>
                      <IconSymbol name="xmark" size={16} color="#FFFFFF" />
                    </View>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </ScrollView>

      {/* Toolbar */}
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
              <IconSymbol name="camera.fill" size={26} color={colors.primary} />
            )}
          </Pressable>
          <Pressable
            onPress={pickImage}
            disabled={loading}
            style={styles.toolbarButton}
          >
            <IconSymbol name="photo.fill" size={26} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={handleLocationSearch}
            style={styles.toolbarButton}
          >
            <IconSymbol name="mappin.circle.fill" size={26} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={toggleKeyboard}
            style={styles.toolbarButton}
          >
            <IconSymbol 
              name={keyboardVisible ? "keyboard.chevron.compact.down" : "keyboard"} 
              size={26} 
              color={colors.primary} 
            />
          </Pressable>
        </View>

        {isEditing && (
          <Pressable
            onPress={handleDelete}
            style={styles.toolbarButton}
          >
            <IconSymbol name="trash" size={26} color={colors.error} />
          </Pressable>
        )}
      </View>

      {/* Location Modal */}
      <Modal
        visible={isLocationModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseLocationModal}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={handleCloseLocationModal}
        >
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={styles.modalContent}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <IconSymbol name="mappin.circle.fill" size={32} color={colors.primary} />
                <Text style={styles.modalTitle}>Location Updated</Text>
              </View>

              {selectedLocationData && (
                <View style={styles.modalBody}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Formatted Location:</Text>
                    <Text style={styles.modalValue}>{selectedLocationData.formattedName}</Text>
                  </View>

                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Full Address:</Text>
                    <Text style={styles.modalValue}>{selectedLocationData.displayName}</Text>
                  </View>

                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Latitude:</Text>
                    <Text style={styles.modalValue}>{selectedLocationData.latitude.toFixed(6)}</Text>
                  </View>

                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Longitude:</Text>
                    <Text style={styles.modalValue}>{selectedLocationData.longitude.toFixed(6)}</Text>
                  </View>
                </View>
              )}

              <Pressable
                onPress={handleCloseLocationModal}
                style={styles.modalButton}
              >
                <Text style={styles.modalButtonText}>Close</Text>
              </Pressable>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      {/* OCR Information Modal */}
      <Modal
        visible={isOCRModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseOCRModal}
      >
        <View style={styles.modalOverlay}>
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={[styles.modalContent, styles.ocrModalContent]}
          >
            <View style={styles.modalHeader}>
              <IconSymbol name="sparkles" size={32} color={colors.primary} />
              <Text style={styles.modalTitle}>Image Analysis</Text>
            </View>

            {loadingOCR ? (
              <View style={styles.ocrLoadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.ocrLoadingText}>Analyzing images...</Text>
                <Text style={styles.ocrLoadingSubtext}>This may take a moment</Text>
              </View>
            ) : (
              <ScrollView 
                style={styles.ocrScrollView} 
                contentContainerStyle={styles.ocrScrollContent}
                showsVerticalScrollIndicator={true}
              >
                {ocrDataList.map((ocrData, index) => (
                  <View key={index} style={styles.ocrImageSection}>
                    <View style={styles.ocrImageHeader}>
                      <Image source={{ uri: images[index]?.uri }} style={styles.ocrImageThumbnail} />
                      <Text style={styles.ocrImageTitle}>Image {index + 1} of {images.length}</Text>
                    </View>

                    {ocrData.isProcessing ? (
                      <View style={styles.ocrProcessingContainer}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.ocrProcessingText}>Processing...</Text>
                      </View>
                    ) : (
                      <>
                        {ocrData.ocrText && ocrData.ocrText !== 'No text detected' && (
                          <View style={styles.ocrSection}>
                            <View style={styles.ocrSectionHeader}>
                              <IconSymbol name="doc.text" size={18} color={colors.primary} />
                              <Text style={styles.ocrSectionTitle}>Extracted Text</Text>
                            </View>
                            <Text style={styles.ocrText}>
                              {ocrData.ocrText}
                            </Text>
                          </View>
                        )}

                        {ocrData.explanation && (
                          <View style={styles.ocrSection}>
                            <View style={styles.ocrSectionHeader}>
                              <IconSymbol name="sparkles" size={18} color={colors.primary} />
                              <Text style={styles.ocrSectionTitle}>AI Explanation</Text>
                            </View>
                            <Text style={styles.ocrText}>
                              {ocrData.explanation}
                            </Text>
                          </View>
                        )}

                        {ocrData.processedAt && (
                          <Text style={styles.ocrTimestamp}>
                            Processed: {new Date(ocrData.processedAt).toLocaleString()}
                          </Text>
                        )}
                      </>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable
              onPress={handleCloseOCRModal}
              style={styles.modalButton}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
    marginRight: 8,
  },
  headerIconButton: {
    padding: 8,
    backgroundColor: colors.card,
    borderRadius: 20,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
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
    padding: 20,
    minHeight: 150,
  },
  textInput: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    minHeight: 150,
    textAlignVertical: 'top',
  },
  richTextContainer: {
    position: 'relative',
    minHeight: 150,
  },
  richText: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    minHeight: 150,
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
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  locationText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  imagesContainer: {
    paddingVertical: 16,
  },
  imagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  imagesTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  paginationDots: {
    flexDirection: 'row',
    gap: 6,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  paginationDotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },
  imagesScrollContent: {
    paddingHorizontal: 16,
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 12,
    width: SCREEN_WIDTH - 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: SCREEN_WIDTH - 32,
    height: (SCREEN_WIDTH - 32) * 0.75,
    borderRadius: 16,
    backgroundColor: colors.cardDark,
  },
  removeImageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  removeButtonCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  toolbarButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.6)',
    elevation: 10,
  },
  ocrModalContent: {
    maxWidth: 500,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 12,
  },
  modalBody: {
    marginBottom: 24,
  },
  modalRow: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  modalValue: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  ocrLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  ocrLoadingText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  ocrLoadingSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  ocrScrollView: {
    maxHeight: SCREEN_HEIGHT * 0.6,
    marginBottom: 16,
  },
  ocrScrollContent: {
    paddingBottom: 8,
  },
  ocrImageSection: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ocrImageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  ocrImageThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  ocrImageTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  ocrProcessingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  ocrProcessingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  ocrSection: {
    marginBottom: 16,
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
  },
  ocrSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  ocrSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  ocrText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  ocrTimestamp: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
});
