
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
  Platform,
  Keyboard,
  Linking,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Modal,
} from 'react-native';
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
  SlideInDown,
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
import LocationSearchScreen from '@/app/location-search';

interface ImageData {
  id?: string;
  uri: string;
  localUri?: string;
  contentType: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_CAROUSEL_WIDTH = (SCREEN_WIDTH - 40) * 0.48;
const IMAGE_CAROUSEL_SPACING = 10;

const hasUrl = (text: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
};

interface NoteEditorSlideUpProps {
  visible: boolean;
  noteId?: string;
  onClose: () => void;
  onSave?: () => void;
}

export function NoteEditorSlideUp({ visible, noteId, onClose, onSave }: NoteEditorSlideUpProps) {
  const { user } = useAuth();
  const { addNote, updateNote, deleteNote, refreshNotes, refreshSingleNote, getCachedNote } = useNotesContext();

  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageData[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const [saving, setSaving] = useState(false);
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
  const [people, setPeople] = useState<Person[]>([]);
  const [initialPeople, setInitialPeople] = useState<Person[]>([]);
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const imageScrollRef = useRef<ScrollView>(null);

  const [loadedImageIndices, setLoadedImageIndices] = useState<Set<number>>(new Set());
  const [initialImageCount, setInitialImageCount] = useState(0);

  const [showLocationSearch, setShowLocationSearch] = useState(false);

  const isEditing = !!noteId;
  
  const canSave = text.trim().length > 0 || images.length > 0;
  const hasImages = images.length > 0;
  const textHasUrl = hasUrl(text);
  
  const textInputHeight = hasImages ? 510 : 792;

  useEffect(() => {
    if (images.length > 0) {
      const initialLoaded = new Set<number>();
      for (let i = 0; i < Math.min(3, images.length); i++) {
        if (images[i].uri) {
          initialLoaded.add(i);
        }
      }
      setLoadedImageIndices(initialLoaded);
      console.log(`[NoteEditorSlideUp] Initialized with ${initialLoaded.size} loaded images`);
    } else {
      setLoadedImageIndices(new Set());
    }
  }, [images]);

  const handleImageScroll = async (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const itemWidth = IMAGE_CAROUSEL_WIDTH + IMAGE_CAROUSEL_SPACING;
    
    const rawIndex = contentOffsetX / itemWidth;
    const calculatedIndex = Math.floor(rawIndex + 0.5);
    const clampedIndex = Math.max(0, Math.min(calculatedIndex, images.length - 1));
    
    if (clampedIndex !== currentImageIndex) {
      setCurrentImageIndex(clampedIndex);
    }
    
    const indicesToLoad: number[] = [];
    
    if (!loadedImageIndices.has(clampedIndex) && images[clampedIndex] && images[clampedIndex].id && !images[clampedIndex].uri) {
      indicesToLoad.push(clampedIndex);
    }
    
    const nextIndex = clampedIndex + 1;
    if (nextIndex < images.length && !loadedImageIndices.has(nextIndex) && images[nextIndex] && images[nextIndex].id && !images[nextIndex].uri) {
      indicesToLoad.push(nextIndex);
    }
    
    const prevIndex = clampedIndex - 1;
    if (prevIndex >= 0 && !loadedImageIndices.has(prevIndex) && images[prevIndex] && images[prevIndex].id && !images[prevIndex].uri) {
      indicesToLoad.push(prevIndex);
    }
    
    if (indicesToLoad.length > 0) {
      console.log(`[NoteEditorSlideUp] Loading images at indices: ${indicesToLoad.join(', ')}`);
      
      for (const indexToLoad of indicesToLoad) {
        const imageToLoad = images[indexToLoad];
        
        if (imageToLoad.id) {
          try {
            console.log(`[NoteEditorSlideUp] Loading image ${indexToLoad} with ID: ${imageToLoad.id}`);
            const imageUrl = await getImageDataUrl(imageToLoad.id);
            
            if (imageUrl) {
              setImages(prev => {
                const newImages = [...prev];
                newImages[indexToLoad] = { ...imageToLoad, uri: imageUrl };
                return newImages;
              });
              
              setLoadedImageIndices(prev => {
                const newSet = new Set(prev);
                newSet.add(indexToLoad);
                return newSet;
              });
              
              console.log(`[NoteEditorSlideUp] Successfully loaded image at index ${indexToLoad}`);
            }
          } catch (error) {
            console.error(`[NoteEditorSlideUp] Error loading image at index ${indexToLoad}:`, error);
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
    const loadNoteFromCacheOrDatabase = async () => {
      if (!isEditing || !noteId || !user) {
        return;
      }

      try {
        console.log('[NoteEditorSlideUp] ===== OPTIMIZED LOADING =====');
        console.log('[NoteEditorSlideUp] Loading note:', noteId);

        const cachedNote = getCachedNote(noteId);
        
        if (cachedNote) {
          console.log('[NoteEditorSlideUp] ✅ Using CACHED data for instant load');
          
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
            console.log('[NoteEditorSlideUp] Loaded people from cache:', cachedNote.people);
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
            setInitialImageCount(cachedImages.length);
            console.log(`[NoteEditorSlideUp] Loaded ${cachedImages.length} images from cache`);
          }

          console.log('[NoteEditorSlideUp] Refreshing data in background...');
          
          const { data: recallData, error: recallError } = await supabase
            .from('recalls')
            .select('*')
            .eq('id', noteId)
            .eq('user_id', user.id)
            .single();

          if (!recallError && recallData) {
            if (recallData.updated_at !== cachedNote.updated_at) {
              console.log('[NoteEditorSlideUp] Data changed, updating from database');
              
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
                    console.error(`[NoteEditorSlideUp] Error loading image ${img.id}:`, error);
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
                setInitialImageCount(loadedImages.length);
              }
            } else {
              console.log('[NoteEditorSlideUp] Data unchanged, using cache');
            }
          }
          
          return;
        }

        console.log('[NoteEditorSlideUp] ⚠️ No cache available, loading from database');
        setLoadingNote(true);

        const { data: recallData, error: recallError } = await supabase
          .from('recalls')
          .select('*')
          .eq('id', noteId)
          .eq('user_id', user.id)
          .single();

        if (recallError || !recallData) {
          console.error('[NoteEditorSlideUp] Error loading recall:', recallError);
          Alert.alert('Error', 'Failed to load note');
          onClose();
          return;
        }

        console.log('[NoteEditorSlideUp] Note loaded from database:', recallData);

        setText(recallData.text || '');
        setLocationName(recallData.location || '');
        setLocationPrimaryType(recallData.location_primary_type || '');
        
        if (recallData.latitude && recallData.longitude) {
          setLocation({
            latitude: recallData.latitude,
            longitude: recallData.longitude,
          });
        }

        console.log('[NoteEditorSlideUp] Loading people for recall:', noteId);
        const { data: recallPeopleData, error: recallPeopleError } = await supabase
          .from('recall_people')
          .select('person_id, persons(id, person_name, photo_url)')
          .eq('recall_id', noteId);

        if (recallPeopleError) {
          console.error('[NoteEditorSlideUp] Error loading recall_people:', recallPeopleError);
        } else if (recallPeopleData && recallPeopleData.length > 0) {
          const loadedPeople: Person[] = recallPeopleData
            .filter((rp: any) => rp.persons)
            .map((rp: any) => ({
              id: rp.persons.id,
              person_name: rp.persons.person_name,
              photo_url: rp.persons.photo_url,
            }));
          console.log('[NoteEditorSlideUp] Loaded people from database:', loadedPeople);
          setPeople(loadedPeople);
          setInitialPeople(loadedPeople);
          console.log(`[NoteEditorSlideUp] Set ${loadedPeople.length} people in state`);
        } else {
          console.log('[NoteEditorSlideUp] No people found for this recall');
          setPeople([]);
          setInitialPeople([]);
        }

        const { data: imagesData, error: imagesError } = await supabase
          .from('recall_images')
          .select('id')
          .eq('recall_id', noteId)
          .order('created_at', { ascending: true });

        if (imagesError) {
          console.error('[NoteEditorSlideUp] Error loading images:', imagesError);
        } else if (imagesData && imagesData.length > 0) {
          console.log(`[NoteEditorSlideUp] Loading ${imagesData.length} images for note`);
          
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
                console.log(`[NoteEditorSlideUp] Image ${img.id} loaded successfully`);
              } else {
                console.error(`[NoteEditorSlideUp] Failed to load image ${img.id}`);
              }
            } catch (error) {
              console.error(`[NoteEditorSlideUp] Error loading image ${img.id}:`, error);
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
          setInitialImageCount(loadedImages.length);
          console.log(`[NoteEditorSlideUp] Loaded ${imagesToLoadImmediately.length}/${imagesData.length} images immediately, ${imagesData.length - imagesToLoadImmediately.length} will be lazy loaded`);
        }
      } catch (error) {
        console.error('[NoteEditorSlideUp] Error loading note:', error);
        Alert.alert('Error', 'Failed to load note');
        onClose();
      } finally {
        setLoadingNote(false);
      }
    };

    if (visible && noteId) {
      loadNoteFromCacheOrDatabase();
    }
  }, [visible, noteId, user, getCachedNote, onClose, isEditing]);

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

        console.log(`[NoteEditorSlideUp] Converting ${result.assets.length} images in parallel`);
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
            
            if (isEditing && noteId) {
              console.log('[NoteEditorSlideUp] Image removed - triggering background refresh of recall card');
              setTimeout(() => {
                refreshSingleNote(noteId);
              }, 100);
            }
          },
        },
      ]
    );
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
    setShowLocationSearch(true);
  };

  const handleLocationSelected = (selectedLocation: {
    latitude: number;
    longitude: number;
    name: string;
    primaryType?: string;
    displayName: string;
    formattedAddress: string;
  }) => {
    console.log('[NoteEditorSlideUp] Location selected from modal:', selectedLocation);
    
    setLocation({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
    });
    setLocationName(selectedLocation.name);
    setLocationPrimaryType(selectedLocation.primaryType || '');
    
    setShowLocationSearch(false);
  };

  const handlePeopleChange = useCallback((newPeople: Person[]) => {
    console.log('[NoteEditorSlideUp] ===== PEOPLE CHANGED =====');
    console.log('[NoteEditorSlideUp] Previous people count:', people.length);
    console.log('[NoteEditorSlideUp] New people count:', newPeople.length);
    console.log('[NoteEditorSlideUp] New people:', newPeople.map(p => p.person_name).join(', '));
    setPeople(newPeople);
    console.log('[NoteEditorSlideUp] People state updated');
  }, [people.length]);

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    if (!user) {
      console.error('[NoteEditorSlideUp] ERROR: No user found, cannot save');
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setSaving(true);
      console.log('[NoteEditorSlideUp] ===== STARTING SAVE PROCESS =====');

      const noteData = {
        text: text.trim(),
        latitude: location?.latitude,
        longitude: location?.longitude,
        location: locationName,
        location_primary_type: locationPrimaryType || null,
      };

      console.log('[NoteEditorSlideUp] Note data to save:', noteData);
      console.log('[NoteEditorSlideUp] Current people state:', people);
      console.log('[NoteEditorSlideUp] People count:', people.length);

      let recallId: string;
      let imagesChanged = false;

      if (isEditing && noteId) {
        console.log('[NoteEditorSlideUp] Updating existing recall:', noteId);
        await updateNote(noteId, noteData);
        recallId = noteId;

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
              console.log('[NoteEditorSlideUp] Deleting removed image:', img.id);
              await deleteImageRecord(img.id);
              imagesChanged = true;
            } else {
              console.log('[NoteEditorSlideUp] Keeping existing image:', img.id);
            }
          }
        }
        
        const newImagesCount = images.filter(img => !img.id).length;
        if (newImagesCount > 0) {
          imagesChanged = true;
        }
        
        if (images.length !== initialImageCount) {
          imagesChanged = true;
        }

        // Trigger embedding regeneration for updated recall
        console.log('[NoteEditorSlideUp] Triggering embedding regeneration for updated recall:', recallId);
        setTimeout(() => {
          triggerRecallEmbedding(
            recallId,
            noteData.text,
            noteData.location,
            noteData.location_primary_type || undefined
          ).then(result => {
            if (result.success) {
              console.log('[NoteEditorSlideUp] [ASYNC] Embedding regeneration triggered successfully after recall update');
            } else {
              console.error('[NoteEditorSlideUp] [ASYNC] Failed to trigger embedding regeneration:', result.error);
            }
          }).catch(error => {
            console.error('[NoteEditorSlideUp] [ASYNC] Error triggering embedding regeneration:', error);
          });
        }, 500);
      } else {
        console.log('[NoteEditorSlideUp] Creating new recall');
        recallId = await addNote(noteData);
        console.log('[NoteEditorSlideUp] New recall created with ID:', recallId);
      }

      if (!isEditing && people.length > 0) {
        try {
          console.log('[NoteEditorSlideUp] ===== SAVING PEOPLE ASSOCIATIONS FOR NEW NOTE =====');
          console.log('[NoteEditorSlideUp] Recall ID:', recallId);
          console.log('[NoteEditorSlideUp] User ID:', user.id);
          console.log('[NoteEditorSlideUp] People to save:', people);
          console.log('[NoteEditorSlideUp] People count:', people.length);
          
          const insertData = people.map(person => ({
            recall_id: recallId,
            person_id: person.id,
            user_id: user.id,
          }));
          
          console.log('[NoteEditorSlideUp] Data to insert:', JSON.stringify(insertData, null, 2));
          
          const { data: insertedData, error: peopleError } = await supabase
            .from('recall_people')
            .insert(insertData)
            .select();
          
          if (peopleError) {
            console.error('[NoteEditorSlideUp] ❌ ERROR inserting people associations:', peopleError);
            console.error('[NoteEditorSlideUp] Error details:', JSON.stringify(peopleError, null, 2));
          } else {
            console.log('[NoteEditorSlideUp] ✅ SUCCESS! Inserted', people.length, 'people associations');
            console.log('[NoteEditorSlideUp] Inserted data:', JSON.stringify(insertedData, null, 2));
          }
        } catch (error: any) {
          console.error('[NoteEditorSlideUp] 🔥 CRITICAL ERROR managing people associations:', error);
          console.error('[NoteEditorSlideUp] Error stack:', error.stack);
        }
      } else if (isEditing) {
        console.log('[NoteEditorSlideUp] Skipping people save - editing existing note (people saved from word cloud)');
      } else {
        console.log('[NoteEditorSlideUp] No people to save');
      }

      console.log('[NoteEditorSlideUp] ===== CLOSING SLIDE-UP IMMEDIATELY =====');
      
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      onClose();
      
      if (onSave) {
        onSave();
      }
      
      setTimeout(() => {
        if (isEditing && noteId) {
          console.log('[NoteEditorSlideUp] Triggering background refresh of recall card with lazy loading');
          refreshSingleNote(noteId);
        } else {
          refreshNotes();
        }
      }, 100);

      const imagesToUpload = images.filter(img => !img.id && (img.localUri || img.uri));
      
      if (imagesToUpload.length > 0) {
        console.log(`[NoteEditorSlideUp] [ASYNC] Starting background upload of ${imagesToUpload.length} images...`);
        
        (async () => {
          let uploadedCount = 0;
          let failedCount = 0;
          const uploadedImageIds: string[] = [];

          for (const image of imagesToUpload) {
            const imageUri = image.localUri || image.uri;
            console.log('[NoteEditorSlideUp] [ASYNC] Uploading image to database:', imageUri);
            
            try {
              const imageId = await uploadImageToDatabase(imageUri, recallId, image.contentType);
              
              if (imageId) {
                uploadedCount++;
                uploadedImageIds.push(imageId);
                console.log('[NoteEditorSlideUp] [ASYNC] Image uploaded successfully to database');
                
                console.log('[NoteEditorSlideUp] [ASYNC] Triggering OCR processing for image:', imageId);
                triggerOCRProcessing(imageId).then(result => {
                  if (result.success) {
                    console.log('[NoteEditorSlideUp] [ASYNC] OCR processing triggered successfully for image:', imageId);
                  } else {
                    console.error('[NoteEditorSlideUp] [ASYNC] Failed to trigger OCR processing:', result.error);
                  }
                }).catch(error => {
                  console.error('[NoteEditorSlideUp] [ASYNC] Error triggering OCR processing:', error);
                });
                
                console.log('[NoteEditorSlideUp] [ASYNC] Refreshing recall card with lazy loading');
                await refreshSingleNote(recallId);
              } else {
                failedCount++;
                console.error('[NoteEditorSlideUp] [ASYNC] Failed to upload image to database');
              }
            } catch (error) {
              failedCount++;
              console.error('[NoteEditorSlideUp] [ASYNC] Exception uploading image:', error);
            }
          }

          console.log(`[NoteEditorSlideUp] [ASYNC] Upload complete: ${uploadedCount} images uploaded, ${failedCount} failed`);
          
          console.log('[NoteEditorSlideUp] [ASYNC] Final refresh of recall card with lazy loading');
          await refreshSingleNote(recallId);
        })();
      } else if (imagesChanged && isEditing) {
        console.log('[NoteEditorSlideUp] Images changed (removed) - triggering background refresh');
        setTimeout(() => {
          refreshSingleNote(recallId);
        }, 100);
      }

      console.log('[NoteEditorSlideUp] [ASYNC] Processing URLs in note text for recall:', recallId);
      processRecallUrls(user.id, recallId, noteData.text).then(result => {
        if (result.success) {
          console.log('[NoteEditorSlideUp] [ASYNC] URLs processed successfully');
        } else {
          console.error('[NoteEditorSlideUp] [ASYNC] Failed to process URLs:', result.error);
        }
      }).catch(error => {
        console.error('[NoteEditorSlideUp] [ASYNC] Error processing URLs:', error);
      });

      setTimeout(() => {
        triggerCategoryMatching(recallId).then(result => {
          if (result.success) {
            console.log('[NoteEditorSlideUp] [ASYNC] Category matching triggered successfully after note save');
          } else {
            console.error('[NoteEditorSlideUp] [ASYNC] Failed to trigger category matching:', result.error);
          }
        }).catch(error => {
          console.error('[NoteEditorSlideUp] [ASYNC] Error triggering category matching:', error);
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
            console.log('[NoteEditorSlideUp] [ASYNC] Embedding generation triggered successfully after note save');
          } else {
            console.error('[NoteEditorSlideUp] [ASYNC] Failed to trigger embedding generation:', result.error);
          }
        }).catch(error => {
          console.error('[NoteEditorSlideUp] [ASYNC] Error triggering embedding generation:', error);
        });
      }, 500);

      // Trigger people-finder to extract person names from text and images
      setTimeout(() => {
        console.log('[NoteEditorSlideUp] [ASYNC] Triggering people-finder for recall:', recallId);
        triggerPeopleFinder(
          recallId,
          user.id,
          noteData.text,
          undefined // image_explanation will be fetched by the edge function
        ).then(result => {
          if (result.success) {
            console.log('[NoteEditorSlideUp] [ASYNC] People-finder triggered successfully');
            console.log('[NoteEditorSlideUp] [ASYNC] Found people:', result.data?.names || []);
          } else {
            console.error('[NoteEditorSlideUp] [ASYNC] Failed to trigger people-finder:', result.error);
          }
        }).catch(error => {
          console.error('[NoteEditorSlideUp] [ASYNC] Error triggering people-finder:', error);
        });
      }, 1000);

    } catch (error: any) {
      console.error('[NoteEditorSlideUp] 🔥 CRITICAL ERROR saving recall:', error);
      console.error('[NoteEditorSlideUp] Error stack:', error.stack);
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
    setShowLocationSearch(true);
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

  useEffect(() => {
    console.log('[NoteEditorSlideUp] People state changed. Current count:', people.length);
    if (people.length > 0) {
      console.log('[NoteEditorSlideUp] Current people:', people.map(p => p.person_name).join(', '));
    }
  }, [people]);

  if (!visible) {
    return null;
  }

  const allImagesLoaded = images.length <= 2 || images.every((img, index) => index < 2 || loadedImageIndices.has(index) || img.uri);

  return (
    <>
      <Modal
        visible={visible}
        transparent={true}
        animationType="none"
        onRequestClose={onClose}
      >
        <Animated.View
          entering={FadeIn.duration(200)}
          style={styles.overlay}
        >
          <Pressable 
            style={StyleSheet.absoluteFill} 
            onPress={onClose}
          />
          
          <Animated.View
            entering={SlideInDown.duration(300).springify()}
            style={styles.slideUpContainer}
          >
            {loadingNote ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading note...</Text>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <Pressable 
                    onPress={onClose} 
                    style={styles.headerButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <IconSymbol 
                      ios_icon_name="xmark" 
                      android_material_icon_name="close" 
                      size={24} 
                      color={colors.text} 
                    />
                  </Pressable>
                  
                  <Text style={styles.headerTitle}>
                    {isEditing ? 'Edit Recall' : 'New Recall'}
                  </Text>
                  
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
                          ios_icon_name="checkmark" 
                          android_material_icon_name="check" 
                          size={20} 
                          color="#FFFFFF" 
                        />
                      </View>
                    )}
                  </Pressable>
                </View>

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
                  recallId={isEditing ? noteId : undefined}
                />

                {hasImages && (
                  <View style={styles.imagesContainer}>
                    <View style={styles.imagesHeader}>
                      <Text style={styles.imagesTitle}>{images.length} {images.length === 1 ? 'Image' : 'Images'}</Text>
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
                      {images.map((image, index) => {
                        const isLoaded = loadedImageIndices.has(index) || image.uri;
                        
                        return (
                          <Pressable 
                            key={`${image.id || 'new'}-${index}`} 
                            style={styles.imageWrapper}
                            onPress={() => handleImagePress(index)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            {!isLoaded ? (
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
                                    ios_icon_name="xmark" 
                                    android_material_icon_name="close" 
                                    size={12} 
                                    color="#FFFFFF" 
                                  />
                                </View>
                              </Pressable>
                            </View>
                          </Pressable>
                        );
                      })}
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
                        ios_icon_name="photo.fill" 
                        android_material_icon_name="photo" 
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
                        ios_icon_name="camera.fill" 
                        android_material_icon_name="camera" 
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
                          ios_icon_name="plus.circle.fill" 
                          android_material_icon_name="add-circle" 
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
                        ios_icon_name="mappin.circle.fill" 
                        android_material_icon_name="location-on" 
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
                        ios_icon_name={keyboardVisible ? "keyboard.chevron.compact.down" : "keyboard"} 
                        android_material_icon_name={keyboardVisible ? "keyboard-hide" : "keyboard"} 
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
              </>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>

      <LocationSearchScreen
        visible={showLocationSearch}
        onClose={() => setShowLocationSearch(false)}
        onSelectLocation={handleLocationSelected}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  slideUpContainer: {
    height: SCREEN_HEIGHT * 0.85,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
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
  textInputContainer: {
    padding: 20,
  },
  textInputScrollView: {
    flex: 1,
  },
  textInput: {
    fontSize: 16,
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
    top: 6,
    right: 6,
    flexDirection: 'row',
    gap: 8,
  },
  imageActionButton: {
    // No additional styles needed
  },
  actionButtonCircle: {
    width: 24,
    height: 24,
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
