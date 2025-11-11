
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
const IMAGE_CAROUSEL_WIDTH = SCREEN_WIDTH - 32;
const IMAGE_CAROUSEL_SPACING = 12;

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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [selectedLocationData, setSelectedLocationData] = useState<{
    latitude: number;
    longitude: number;
    displayName: string;
    formattedName: string;
    fullAddress: string;
  } | null>(null);
  const [isOCRModalVisible, setIsOCRModalVisible] = useState(false);
  const [ocrDataList, setOcrDataList] = useState<OCRData[]>([]);
  const [loadingOCR, setLoadingOCR] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [currentAnalysisData, setCurrentAnalysisData] = useState<OCRData | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const imageScrollRef = useRef<ScrollView>(null);
  const fullScreenScrollRef = useRef<ScrollView>(null);

  const isEditing = !!params.id;
  const canSave = text.trim().length > 0 || images.length > 0;
  const hasImages = images.length > 0;

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
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
      const formattedName = params.selectedLocationName as string;
      const displayName = params.selectedDisplayName as string || formattedName;
      const fullAddress = params.selectedFullAddress as string || formattedName;

      console.log('Location updated from search:', { latitude, longitude, formattedName, displayName, fullAddress });
      
      setLocation({ latitude, longitude });
      setLocationName(formattedName);
      setSelectedLocationData({ latitude, longitude, displayName, formattedName, fullAddress });
      setIsLocationModalVisible(true);

      router.setParams({
        selectedLatitude: undefined,
        selectedLongitude: undefined,
        selectedLocationName: undefined,
        selectedDisplayName: undefined,
        selectedFullAddress: undefined,
      });
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName, params.selectedDisplayName, params.selectedFullAddress, router]);

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
    
    // Show confirmation dialog
    Alert.alert(
      'Delete Image',
      'Are you sure you want to delete this image?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (image.id) {
              try {
                await deleteImageRecord(image.id);
              } catch (error) {
                console.error('Error deleting image:', error);
              }
            }
            
            const newImages = images.filter((_, i) => i !== index);
            setImages(newImages);
          },
        },
      ]
    );
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
        // Update the note (text and location only)
        await updateNote(params.id as string, noteData);
        recallId = params.id as string;

        // Get existing images from database
        const { data: existingImages } = await supabase
          .from('recall_images')
          .select('id')
          .eq('recall_id', recallId);

        // Create a set of current image IDs (images that should be kept)
        const currentImageIds = new Set(
          images
            .filter(img => img.id) // Only existing images with IDs
            .map(img => img.id!)
        );

        // Delete images that are no longer in the current images array
        if (existingImages) {
          for (const img of existingImages) {
            if (!currentImageIds.has(img.id)) {
              console.log('Deleting removed image:', img.id);
              await deleteImageRecord(img.id);
            } else {
              console.log('Keeping existing image:', img.id);
            }
          }
        }
      } else {
        // Create new note
        recallId = await addNote(noteData);
      }

      // Only upload NEW images (those without an id)
      let uploadedCount = 0;
      let failedCount = 0;
      const uploadedImageIds: string[] = [];

      for (const image of images) {
        // Skip images that already have an ID (already in database)
        if (image.id) {
          console.log('Skipping existing image:', image.id);
          continue;
        }

        // Only upload new images (those with localUri but no id)
        if (image.localUri) {
          console.log('Uploading new image to database:', image.localUri);
          
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

      console.log(`Upload complete: ${uploadedCount} new images uploaded, ${failedCount} failed`);
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
    const index = Math.round(contentOffsetX / (IMAGE_CAROUSEL_WIDTH + IMAGE_CAROUSEL_SPACING));
    if (index !== currentImageIndex && index >= 0 && index < images.length) {
      setCurrentImageIndex(index);
    }
  };

  const handleImagePress = (index: number) => {
    setFullScreenImageIndex(index);
    setShowFullScreenImage(true);
  };

  const handleFullScreenScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    if (index !== fullScreenImageIndex && index >= 0 && index < images.length) {
      setFullScreenImageIndex(index);
    }
  };

  const handleBrainIconPress = async () => {
    const currentImage = images[fullScreenImageIndex];
    if (!currentImage || !currentImage.id) {
      Alert.alert('Image Not Saved', 'Please save the note first to analyze this image.');
      return;
    }

    setLoadingAnalysis(true);
    setShowAnalysisModal(true);

    try {
      const ocrData = await getImageOCRResults(currentImage.id);
      if (ocrData) {
        setCurrentAnalysisData({
          ocrText: ocrData.ocrText,
          explanation: ocrData.explanation,
          processedAt: ocrData.processedAt,
          isProcessing: ocrData.isProcessing,
        });
      } else {
        setCurrentAnalysisData({
          ocrText: 'No analysis available',
          explanation: 'This image has not been analyzed yet.',
        });
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
      setCurrentAnalysisData({
        ocrText: 'Error loading analysis',
        explanation: 'Failed to load image analysis data.',
      });
    } finally {
      setLoadingAnalysis(false);
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
    <View style={styles.container}>
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
                  <IconSymbol name="sparkles" size={24} color={colors.primary} />
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
        {/* Text Input Section with fixed height and scrolling */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.textInputContainer}>
          {hasUrl(text) ? (
            <View style={styles.richTextContainer}>
              <ScrollView 
                style={styles.textInputScrollView}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.richText}>
                  {renderTextWithLinks(text)}
                </Text>
              </ScrollView>
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
            <ScrollView 
              style={styles.textInputScrollView}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={true}
            >
              <TextInput
                ref={textInputRef}
                style={styles.textInputMultiline}
                placeholder="What's on your mind?"
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={setText}
                multiline
                autoFocus={!isEditing}
                scrollEnabled={false}
              />
            </ScrollView>
          )}
        </Animated.View>

        {/* Spacer to push content down */}
        <View style={styles.spacer} />
      </ScrollView>

      {/* Images Section - Above Location */}
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
            snapToInterval={IMAGE_CAROUSEL_WIDTH + IMAGE_CAROUSEL_SPACING}
          >
            {images.map((image, index) => (
              <Pressable 
                key={`${image.id || 'new'}-${index}`} 
                style={styles.imageWrapper}
                onPress={() => handleImagePress(index)}
              >
                <Image source={{ uri: image.uri }} style={styles.image} resizeMode="cover" />
                <Pressable
                  onPress={() => removeImage(index)}
                  style={styles.removeImageButton}
                >
                  <View style={styles.removeButtonCircle}>
                    <IconSymbol name="xmark" size={16} color="#FFFFFF" />
                  </View>
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* Location Info - Above Toolbar */}
      {locationName && (
        <Animated.View entering={FadeIn.duration(600).delay(200)} style={styles.locationInfo}>
          <IconSymbol name="location.fill" size={16} color={colors.textSecondary} />
          <Text style={styles.locationText}>{locationName}</Text>
        </Animated.View>
      )}

      {/* Toolbar - Positioned above keyboard when visible */}
      <View style={[
        styles.toolbar,
        keyboardVisible && Platform.OS === 'ios' && { 
          position: 'absolute',
          bottom: keyboardHeight,
          left: 0,
          right: 0,
        }
      ]}>
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

      {/* Full Screen Image Modal */}
      <Modal
        visible={showFullScreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFullScreenImage(false)}
      >
        <View style={styles.fullScreenContainer}>
          <Pressable 
            style={styles.fullScreenCloseButton}
            onPress={() => setShowFullScreenImage(false)}
          >
            <View style={styles.closeButtonCircle}>
              <IconSymbol name="xmark" size={24} color="#FFFFFF" />
            </View>
          </Pressable>

          {/* Floating Pink Brain Icon */}
          <Pressable 
            style={styles.brainButton}
            onPress={handleBrainIconPress}
          >
            <View style={styles.brainButtonCircle}>
              <Text style={styles.brainEmoji}>🧠</Text>
            </View>
          </Pressable>

          <ScrollView
            ref={fullScreenScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleFullScreenScroll}
            scrollEventThrottle={16}
            snapToInterval={SCREEN_WIDTH}
            decelerationRate="fast"
            style={styles.fullScreenScrollView}
            contentOffset={{ x: fullScreenImageIndex * SCREEN_WIDTH, y: 0 }}
          >
            {images.map((image, index) => (
              <View key={`fullscreen-${image.id || 'new'}-${index}`} style={styles.fullScreenImageWrapper}>
                <Image
                  source={{ uri: image.uri }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>

          {/* Pagination dots */}
          {images.length > 1 && (
            <View style={styles.fullScreenPaginationContainer}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.fullScreenPaginationDot,
                    fullScreenImageIndex === index && styles.fullScreenPaginationDotActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Counter badge */}
          {images.length > 1 && (
            <View style={styles.fullScreenCounterBadge}>
              <Text style={styles.fullScreenCounterText}>
                {fullScreenImageIndex + 1} / {images.length}
              </Text>
            </View>
          )}
        </View>
      </Modal>

      {/* Image Analysis Modal */}
      <Modal
        visible={showAnalysisModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAnalysisModal(false)}
      >
        <Pressable 
          style={styles.analysisModalOverlay}
          onPress={() => setShowAnalysisModal(false)}
        >
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={styles.analysisModalContent}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.analysisModalHeader}>
                <Text style={styles.brainEmoji}>🧠</Text>
                <Text style={styles.analysisModalTitle}>Image Analysis</Text>
                <Pressable 
                  onPress={() => setShowAnalysisModal(false)}
                  style={styles.analysisCloseButton}
                >
                  <IconSymbol name="xmark" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              {loadingAnalysis ? (
                <View style={styles.analysisLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.analysisLoadingText}>Loading analysis...</Text>
                </View>
              ) : (
                <ScrollView style={styles.analysisScrollView}>
                  {currentAnalysisData?.ocrText && (
                    <View style={styles.analysisSection}>
                      <View style={styles.analysisSectionHeader}>
                        <IconSymbol name="doc.text" size={18} color={colors.primary} />
                        <Text style={styles.analysisSectionTitle}>Extracted Text</Text>
                      </View>
                      <Text style={styles.analysisText}>{currentAnalysisData.ocrText}</Text>
                    </View>
                  )}

                  {currentAnalysisData?.explanation && (
                    <View style={styles.analysisSection}>
                      <View style={styles.analysisSectionHeader}>
                        <IconSymbol name="sparkles" size={18} color={colors.primary} />
                        <Text style={styles.analysisSectionTitle}>AI Explanation</Text>
                      </View>
                      <Text style={styles.analysisText}>{currentAnalysisData.explanation}</Text>
                    </View>
                  )}

                  {currentAnalysisData?.processedAt && (
                    <Text style={styles.analysisTimestamp}>
                      Processed: {new Date(currentAnalysisData.processedAt).toLocaleString()}
                    </Text>
                  )}
                </ScrollView>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

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
                    <Text style={styles.modalLabel}>Saved Location:</Text>
                    <Text style={styles.modalValue}>{selectedLocationData.formattedName}</Text>
                  </View>

                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Place Name:</Text>
                    <Text style={styles.modalValue}>{selectedLocationData.displayName}</Text>
                  </View>

                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Full Address:</Text>
                    <Text style={styles.modalValue}>{selectedLocationData.fullAddress}</Text>
                  </View>

                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Coordinates:</Text>
                    <Text style={styles.modalValue}>
                      {selectedLocationData.latitude.toFixed(6)}, {selectedLocationData.longitude.toFixed(6)}
                    </Text>
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
    </View>
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
    gap: 16,
    marginRight: 8,
  },
  headerIconButton: {
    padding: 10,
    backgroundColor: colors.card,
    borderRadius: 22,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
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
    height: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInputContainer: {
    padding: 20,
    height: 260,
  },
  textInputScrollView: {
    flex: 1,
  },
  textInput: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    textAlignVertical: 'top',
  },
  textInputMultiline: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    minHeight: 220,
    textAlignVertical: 'top',
  },
  richTextContainer: {
    position: 'relative',
    flex: 1,
  },
  richText: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
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
  spacer: {
    flex: 1,
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
    marginBottom: 8,
  },
  locationText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  imagesContainer: {
    paddingVertical: 16,
    marginBottom: 8,
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
    marginRight: IMAGE_CAROUSEL_SPACING,
    width: IMAGE_CAROUSEL_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: {
    width: IMAGE_CAROUSEL_WIDTH,
    height: IMAGE_CAROUSEL_WIDTH * 0.75,
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
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  closeButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brainButton: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    zIndex: 10,
  },
  brainButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF69B4',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 16px rgba(255, 105, 180, 0.5)',
    elevation: 8,
  },
  brainEmoji: {
    fontSize: 32,
  },
  fullScreenScrollView: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  fullScreenImageWrapper: {
    width: SCREEN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  fullScreenPaginationContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  fullScreenPaginationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  fullScreenPaginationDotActive: {
    width: 28,
    backgroundColor: '#FFFFFF',
  },
  fullScreenCounterBadge: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    zIndex: 10,
  },
  fullScreenCounterText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  analysisModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  analysisModalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: SCREEN_HEIGHT * 0.8,
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.6)',
    elevation: 10,
  },
  analysisModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  analysisModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  analysisCloseButton: {
    padding: 4,
  },
  analysisLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  analysisLoadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  analysisScrollView: {
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  analysisSection: {
    marginBottom: 20,
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
  },
  analysisSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  analysisSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  analysisText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
  analysisTimestamp: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
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
