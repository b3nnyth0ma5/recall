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
  FadeIn,
} from 'react-native-reanimated';
import { colors } from '@/styles/commonStyles';
import { useNotesContext } from '@/contexts/NotesContext';
import { Note, Person } from '@/types/Note';
import { IconSymbol } from '@/components/IconSymbol';
import { FullScreenImage } from '@/components/FullScreenImage';
import { PeopleAvatarsRow } from '@/components/PeopleAvatarsRow';
import { supabase, reverseGeocode, uploadImageToDatabase, deleteImageRecord, getImageDataUrl, triggerOCRProcessing, triggerCategoryMatching, triggerRecallEmbedding, triggerPeopleFinder } from '@/utils/supabase';
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
const IMAGE_CAROUSEL_WIDTH = (SCREEN_WIDTH - 32) * 0.8;
const IMAGE_CAROUSEL_SPACING = 12;

const hasUrl = (text: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
};

export default function NoteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { addNote, updateNote, deleteNote, refreshNotes, refreshSingleNote, getCachedNote } = useNotesContext();

  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
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
  const [showFABs, setShowFABs] = useState(false);
  const [cameraLaunched, setCameraLaunched] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [initialPeople, setInitialPeople] = useState<Person[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const imageScrollRef = useRef<ScrollView>(null);

  const [lazyLoadedImages, setLazyLoadedImages] = useState<ImageData[]>([]);
  const [isLazyLoading, setIsLazyLoading] = useState(false);

  const isEditing = !!params.id;
  const isSharedRecall = params.isSharedRecall === 'true';
  const fromShare = params.fromShare === 'true';
  const openCamera = params.openCamera === 'true';
  const openLocation = params.openLocation === 'true';
  const scrollToImageIndex = params.scrollToImage ? parseInt(params.scrollToImage as string, 10) : undefined;
  
  const peopleChanged = useCallback(() => {
    if (initialPeople.length !== people.length) {
      return true;
    }
    const initialIds = new Set(initialPeople.map(p => p.id));
    const currentIds = new Set(people.map(p => p.id));
    for (const id of currentIds) {
      if (!initialIds.has(id)) {
        return true;
      }
    }
    for (const id of initialIds) {
      if (!currentIds.has(id)) {
        return true;
      }
    }
    return false;
  }, [initialPeople, people]);

  const canSave = text.trim().length > 0 || images.length > 0;
  const hasImages = images.length > 0;
  const textHasUrl = hasUrl(text);
  
  const textInputHeight = hasImages ? 340 : 480 * 1.1;

  useEffect(() => {
    if (images.length > 1) {
      const initialImages = images.slice(0, 2);
      setLazyLoadedImages(initialImages);
      console.log(`[NoteEditor] Initialized with first ${initialImages.length} images`);
    } else if (images.length === 1) {
      setLazyLoadedImages(images);
    } else {
      setLazyLoadedImages([]);
    }
  }, [images.length, images]);

  const handleImageScroll = async (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / (IMAGE_CAROUSEL_WIDTH + IMAGE_CAROUSEL_SPACING));
    
    if (index >= 0 && index < images.length) {
      setCurrentImageIndex(index);
      
      if (images.length > 2 && index >= 1 && !isLazyLoading) {
        const nextIndex = index + 1;
        
        if (nextIndex < images.length && nextIndex >= lazyLoadedImages.length) {
          setIsLazyLoading(true);
          console.log(`[NoteEditor] Lazy loading image at index ${nextIndex}`);
          
          try {
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

  useEffect(() => {
    const loadSharedContent = async () => {
      if (!fromShare) {
        return;
      }

      console.log('Loading shared content from params');
      
      if (params.sharedText) {
        const sharedTextValue = typeof params.sharedText === 'string' ? params.sharedText : '';
        console.log('Setting shared text:', sharedTextValue);
        setText(sharedTextValue);
      }

      if (params.sharedImages) {
        try {
          const imageUris = JSON.parse(params.sharedImages as string) as string[];
          console.log('Loading shared images:', imageUris);
          
          setLoading(true);
          const loadedImages: ImageData[] = [];

          for (const uri of imageUris) {
            try {
              console.log('Processing shared image:', uri);
              
              let localUri = uri;
              
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
                  localUri = uri;
                }
              }
              
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
        setProcessingCount(result.assets.length);

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

        console.log(`[NoteEditor] Converting ${result.assets.length} images in parallel`);
        const convertedAssets = await Promise.all(
          result.assets.map(asset => convertImageToSuitableFormat(asset.uri))
        );
        const newImages: ImageData[] = convertedAssets.map(converted => ({
          uri: converted.uri,
          localUri: converted.uri,
          contentType: converted.contentType,
        }));

        setImages([...images, ...newImages]);
        setProcessingCount(0);
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

  const handlePlusPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowFABs(!showFABs);
  };

  const handleTakePhoto = () => {
    setShowFABs(false);
    setTimeout(() => {
      takePhoto();
    }, 300);
  };

  const handleChooseFromLibrary = () => {
    setShowFABs(false);
    setTimeout(() => {
      pickImage();
    }, 300);
  };

  const handleBackdropPress = () => {
    if (showFABs) {
      setShowFABs(false);
    }
  };

  useEffect(() => {
    if (openCamera && !isEditing && !isSharedRecall && !fromShare && !cameraLaunched) {
      console.log('Auto-launching camera for new note');
      setCameraLaunched(true);
      setTimeout(() => {
        takePhoto();
      }, 300);
    }
  }, [openCamera, isEditing, isSharedRecall, fromShare, cameraLaunched, takePhoto]);

  useEffect(() => {
    if (openLocation && !isEditing && !isSharedRecall && !fromShare) {
      console.log('Auto-launching location search for new note');
      setTimeout(() => {
        router.push('/location-search');
      }, 300);
    }
  }, [openLocation, isEditing, isSharedRecall, fromShare, router]);

  useEffect(() => {
    if (isSharedRecall && params.sharedText) {
      console.log('Loading shared recall data');
      
      setText(params.sharedText as string);
      
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

  useEffect(() => {
    const loadNoteFromCacheOrDatabase = async () => {
      if (!isEditing || !params.id || !user || fromShare) {
        return;
      }

      try {
        const noteId = params.id as string;
        console.log('[NoteEditor] ===== OPTIMIZED LOADING =====');
        console.log('[NoteEditor] Loading note:', noteId);

        const cachedNote = getCachedNote(noteId);
        
        if (cachedNote) {
          console.log('[NoteEditor] ✅ Using CACHED data for instant load');
          
          setText(cachedNote.text || '');
          setLocationName(cachedNote.location || '');
          setLocationPrimaryType(cachedNote.location_primary_type || '');
          
          if (cachedNote.latitude && cachedNote.longitude) {
            setLocation({
              latitude: cachedNote.latitude,
              longitude: cachedNote.longitude,
            });
          }

          if (cachedNote.people && cachedNote.people.length > 0) {
            console.log('[NoteEditor] Loaded people from cache:', cachedNote.people);
            setPeople(cachedNote.people);
            setInitialPeople(cachedNote.people);
          } else {
            setPeople([]);
            setInitialPeople([]);
          }

          if (cachedNote.images && cachedNote.images.length > 0) {
            const cachedImages: ImageData[] = cachedNote.images.map((url, index) => ({
              id: cachedNote.imageIds?.[index],
              uri: url,
              contentType: 'image/jpeg',
            }));
            setImages(cachedImages);
            console.log(`[NoteEditor] Loaded ${cachedImages.length} images from cache`);
          }

          console.log('[NoteEditor] Refreshing data in background...');
          
          const { data: recallData, error: recallError } = await supabase
            .from('recalls')
            .select('*')
            .eq('id', noteId)
            .eq('user_id', user.id)
            .single();

          if (!recallError && recallData) {
            if (recallData.updated_at !== cachedNote.updated_at) {
              console.log('[NoteEditor] Data changed, updating from database');
              
              setText(recallData.text || '');
              setLocationName(recallData.location || '');
              setLocationPrimaryType(recallData.location_primary_type || '');
              
              if (recallData.latitude && recallData.longitude) {
                setLocation({
                  latitude: recallData.latitude,
                  longitude: recallData.longitude,
                });
              }

              const { data: recallPeopleData } = await supabase
                .from('recall_people')
                .select('person_id, persons(id, person_name, photo_url)')
                .eq('recall_id', noteId);

              if (recallPeopleData && recallPeopleData.length > 0) {
                const loadedPeople: Person[] = recallPeopleData
                  .filter((rp: any) => rp.persons)
                  .map((rp: any) => ({
                    id: rp.persons.id,
                    person_name: rp.persons.person_name,
                    photo_url: rp.persons.photo_url,
                  }));
                setPeople(loadedPeople);
                setInitialPeople(loadedPeople);
              }

              const { data: imagesData } = await supabase
                .from('recall_images')
                .select('id')
                .eq('recall_id', noteId)
                .order('created_at', { ascending: true });

              if (imagesData && imagesData.length > 0) {
                const loadedImages: ImageData[] = [];
                
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
                    }
                  } catch (error) {
                    console.error(`[NoteEditor] Error loading image ${img.id}:`, error);
                  }
                }
                
                for (let i = 2; i < imagesData.length; i++) {
                  loadedImages.push({
                    id: imagesData[i].id,
                    uri: '',
                    contentType: 'image/jpeg',
                  });
                }
                
                setImages(loadedImages);
              }
            } else {
              console.log('[NoteEditor] Data unchanged, using cache');
            }
          }
          
          return;
        }

        console.log('[NoteEditor] ⚠️ No cache available, loading from database');
        setLoadingNote(true);

        const { data: recallData, error: recallError } = await supabase
          .from('recalls')
          .select('*')
          .eq('id', noteId)
          .eq('user_id', user.id)
          .single();

        if (recallError || !recallData) {
          console.error('[NoteEditor] Error loading recall:', recallError);
          Alert.alert('Error', 'Failed to load note');
          router.back();
          return;
        }

        console.log('[NoteEditor] Note loaded from database:', recallData);

        setText(recallData.text || '');
        setLocationName(recallData.location || '');
        setLocationPrimaryType(recallData.location_primary_type || '');
        
        if (recallData.latitude && recallData.longitude) {
          setLocation({
            latitude: recallData.latitude,
            longitude: recallData.longitude,
          });
        }

        console.log('[NoteEditor] Loading people for recall:', noteId);
        const { data: recallPeopleData, error: recallPeopleError } = await supabase
          .from('recall_people')
          .select('person_id, persons(id, person_name, photo_url)')
          .eq('recall_id', noteId);

        if (recallPeopleError) {
          console.error('[NoteEditor] Error loading recall_people:', recallPeopleError);
        } else if (recallPeopleData && recallPeopleData.length > 0) {
          const loadedPeople: Person[] = recallPeopleData
            .filter((rp: any) => rp.persons)
            .map((rp: any) => ({
              id: rp.persons.id,
              person_name: rp.persons.person_name,
              photo_url: rp.persons.photo_url,
            }));
          console.log('[NoteEditor] Loaded people from database:', loadedPeople);
          setPeople(loadedPeople);
          setInitialPeople(loadedPeople);
          console.log(`[NoteEditor] Set ${loadedPeople.length} people in state`);
        } else {
          console.log('[NoteEditor] No people found for this recall');
          setPeople([]);
          setInitialPeople([]);
        }

        const { data: imagesData, error: imagesError } = await supabase
          .from('recall_images')
          .select('id')
          .eq('recall_id', noteId)
          .order('created_at', { ascending: true });

        if (imagesError) {
          console.error('[NoteEditor] Error loading images:', imagesError);
        } else if (imagesData && imagesData.length > 0) {
          console.log(`[NoteEditor] Loading ${imagesData.length} images for note`);
          
          const loadedImages: ImageData[] = [];
          
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
                console.log(`[NoteEditor] Image ${img.id} loaded successfully`);
              } else {
                console.error(`[NoteEditor] Failed to load image ${img.id}`);
              }
            } catch (error) {
              console.error(`[NoteEditor] Error loading image ${img.id}:`, error);
            }
          }
          
          for (let i = 2; i < imagesData.length; i++) {
            loadedImages.push({
              id: imagesData[i].id,
              uri: '',
              contentType: 'image/jpeg',
            });
          }
          
          setImages(loadedImages);
          console.log(`[NoteEditor] Loaded ${imagesToLoadImmediately.length}/${imagesData.length} images immediately, ${imagesData.length - imagesToLoadImmediately.length} will be lazy loaded`);
        }
      } catch (error) {
        console.error('[NoteEditor] Error loading note:', error);
        Alert.alert('Error', 'Failed to load note');
        router.back();
      } finally {
        setLoadingNote(false);
      }
    };

    loadNoteFromCacheOrDatabase();
  }, [params.id, isEditing, user, router, fromShare, getCachedNote]);

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

  useEffect(() => {
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
    
    let imageUri = image.uri;
    
    if (!imageUri && image.id) {
      console.log('Loading image before editing:', image.id);
      try {
        const dataUrl = await getImageDataUrl(image.id);
        if (dataUrl) {
          imageUri = dataUrl;
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

    console.log('Navigating to location search screen');
    router.push('/location-search');
  };

  const handlePeopleChange = useCallback((newPeople: Person[]) => {
    console.log('[NoteEditor] ===== PEOPLE CHANGED =====');
    console.log('[NoteEditor] Previous people count:', people.length);
    console.log('[NoteEditor] New people count:', newPeople.length);
    console.log('[NoteEditor] New people:', newPeople.map(p => p.person_name).join(', '));
    setPeople(newPeople);
    console.log('[NoteEditor] People state updated');
  }, [people.length]);

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    if (!user) {
      console.error('[NoteEditor] ERROR: No user found, cannot save');
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setSaving(true);
      console.log('[NoteEditor] ===== STARTING SAVE PROCESS =====');

      const noteData = {
        text: text.trim(),
        latitude: location?.latitude,
        longitude: location?.longitude,
        location: locationName,
        location_primary_type: locationPrimaryType || null,
      };

      console.log('[NoteEditor] Note data to save:', noteData);
      console.log('[NoteEditor] Current people state:', people);
      console.log('[NoteEditor] People count:', people.length);

      let recallId: string;

      if (isEditing && params.id) {
        console.log('[NoteEditor] Updating existing recall:', params.id);
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
              console.log('[NoteEditor] Deleting removed image:', img.id);
              await deleteImageRecord(img.id);
            } else {
              console.log('[NoteEditor] Keeping existing image:', img.id);
            }
          }
        }

        // Trigger embedding regeneration for updated recall
        console.log('[NoteEditor] Triggering embedding regeneration for updated recall:', recallId);
        setTimeout(() => {
          triggerRecallEmbedding(
            recallId,
            noteData.text,
            noteData.location,
            noteData.location_primary_type || undefined
          ).then(result => {
            if (result.success) {
              console.log('[NoteEditor] [ASYNC] Embedding regeneration triggered successfully after recall update');
            } else {
              console.error('[NoteEditor] [ASYNC] Failed to trigger embedding regeneration:', result.error);
            }
          }).catch(error => {
            console.error('[NoteEditor] [ASYNC] Error triggering embedding regeneration:', error);
          });
        }, 500);
      } else {
        console.log('[NoteEditor] Creating new recall');
        recallId = await addNote(noteData);
        console.log('[NoteEditor] New recall created with ID:', recallId);
      }

      if (!isEditing && people.length > 0) {
        try {
          console.log('[NoteEditor] ===== SAVING PEOPLE ASSOCIATIONS FOR NEW NOTE =====');
          console.log('[NoteEditor] Recall ID:', recallId);
          console.log('[NoteEditor] User ID:', user.id);
          console.log('[NoteEditor] People to save:', people);
          console.log('[NoteEditor] People count:', people.length);
          
          const insertData = people.map(person => ({
            recall_id: recallId,
            person_id: person.id,
            user_id: user.id,
          }));
          
          console.log('[NoteEditor] Data to insert:', JSON.stringify(insertData, null, 2));
          
          const { data: insertedData, error: peopleError } = await supabase
            .from('recall_people')
            .insert(insertData)
            .select();
          
          if (peopleError) {
            console.error('[NoteEditor] ❌ ERROR inserting people associations:', peopleError);
            console.error('[NoteEditor] Error details:', JSON.stringify(peopleError, null, 2));
          } else {
            console.log('[NoteEditor] ✅ SUCCESS! Inserted', people.length, 'people associations');
            console.log('[NoteEditor] Inserted data:', JSON.stringify(insertedData, null, 2));
          }
        } catch (error: any) {
          console.error('[NoteEditor] 🔥 CRITICAL ERROR managing people associations:', error);
          console.error('[NoteEditor] Error stack:', error.stack);
        }
      } else if (isEditing) {
        console.log('[NoteEditor] Skipping people save - editing existing note (people saved from word cloud)');
      } else {
        console.log('[NoteEditor] No people to save');
      }

      console.log('[NoteEditor] ===== NAVIGATING BACK IMMEDIATELY =====');
      
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      router.back();
      
      setTimeout(() => {
        if (isEditing && params.id) {
          refreshSingleNote(params.id as string);
        } else {
          refreshNotes();
        }
      }, 100);

      const imagesToUpload = images.filter(img => !img.id && (img.localUri || img.uri));
      
      if (imagesToUpload.length > 0) {
        console.log(`[NoteEditor] [ASYNC] Starting background upload of ${imagesToUpload.length} images...`);
        
        (async () => {
          let uploadedCount = 0;
          let failedCount = 0;
          const uploadedImageIds: string[] = [];

          for (const image of imagesToUpload) {
            const imageUri = image.localUri || image.uri;
            console.log('[NoteEditor] [ASYNC] Uploading image to database:', imageUri);
            
            try {
              const imageId = await uploadImageToDatabase(imageUri, recallId, image.contentType);
              
              if (imageId) {
                uploadedCount++;
                uploadedImageIds.push(imageId);
                console.log('[NoteEditor] [ASYNC] Image uploaded successfully to database');
                
                console.log('[NoteEditor] [ASYNC] Triggering OCR processing for image:', imageId);
                triggerOCRProcessing(imageId).then(result => {
                  if (result.success) {
                    console.log('[NoteEditor] [ASYNC] OCR processing triggered successfully for image:', imageId);
                  } else {
                    console.error('[NoteEditor] [ASYNC] Failed to trigger OCR processing:', result.error);
                  }
                }).catch(error => {
                  console.error('[NoteEditor] [ASYNC] Error triggering OCR processing:', error);
                });
                
                await refreshSingleNote(recallId);
              } else {
                failedCount++;
                console.error('[NoteEditor] [ASYNC] Failed to upload image to database');
              }
            } catch (error) {
              failedCount++;
              console.error('[NoteEditor] [ASYNC] Exception uploading image:', error);
            }
          }

          console.log(`[NoteEditor] [ASYNC] Upload complete: ${uploadedCount} images uploaded, ${failedCount} failed`);
          
          await refreshSingleNote(recallId);
        })();
      }

      console.log('[NoteEditor] [ASYNC] Processing URLs in note text for recall:', recallId);
      processRecallUrls(user.id, recallId, noteData.text).then(result => {
        if (result.success) {
          console.log('[NoteEditor] [ASYNC] URLs processed successfully');
        } else {
          console.error('[NoteEditor] [ASYNC] Failed to process URLs:', result.error);
        }
      }).catch(error => {
        console.error('[NoteEditor] [ASYNC] Error processing URLs:', error);
      });

      setTimeout(() => {
        triggerCategoryMatching(recallId).then(result => {
          if (result.success) {
            console.log('[NoteEditor] [ASYNC] Category matching triggered successfully after note save');
          } else {
            console.error('[NoteEditor] [ASYNC] Failed to trigger category matching:', result.error);
          }
        }).catch(error => {
          console.error('[NoteEditor] [ASYNC] Error triggering category matching:', error);
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
            console.log('[NoteEditor] [ASYNC] Embedding generation triggered successfully after note save');
          } else {
            console.error('[NoteEditor] [ASYNC] Failed to trigger embedding generation:', result.error);
          }
        }).catch(error => {
          console.error('[NoteEditor] [ASYNC] Error triggering embedding generation:', error);
        });
      }, 500);

      // Trigger people-finder to extract person names from text and images
      setTimeout(() => {
        console.log('[NoteEditor] [ASYNC] Triggering people-finder for recall:', recallId);
        triggerPeopleFinder(
          recallId,
          user.id,
          noteData.text,
          undefined // image_explanation will be fetched by the edge function
        ).then(result => {
          if (result.success) {
            console.log('[NoteEditor] [ASYNC] People-finder triggered successfully');
            console.log('[NoteEditor] [ASYNC] Found people:', result.data?.names || []);
          } else {
            console.error('[NoteEditor] [ASYNC] Failed to trigger people-finder:', result.error);
          }
        }).catch(error => {
          console.error('[NoteEditor] [ASYNC] Error triggering people-finder:', error);
        });
      }, 1000);

    } catch (error: any) {
      console.error('[NoteEditor] 🔥 CRITICAL ERROR saving recall:', error);
      console.error('[NoteEditor] Error stack:', error.stack);
      Alert.alert('Error', `Failed to save recall: ${error.message || 'Unknown error'}. Check console logs for details.`);
    } finally {
      setSaving(false);
    }
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

  const handleCloseFullScreenImage = useCallback(() => {
    console.log('Closing full screen image modal - no route refresh');
    setShowFullScreenImage(false);
  }, []);

  const displayImages = images.length > 1 ? lazyLoadedImages : images;

  useEffect(() => {
    console.log('[NoteEditor] People state changed. Current count:', people.length);
    if (people.length > 0) {
      console.log('[NoteEditor] Current people:', people.map(p => p.person_name).join(', '));
    }
  }, [people]);

  // Scroll to specific image if scrollToImageIndex is provided
  useEffect(() => {
    if (scrollToImageIndex !== undefined && images.length > scrollToImageIndex && imageScrollRef.current) {
      console.log('[NoteEditor] Scrolling to image index:', scrollToImageIndex);
      
      // Wait for images to load before scrolling
      setTimeout(() => {
        const scrollX = scrollToImageIndex * (IMAGE_CAROUSEL_WIDTH + IMAGE_CAROUSEL_SPACING);
        imageScrollRef.current?.scrollTo({
          x: scrollX,
          y: 0,
          animated: true,
        });
        
        // Update current image index
        setCurrentImageIndex(scrollToImageIndex);
        
        // Clear the parameter after scrolling
        router.setParams({ scrollToImage: undefined });
      }, 500);
    }
  }, [scrollToImageIndex, images.length, router]);

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
              <IconSymbol 
                name="chevron.left" 
                size={24} 
                color={colors.text} 
              />
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
                    <IconSymbol 
                      name="checkmark" 
                      size={20} 
                      color="#FFFFFF" 
                    />
                  </View>
                )}
              </Pressable>
            </View>
          ),
        }}
      />

      {showFABs && (
        <Pressable 
          style={styles.fabBackdrop} 
          onPress={handleBackdropPress}
        />
      )}

      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={true}
      >
        <Pressable 
          onPress={handleRichTextPress}
          style={[styles.textInputContainer, { height: textInputHeight }]}
        >
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
        </Pressable>

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
                      <IconSymbol 
                        name="xmark" 
                        size={14} 
                        color="#FFFFFF" 
                      />
                    </View>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {showFABs && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[
            styles.floatingActionsContainer,
            keyboardVisible && Platform.OS === 'ios' && {
              bottom: keyboardHeight + 60,
            },
          ]}
        >
          <Pressable
            style={styles.floatingActionButton}
            onPress={handleChooseFromLibrary}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol 
              name="photo.fill" 
              size={28} 
              color={colors.primary} 
            />
          </Pressable>

          <Pressable
            style={styles.floatingActionButton}
            onPress={handleTakePhoto}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol 
              name="camera.fill" 
              size={28} 
              color={colors.primary} 
            />
          </Pressable>
        </Animated.View>
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
        {/* Plus icon - Left aligned (swapped from right) */}
        <View style={styles.toolbarLeft}>
          <Pressable
            onPress={handlePlusPress}
            disabled={loading}
            style={styles.toolbarButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {loading ? (
              <View style={styles.loadingWithCount}>
                <ActivityIndicator size="small" color={colors.primary} />
                {processingCount > 1 && (
                  <Text style={styles.processingCountText}>{processingCount}</Text>
                )}
              </View>
            ) : (
              <IconSymbol 
                name="plus.circle.fill" 
                size={28} 
                color={colors.text} 
              />
            )}
          </Pressable>
        </View>

        <View style={styles.toolbarCenter}>
          <Pressable
            style={styles.locationPill}
            onPress={handleLocationSearch}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol 
              name="mappin.circle.fill" 
              size={16} 
              color={colors.primary} 
            />
            <Text style={styles.locationPillText} numberOfLines={1}>
              {locationName || 'Add Location'}
            </Text>
          </Pressable>
        </View>

        {/* Keyboard icons - Right aligned (swapped from left) */}
        <View style={styles.toolbarRight}>
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
      </View>

      {saving && (
        <View style={styles.savingModalContainer}>
          <View style={styles.savingModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.savingModalText}>Saving Recall...</Text>
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1001,
  },
  floatingActionsContainer: {
    position: 'absolute',
    bottom: 95,
    right: 20,
    flexDirection: 'column',
    gap: 12,
    zIndex: 1002,
  },
  floatingActionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    boxShadow: '0px 4px 12px rgba(255, 107, 122, 0.4)',
    elevation: 8,
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
    width: 60,
  },
  toolbarCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 60,
  },
  toolbarButton: {
    padding: 8 * 1.15,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${colors.primary}20`,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    flex: 1,
    minWidth: 0,
    maxWidth: 280,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  locationPillText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    flex: 1,
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
  loadingWithCount: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingCountText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
});
