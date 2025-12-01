
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { colors } from '@/styles/commonStyles';
import { useNotes } from '@/hooks/useNotes';
import { Note, Person } from '@/types/Note';
import { IconSymbol } from '@/components/IconSymbol';
import { FullScreenImage } from '@/components/FullScreenImage';
import { PeopleAvatarsRow } from '@/components/PeopleAvatarsRow';
import { supabase, reverseGeocode, uploadImageToDatabase, deleteImageRecord, getImageDataUrl, triggerOCRProcessing, triggerCategoryMatching, triggerRecallEmbedding } from '@/utils/supabase';
import { processRecallUrls } from '@/utils/urlProcessor';
import { extractLocationFromImage } from '@/utils/imageLocationExtractor';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';

interface ImageData {
  id?: string;
  uri: string;
  localUri?: string;
  contentType: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_CAROUSEL_WIDTH = SCREEN_WIDTH - 32;
const IMAGE_CAROUSEL_SPACING = 12;

// Helper function to check if text contains URLs - defined outside component
const hasUrl = (text: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
};

export default function NoteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { addNote, updateNote, deleteNote, refreshNotes, refreshSingleNote } = useNotes();

  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingNote, setLoadingNote] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [locationPrimaryType, setLocationPrimaryType] = useState<string>('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [showLocationDrawer, setShowLocationDrawer] = useState(false);
  const [showCameraDrawer, setShowCameraDrawer] = useState(false);
  const [cameraLaunched, setCameraLaunched] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const imageScrollRef = useRef<ScrollView>(null);

  // Lazy loading state for images
  const [lazyLoadedImages, setLazyLoadedImages] = useState<ImageData[]>([]);
  const [isLazyLoading, setIsLazyLoading] = useState(false);

  // Animated values for drawers
  const drawerTranslateY = useSharedValue(SCREEN_HEIGHT);
  const drawerOpacity = useSharedValue(0);
  const cameraDrawerTranslateY = useSharedValue(SCREEN_HEIGHT);
  const cameraDrawerOpacity = useSharedValue(0);

  const isEditing = !!params.id;
  const isSharedRecall = params.isSharedRecall === 'true';
  const fromShare = params.fromShare === 'true';
  const openCamera = params.openCamera === 'true';
  const openLocation = params.openLocation === 'true';
  const canSave = text.trim().length > 0 || images.length > 0;
  const hasImages = images.length > 0;
  const textHasUrl = hasUrl(text);
  
  // Dynamic text area height based on whether there are images
  const textInputHeight = hasImages ? 260 * 1.1 : 480 * 1.1;

  // Initialize lazy loading with first 2 images
  useEffect(() => {
    if (images.length > 1) {
      // Set first 2 images immediately
      const initialImages = images.slice(0, 2);
      setLazyLoadedImages(initialImages);
      console.log(`[NoteEditor] Initialized with first ${initialImages.length} images`);
    } else if (images.length === 1) {
      // If only 1 image, load it immediately
      setLazyLoadedImages(images);
    } else {
      setLazyLoadedImages([]);
    }
  }, [images.length, images]);

  // Lazy load remaining images when user swipes to them
  const handleImageScroll = async (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / (IMAGE_CAROUSEL_WIDTH + IMAGE_CAROUSEL_SPACING));
    
    if (index >= 0 && index < images.length) {
      setCurrentImageIndex(index);
      
      // If we're approaching an image that hasn't been loaded yet, load it
      if (images.length > 2 && index >= 1 && !isLazyLoading) {
        const nextIndex = index + 1;
        
        // Check if the next image needs to be loaded
        if (nextIndex < images.length && nextIndex >= lazyLoadedImages.length) {
          setIsLazyLoading(true);
          console.log(`[NoteEditor] Lazy loading image at index ${nextIndex}`);
          
          try {
            // Load the next image
            const imageToLoad = images[nextIndex];
            if (imageToLoad.id) {
              const imageUrl = await getImageDataUrl(imageToLoad.id);
              if (imageUrl) {
                setLazyLoadedImages(prev => {
                  const newImages = [...prev];
                  newImages[nextIndex] = { ...imageToLoad, uri: imageUrl };
                  return newImages;
                });
                console.log(`[NoteEditor] Successfully lazy loaded image at index ${nextIndex}`);
              }
            } else {
              // For new images without ID, they're already loaded
              setLazyLoadedImages(prev => {
                const newImages = [...prev];
                newImages[nextIndex] = imageToLoad;
                return newImages;
              });
            }
          } catch (error) {
            console.error(`[NoteEditor] Error lazy loading image at index ${nextIndex}:`, error);
          } finally {
            setIsLazyLoading(false);
          }
        }
      }
    }
  };

  // Animated styles for location drawer
  const drawerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: drawerTranslateY.value }],
    };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: drawerOpacity.value,
    };
  });

  // Animated styles for camera drawer
  const cameraDrawerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: cameraDrawerTranslateY.value }],
    };
  });

  const cameraOverlayAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: cameraDrawerOpacity.value,
    };
  });

  // Open location drawer with bounce effect
  const openLocationDrawer = () => {
    setShowLocationDrawer(true);
    drawerOpacity.value = withTiming(1, { duration: 300 });
    drawerTranslateY.value = withSpring(0, {
      damping: 15,
      stiffness: 150,
      mass: 0.8,
    });
  };

  // Close location drawer with bounce effect
  const closeLocationDrawer = () => {
    drawerOpacity.value = withTiming(0, { duration: 200 });
    drawerTranslateY.value = withSpring(SCREEN_HEIGHT, {
      damping: 20,
      stiffness: 200,
      mass: 0.5,
    }, () => {
      runOnJS(setShowLocationDrawer)(false);
    });
  };

  // Open camera drawer with bounce effect
  const openCameraDrawer = () => {
    setShowCameraDrawer(true);
    cameraDrawerOpacity.value = withTiming(1, { duration: 300 });
    cameraDrawerTranslateY.value = withSpring(0, {
      damping: 15,
      stiffness: 150,
      mass: 0.8,
    });
  };

  // Close camera drawer with bounce effect
  const closeCameraDrawer = () => {
    cameraDrawerOpacity.value = withTiming(0, { duration: 200 });
    cameraDrawerTranslateY.value = withSpring(SCREEN_HEIGHT, {
      damping: 20,
      stiffness: 200,
      mass: 0.5,
    }, () => {
      runOnJS(setShowCameraDrawer)(false);
    });
  };

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

  // Handle shared content from other apps
  useEffect(() => {
    const loadSharedContent = async () => {
      if (!fromShare) {
        return;
      }

      console.log('Loading shared content from params');
      
      // Set shared text
      if (params.sharedText) {
        const sharedTextValue = typeof params.sharedText === 'string' ? params.sharedText : '';
        console.log('Setting shared text:', sharedTextValue);
        setText(sharedTextValue);
      }

      // Load shared images
      if (params.sharedImages) {
        try {
          const imageUris = JSON.parse(params.sharedImages as string) as string[];
          console.log('Loading shared images:', imageUris);
          
          setLoading(true);
          const loadedImages: ImageData[] = [];

          for (const uri of imageUris) {
            try {
              console.log('Processing shared image:', uri);
              
              // Handle different URI schemes
              let localUri = uri;
              
              // For content:// URIs (Android), copy to cache
              if (uri.startsWith('content://')) {
                console.log('Copying Android content URI to cache');
                const filename = `shared_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                const destUri = `${FileSystem.cacheDirectory}${filename}`;
                
                try {
                  await FileSystem.copyAsync({
                    from: uri,
                    to: destUri,
                  });
                  localUri = destUri;
                  console.log('Copied to:', localUri);
                } catch (copyError) {
                  console.error('Error copying content URI:', copyError);
                  // Try to use the original URI
                  localUri = uri;
                }
              }
              
              // Convert and optimize the image
              const converted = await convertImageToSuitableFormat(localUri);
              
              loadedImages.push({
                uri: converted.uri,
                localUri: converted.uri,
                contentType: converted.contentType,
              });
              
              console.log('Shared image loaded successfully');
            } catch (error) {
              console.error('Error loading shared image:', error);
            }
          }

          setImages(loadedImages);
          console.log(`Loaded ${loadedImages.length} shared images`);
          setLoading(false);
        } catch (error) {
          console.error('Error parsing shared images:', error);
          setLoading(false);
        }
      }

      // Get current location for shared content
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setLocation({
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          });

          const locationName = await reverseGeocode(
            currentLocation.coords.latitude,
            currentLocation.coords.longitude
          );
          setLocationName(locationName);
          console.log('Location obtained for shared content:', locationName);
        }
      } catch (error) {
        console.error('Error getting location for shared content:', error);
      }
    };

    loadSharedContent();
  }, [fromShare, params.sharedText, params.sharedImages]);

  const takePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
        exif: true,
      });

      if (!result.canceled && result.assets) {
        setLoading(true);
        const asset = result.assets[0];
        
        // Try to extract location from the captured photo if we don't have a location yet
        if (!location) {
          console.log('Attempting to extract location from captured photo...');
          try {
            const imageLocation = await extractLocationFromImage(asset);
            
            if (imageLocation.latitude && imageLocation.longitude) {
              console.log('Location extracted from photo:', imageLocation);
              setLocation({
                latitude: imageLocation.latitude,
                longitude: imageLocation.longitude,
              });
              
              if (imageLocation.locationName) {
                setLocationName(imageLocation.locationName);
                console.log('Location name set from photo:', imageLocation.locationName);
              }
            } else {
              console.log('No location data found in photo');
            }
          } catch (error) {
            console.error('Error extracting location from photo:', error);
          }
        }
        
        // Convert and add the image
        const converted = await convertImageToSuitableFormat(asset.uri);
        setImages([...images, {
          uri: converted.uri,
          localUri: converted.uri,
          contentType: converted.contentType,
        }]);
        
        setLoading(false);
        
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        
        console.log('Photo captured and added successfully');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to take photo');
    }
  }, [images, location]);

  const pickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.9,
        exif: true,
      });

      if (!result.canceled && result.assets) {
        setLoading(true);
        const newImages: ImageData[] = [];

        // Try to extract location from the first image if we don't have a location yet
        if (!location && result.assets.length > 0) {
          console.log('Attempting to extract location from first selected image...');
          try {
            const imageLocation = await extractLocationFromImage(result.assets[0]);
            
            if (imageLocation.latitude && imageLocation.longitude) {
              console.log('Location extracted from image:', imageLocation);
              setLocation({
                latitude: imageLocation.latitude,
                longitude: imageLocation.longitude,
              });
              
              if (imageLocation.locationName) {
                setLocationName(imageLocation.locationName);
                console.log('Location name set from image:', imageLocation.locationName);
              }
            } else {
              console.log('No location data found in image');
            }
          } catch (error) {
            console.error('Error extracting location from image:', error);
          }
        }

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
        
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to pick image');
    }
  }, [images, location]);

  const handleCameraPress = () => {
    openCameraDrawer();
  };

  const handleTakePhoto = () => {
    closeCameraDrawer();
    setTimeout(() => {
      takePhoto();
    }, 300);
  };

  const handleChooseFromLibrary = () => {
    closeCameraDrawer();
    setTimeout(() => {
      pickImage();
    }, 300);
  };

  // Auto-launch camera when openCamera flag is set - FIXED: Only run once
  useEffect(() => {
    if (openCamera && !isEditing && !isSharedRecall && !fromShare && !cameraLaunched) {
      console.log('Auto-launching camera for new note');
      setCameraLaunched(true);
      // Small delay to ensure component is mounted
      setTimeout(() => {
        takePhoto();
      }, 300);
    }
  }, [openCamera, isEditing, isSharedRecall, fromShare, cameraLaunched, takePhoto]);

  // Auto-launch location search when openLocation flag is set
  useEffect(() => {
    if (openLocation && !isEditing && !isSharedRecall && !fromShare) {
      console.log('Auto-launching location search for new note');
      // Small delay to ensure component is mounted
      setTimeout(() => {
        router.push('/location-search');
      }, 300);
    }
  }, [openLocation, isEditing, isSharedRecall, fromShare, router]);

  // Handle shared recall data
  useEffect(() => {
    if (isSharedRecall && params.sharedText) {
      console.log('Loading shared recall data');
      
      // Set text
      setText(params.sharedText as string);
      
      // Set location data from shared recall (don't fetch current location)
      if (params.selectedLatitude && params.selectedLongitude) {
        const latitude = parseFloat(params.selectedLatitude as string);
        const longitude = parseFloat(params.selectedLongitude as string);
        setLocation({ latitude, longitude });
        console.log('Using shared location:', { latitude, longitude });
      }
      
      if (params.selectedLocationName) {
        setLocationName(params.selectedLocationName as string);
        console.log('Using shared location name:', params.selectedLocationName);
      }
      
      if (params.selectedPrimaryType) {
        setLocationPrimaryType(params.selectedPrimaryType as string);
        console.log('Using shared location type:', params.selectedPrimaryType);
      }
      
      // Load shared images and display them
      if (params.sharedImages) {
        try {
          const imageUrls = JSON.parse(params.sharedImages as string) as string[];
          console.log('Loading shared images:', imageUrls);
          
          const sharedImages: ImageData[] = imageUrls.map((url, index) => ({
            uri: url,
            contentType: 'image/jpeg',
          }));
          
          setImages(sharedImages);
          console.log(`Loaded ${sharedImages.length} shared images for preview`);
        } catch (error) {
          console.error('Error parsing shared images:', error);
        }
      }
    }
  }, [isSharedRecall, params.sharedText, params.sharedImages, params.selectedLatitude, params.selectedLongitude, params.selectedLocationName, params.selectedPrimaryType]);

  // Load note data directly from Supabase when editing
  useEffect(() => {
    const loadNoteFromDatabase = async () => {
      if (!isEditing || !params.id || !user || fromShare) {
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
        setLocationPrimaryType(recallData.location_primary_type || '');
        
        if (recallData.latitude && recallData.longitude) {
          setLocation({
            latitude: recallData.latitude,
            longitude: recallData.longitude,
          });
        }

        // Load people for this recall
        const { data: recallPeopleData, error: recallPeopleError } = await supabase
          .from('recall_people')
          .select('person_id, persons(id, person_name)')
          .eq('recall_id', params.id);

        if (recallPeopleError) {
          console.error('Error loading recall_people:', recallPeopleError);
        } else if (recallPeopleData && recallPeopleData.length > 0) {
          const loadedPeople: Person[] = recallPeopleData
            .filter((rp: any) => rp.persons)
            .map((rp: any) => ({
              id: rp.persons.id,
              person_name: rp.persons.person_name,
            }));
          setPeople(loadedPeople);
          console.log(`Loaded ${loadedPeople.length} people for recall`);
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
          
          // Load first 2 images immediately
          const imagesToLoadImmediately = imagesData.slice(0, 2);
          
          for (const img of imagesToLoadImmediately) {
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
          
          // Add placeholders for remaining images
          for (let i = 2; i < imagesData.length; i++) {
            loadedImages.push({
              id: imagesData[i].id,
              uri: '', // Will be lazy loaded
              contentType: 'image/jpeg',
            });
          }
          
          setImages(loadedImages);
          console.log(`Loaded ${imagesToLoadImmediately.length}/${imagesData.length} images immediately, ${imagesData.length - imagesToLoadImmediately.length} will be lazy loaded`);
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
  }, [params.id, isEditing, user, router, fromShare]);

  // Request location permission only for new notes (not editing, not shared recalls, not from share)
  useEffect(() => {
    if (!isEditing && !isSharedRecall && !openLocation && !fromShare) {
      console.log('Requesting location for new note');
      requestLocationPermission();
    } else if (isSharedRecall) {
      console.log('Skipping location request for shared recall');
    } else if (openLocation) {
      console.log('Skipping location request - will open location search');
    } else if (fromShare) {
      console.log('Skipping location request - from share intent');
    }
  }, [isEditing, isSharedRecall, openLocation, fromShare]);

  // Handle location updates from search (but not for shared recalls)
  useEffect(() => {
    // Skip location updates for shared recalls
    if (isSharedRecall) {
      console.log('Skipping location update for shared recall');
      return;
    }

    if (params.selectedLatitude && params.selectedLongitude && params.selectedLocationName) {
      const latitude = parseFloat(params.selectedLatitude as string);
      const longitude = parseFloat(params.selectedLongitude as string);
      const formattedName = params.selectedLocationName as string;
      const primaryType = params.selectedPrimaryType as string || '';

      console.log('Location updated from search:', { latitude, longitude, formattedName, primaryType });
      
      setLocation({ latitude, longitude });
      setLocationName(formattedName);
      setLocationPrimaryType(primaryType);

      router.setParams({
        selectedLatitude: undefined,
        selectedLongitude: undefined,
        selectedLocationName: undefined,
        selectedDisplayName: undefined,
        selectedFullAddress: undefined,
        selectedPrimaryType: undefined,
      });
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName, params.selectedPrimaryType, router, isSharedRecall]);

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

  const editImage = async (index: number) => {
    const image = images[index];
    console.log('Opening native editor for image at index:', index);
    
    // Make sure we have the full image URI loaded
    let imageUri = image.uri;
    
    // If the image hasn't been loaded yet (lazy loading), load it now
    if (!imageUri && image.id) {
      console.log('Loading image before editing:', image.id);
      try {
        const dataUrl = await getImageDataUrl(image.id);
        if (dataUrl) {
          imageUri = dataUrl;
          // Update the images array with the loaded URI
          const updatedImages = [...images];
          updatedImages[index] = { ...image, uri: dataUrl };
          setImages(updatedImages);
        } else {
          Alert.alert('Error', 'Failed to load image for editing');
          return;
        }
      } catch (error) {
        console.error('Error loading image for editing:', error);
        Alert.alert('Error', 'Failed to load image for editing');
        return;
      }
    }
    
    // Note: Native image editing functionality has been removed
    Alert.alert('Info', 'Image editing is not available');
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
            onPress={(e) => {
              e.stopPropagation();
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

  const handleLocationPress = () => {
    if (!location) {
      console.log('No location available');
      return;
    }

    openLocationDrawer();
  };

  const handleUpdateLocation = () => {
    closeLocationDrawer();
    setTimeout(() => {
      router.push('/location-search');
    }, 300);
  };

  const handleOpenMaps = async () => {
    closeLocationDrawer();
    
    if (!location) {
      console.log('No location available');
      return;
    }

    const { latitude, longitude } = location;
    const formattedLocationName = locationName || '';
    
    try {
      let universalUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      
      if (formattedLocationName) {
        const encodedLocationName = encodeURIComponent(formattedLocationName);
        universalUrl = `https://www.google.com/maps/search/?api=1&query=${encodedLocationName}+${latitude},${longitude}`;
      }
      
      console.log('Opening maps with URL:', universalUrl);
      
      const canOpen = await Linking.canOpenURL(universalUrl);
      
      if (canOpen) {
        await Linking.openURL(universalUrl);
        console.log('Successfully opened maps with location:', formattedLocationName);
      } else {
        console.error('Cannot open maps URL');
        Alert.alert('Error', 'Unable to open maps on this device');
      }
    } catch (error) {
      console.error('Error opening maps:', error);
      Alert.alert('Error', 'Could not open maps application. Please ensure you have a maps app installed.');
    }
  };

  const handlePeopleChange = useCallback((newPeople: Person[]) => {
    console.log('[NoteEditor] People changed:', newPeople);
    setPeople(newPeople);
  }, []);

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
        location_primary_type: locationPrimaryType || null,
      };

      console.log('[NoteEditor] Saving note with data:', noteData);
      console.log('[NoteEditor] Current people state:', people);

      let recallId: string;

      if (isEditing && params.id) {
        await updateNote(params.id as string, noteData);
        recallId = params.id as string;

        const { data: existingImages } = await supabase
          .from('recall_images')
          .select('id')
          .eq('recall_id', recallId);

        const currentImageIds = new Set(
          images
            .filter(img => img.id)
            .map(img => img.id!)
        );

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
        recallId = await addNote(noteData);
      }

      // Save people associations - this is the critical part
      if (user) {
        try {
          console.log(`[NoteEditor] Saving people associations for recall ${recallId}`);
          console.log(`[NoteEditor] People to save:`, people);
          
          // Delete existing associations
          const { error: deleteError } = await supabase
            .from('recall_people')
            .delete()
            .eq('recall_id', recallId)
            .eq('user_id', user.id);
          
          if (deleteError) {
            console.error('[NoteEditor] Error deleting existing people associations:', deleteError);
          } else {
            console.log('[NoteEditor] Deleted existing people associations');
          }
          
          // Insert new associations
          if (people.length > 0) {
            const insertData = people.map(person => ({
              recall_id: recallId,
              person_id: person.id,
              user_id: user.id,
            }));
            
            console.log('[NoteEditor] Inserting people associations:', insertData);
            
            const { error: peopleError } = await supabase
              .from('recall_people')
              .insert(insertData);
            
            if (peopleError) {
              console.error('[NoteEditor] Error saving people associations:', peopleError);
            } else {
              console.log(`[NoteEditor] Successfully saved ${people.length} people associations for recall ${recallId}`);
            }
          } else {
            console.log('[NoteEditor] No people to save for this recall');
          }
        } catch (error) {
          console.error('[NoteEditor] Error managing people associations:', error);
        }
      }

      let uploadedCount = 0;
      let failedCount = 0;
      const uploadedImageIds: string[] = [];

      for (const image of images) {
        if (image.id) {
          console.log('Skipping existing image:', image.id);
          continue;
        }

        if (image.localUri || image.uri) {
          const imageUri = image.localUri || image.uri;
          console.log('Uploading new image to database:', imageUri);
          
          const imageId = await uploadImageToDatabase(imageUri, recallId, image.contentType);
          
          if (imageId) {
            uploadedCount++;
            uploadedImageIds.push(imageId);
            console.log('Image uploaded successfully to database');
            
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

      console.log('Processing URLs in note text for recall:', recallId);
      if (user) {
        processRecallUrls(user.id, recallId, noteData.text).then(result => {
          if (result.success) {
            console.log('URLs processed successfully');
          } else {
            console.error('Failed to process URLs:', result.error);
          }
        }).catch(error => {
          console.error('Error processing URLs:', error);
        });
      }

      setTimeout(() => {
        triggerCategoryMatching(recallId).then(result => {
          if (result.success) {
            console.log('Category matching triggered successfully after note save');
          } else {
            console.error('Failed to trigger category matching:', result.error);
          }
        }).catch(error => {
          console.error('Error triggering category matching:', error);
        });
      }, 500);

      setTimeout(() => {
        triggerRecallEmbedding(
          recallId,
          noteData.text,
          noteData.location,
          noteData.location_primary_type || undefined
        ).then(result => {
          if (result.success) {
            console.log('Embedding generation triggered successfully after note save');
          } else {
            console.error('Failed to trigger embedding generation:', result.error);
          }
        }).catch(error => {
          console.error('Error triggering embedding generation:', error);
        });
      }, 500);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (failedCount > 0) {
        Alert.alert(
          'Partial Upload',
          `${uploadedCount} image(s) uploaded successfully, but ${failedCount} failed. Check console logs for details.`,
          [{ text: 'OK' }]
        );
      }

      router.back();
      
      setTimeout(() => {
        if (isEditing && params.id) {
          refreshSingleNote(params.id as string);
        } else {
          refreshNotes();
        }
      }, 300);
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
              setDeleting(true);
              await deleteNote(params.id as string);
              
              router.back();
              
              setTimeout(() => {
                refreshNotes();
              }, 300);
            } catch (error) {
              console.error('Error deleting recall:', error);
              Alert.alert('Error', 'Failed to delete recall');
            } finally {
              setDeleting(false);
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

  const handleImagePress = (index: number) => {
    setFullScreenImageIndex(index);
    setShowFullScreenImage(true);
  };

  const handleRichTextPress = () => {
    console.log('Rich text pressed, focusing input');
    textInputRef.current?.focus();
  };

  // Handler for closing full screen image - prevents route refresh
  const handleCloseFullScreenImage = useCallback(() => {
    console.log('Closing full screen image modal - no route refresh');
    setShowFullScreenImage(false);
  }, []);

  // Determine which images to display (lazy loaded or all)
  const displayImages = images.length > 1 ? lazyLoadedImages : images;

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
            headerTitleStyle: {
              color: colors.primary,
            },
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
          headerTitle: fromShare ? 'New Recall from Share' : (isSharedRecall ? 'Shared Recall' : (isEditing ? 'Edit Recall' : 'New Recall')),
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            color: colors.primary,
          },
          headerLeft: () => (
            <Pressable 
              onPress={() => router.back()} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerRightContainer}>
              <Pressable
                onPress={handleSave}
                disabled={saving || !canSave}
                style={[
                  styles.saveButton,
                  (saving || !canSave) && styles.saveButtonDisabled,
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
        <View style={[styles.textInputContainer, { height: textInputHeight }]}>
          {textHasUrl ? (
            <View style={styles.richTextContainer}>
              <ScrollView 
                style={styles.textInputScrollView}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                <Pressable onPress={handleRichTextPress}>
                  <Text style={styles.richText}>
                    {renderTextWithLinks(text)}
                  </Text>
                </Pressable>
              </ScrollView>
              <TextInput
                ref={textInputRef}
                style={[styles.textInput, styles.overlayInput]}
                placeholder="What do you want to Recall?"
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={setText}
                multiline
                autoFocus={false}
                scrollEnabled={false}
                caretHidden={false}
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
                placeholder="What do you want to Recall?"
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={setText}
                multiline
                autoFocus={false}
                scrollEnabled={false}
              />
            </ScrollView>
          )}
        </View>

        <View style={styles.spacer} />
      </ScrollView>

      <PeopleAvatarsRow 
        people={people} 
        avatarSize={44} 
        onPeopleChange={handlePeopleChange}
        recallId={isEditing ? (params.id as string) : undefined}
      />

      {hasImages && (
        <View style={styles.imagesContainer}>
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
            pagingEnabled={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imagesScrollContent}
            onScroll={handleImageScroll}
            scrollEventThrottle={16}
            decelerationRate={0.9}
            snapToInterval={IMAGE_CAROUSEL_WIDTH + IMAGE_CAROUSEL_SPACING}
            snapToAlignment="start"
          >
            {displayImages.map((image, index) => (
              <Pressable 
                key={`${image.id || 'new'}-${index}`} 
                style={styles.imageWrapper}
                onPress={() => handleImagePress(index)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {!image.uri ? (
                  <View style={styles.imageLoadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingImageText}>Loading...</Text>
                  </View>
                ) : (
                  <Image source={{ uri: image.uri }} style={styles.image} resizeMode="cover" />
                )}
                <View style={styles.imageActions}>
                  <Pressable
                    onPress={() => removeImage(index)}
                    style={styles.imageActionButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={styles.actionButtonCircle}>
                      <IconSymbol name="xmark" size={16} color="#FFFFFF" />
                    </View>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {locationName && (
        <View>
          <Pressable 
            onPress={handleLocationPress}
            style={styles.locationInfo}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol name="location.fill" size={16} color={colors.primary} />
            <View style={styles.locationTextContainer}>
              <Text style={styles.locationText}>{locationName}</Text>
              {locationPrimaryType && (
                <Text style={styles.locationTypeText}>{locationPrimaryType}</Text>
              )}
            </View>
            <IconSymbol name="chevron.right" size={14} color={colors.primary} />
          </Pressable>
        </View>
      )}

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
            onPress={handleCameraPress}
            disabled={loading}
            style={styles.toolbarButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol name="camera.fill" size={26} color={colors.primary} />
            )}
          </Pressable>
          
          <Pressable
            onPress={toggleKeyboard}
            style={styles.toolbarButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol name="trash" size={26} color={colors.error} />
          </Pressable>
        )}
      </View>

      {/* Location Drawer */}
      {showLocationDrawer && (
        <View style={styles.drawerContainer}>
          <Animated.View style={[styles.drawerOverlay, overlayAnimatedStyle]}>
            <Pressable 
              style={StyleSheet.absoluteFill}
              onPress={closeLocationDrawer}
            />
          </Animated.View>
          
          <Animated.View style={[styles.drawerContent, drawerAnimatedStyle]}>
            <View style={styles.drawerHandle} />
            
            <View style={styles.drawerHeader}>
              <IconSymbol name="location.fill" size={24} color={colors.primary} />
              <Text style={styles.drawerTitle}>Location Options</Text>
            </View>
            
            <Pressable
              onPress={handleUpdateLocation}
              style={styles.drawerOption}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.drawerOptionIcon}>
                <IconSymbol name="pencil" size={20} color={colors.primary} />
              </View>
              <View style={styles.drawerOptionText}>
                <Text style={styles.drawerOptionTitle}>Update Location</Text>
                <Text style={styles.drawerOptionSubtitle}>Change the location for this recall</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.textSecondary} />
            </Pressable>

            <View style={styles.drawerDivider} />

            <Pressable
              onPress={handleOpenMaps}
              style={styles.drawerOption}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.drawerOptionIcon}>
                <IconSymbol name="map.fill" size={20} color={colors.primary} />
              </View>
              <View style={styles.drawerOptionText}>
                <Text style={styles.drawerOptionTitle}>Open in Maps</Text>
                <Text style={styles.drawerOptionSubtitle}>View location in maps app</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              onPress={closeLocationDrawer}
              style={styles.drawerCancelButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.drawerCancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* Camera Drawer */}
      {showCameraDrawer && (
        <View style={styles.drawerContainer}>
          <Animated.View style={[styles.drawerOverlay, cameraOverlayAnimatedStyle]}>
            <Pressable 
              style={StyleSheet.absoluteFill}
              onPress={closeCameraDrawer}
            />
          </Animated.View>
          
          <Animated.View style={[styles.drawerContent, cameraDrawerAnimatedStyle]}>
            <View style={styles.drawerHandle} />
            
            <View style={styles.drawerHeader}>
              <IconSymbol name="camera.fill" size={24} color={colors.primary} />
              <Text style={styles.drawerTitle}>Add Photo</Text>
            </View>
            
            <Pressable
              onPress={handleTakePhoto}
              style={styles.drawerOption}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.drawerOptionIcon}>
                <IconSymbol name="camera.fill" size={20} color={colors.primary} />
              </View>
              <View style={styles.drawerOptionText}>
                <Text style={styles.drawerOptionTitle}>Take Photo</Text>
                <Text style={styles.drawerOptionSubtitle}>Use camera with native editing</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.textSecondary} />
            </Pressable>

            <View style={styles.drawerDivider} />

            <Pressable
              onPress={handleChooseFromLibrary}
              style={styles.drawerOption}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.drawerOptionIcon}>
                <IconSymbol name="photo.fill" size={20} color={colors.primary} />
              </View>
              <View style={styles.drawerOptionText}>
                <Text style={styles.drawerOptionTitle}>Choose from Library</Text>
                <Text style={styles.drawerOptionSubtitle}>Select photos from your gallery</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              onPress={closeCameraDrawer}
              style={styles.drawerCancelButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.drawerCancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* Saving Modal */}
      {saving && (
        <View style={styles.savingModalContainer}>
          <View style={styles.savingModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.savingModalText}>Saving Recall...</Text>
          </View>
        </View>
      )}

      {/* Deleting Modal */}
      {deleting && (
        <View style={styles.savingModalContainer}>
          <View style={styles.savingModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.savingModalText}>Deleting Recall...</Text>
          </View>
        </View>
      )}

      {hasImages && (
        <FullScreenImage
          visible={showFullScreenImage}
          images={images.map(img => img.uri)}
          imageIds={images.map(img => img.id).filter((id): id is string => id !== undefined)}
          initialIndex={fullScreenImageIndex}
          onClose={handleCloseFullScreenImage}
        />
      )}
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
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12 * 1.15,
    paddingVertical: 8 * 1.15,
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
  },
  textInputScrollView: {
    flex: 1,
  },
  textInput: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
    textAlignVertical: 'top',
    minHeight: 48 * 1.1,
  },
  textInputMultiline: {
    fontSize: 17,
    lineHeight: 26,
    color: colors.text,
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
  overlayInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: 'transparent',
    backgroundColor: 'transparent',
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
    paddingHorizontal: 20 * 1.15,
    paddingVertical: 12 * 1.15,
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 48 * 1.1,
  },
  locationTextContainer: {
    flex: 1,
  },
  locationText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  locationTypeText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
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
  imageLoadingContainer: {
    width: IMAGE_CAROUSEL_WIDTH,
    height: IMAGE_CAROUSEL_WIDTH * 0.75,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardDark,
    borderRadius: 16,
  },
  loadingImageText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  imageActions: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  imageActionButton: {
    // No additional styles needed
  },
  actionButtonCircle: {
    width: 32 * 1.15,
    height: 32 * 1.15,
    borderRadius: 16 * 1.15,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12 * 1.15,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12 * 1.15,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  toolbarButton: {
    padding: 8 * 1.15,
  },
  drawerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  drawerContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  drawerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16 * 1.15,
    gap: 12,
  },
  drawerOptionIcon: {
    width: 40 * 1.15,
    height: 40 * 1.15,
    borderRadius: 20 * 1.15,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerOptionText: {
    flex: 1,
  },
  drawerOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  drawerOptionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  drawerDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  drawerCancelButton: {
    marginTop: 16,
    paddingVertical: 14 * 1.15,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  drawerCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  savingModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  savingModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  savingModalText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
});
