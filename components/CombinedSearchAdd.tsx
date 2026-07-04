import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  Platform,
  Keyboard,
  Alert,
  TouchableWithoutFeedback,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import Animated, { 
  FadeIn, 
  SlideInDown, 
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { supabase } from '@/utils/supabase';
import { pickDocuments, PickedDocument } from '@/utils/documentPicker';
import { DocumentTile } from '@/components/DocumentTile';
import { Document } from '@/types/Document';

interface CombinedSearchAddProps {
  onCreateRecall: (data: {
    text: string;
    images: string[];
    documents: Document[];
    location?: { latitude: number; longitude: number; name: string; primaryType?: string };
  }, onProgress?: (stage: string) => void) => Promise<void>;
  userId: string;
  onDismiss?: () => void;
}

interface ImageState {
  uri: string;
  isPlaceholder: boolean;
  originalUri?: string;
}

export function CombinedSearchAdd({ onCreateRecall, userId, onDismiss }: CombinedSearchAddProps) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageState[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; name: string; primaryType?: string } | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [savingStage, setSavingStage] = useState<string>('');
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; name: string; primaryType?: string } | null>(null);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);
  const lastLocationFetchRef = useRef<number>(0);
  const locationRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const processedParamsRef = useRef<string>('');

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      console.log('[CombinedSearchAdd] App became active - refreshing location');
      getCurrentLocation();
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  useEffect(() => {
    if (locationRefreshIntervalRef.current) {
      clearInterval(locationRefreshIntervalRef.current);
    }

    locationRefreshIntervalRef.current = setInterval(() => {
      const timeSinceLastFetch = Date.now() - lastLocationFetchRef.current;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (timeSinceLastFetch > fiveMinutes) {
        console.log('[CombinedSearchAdd] Auto-refreshing location after 5 minutes of inactivity');
        getCurrentLocation();
      }
    }, 60000);

    return () => {
      if (locationRefreshIntervalRef.current) {
        clearInterval(locationRefreshIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
        translateY.value = withTiming(-(e.endCoordinates.height - 10), { duration: 250 });
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
        translateY.value = withTiming(0, { duration: 250 });
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, [translateY]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const getCurrentLocation = async () => {
    try {
      setIsRefreshingLocation(true);
      console.log('[CombinedSearchAdd] Fetching current location...');
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
        setIsRefreshingLocation(false);
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = currentPosition.coords;

      console.log('[CombinedSearchAdd] GPS coordinates:', { latitude, longitude });

      const { reverseGeocodeGoogle } = await import('@/utils/googlePlaces');
      const locationName = await reverseGeocodeGoogle(latitude, longitude);

      console.log('[CombinedSearchAdd] Resolved location name:', locationName);

      const locationData = {
        latitude,
        longitude,
        name: locationName,
        primaryType: undefined,
      };

      setCurrentLocation(locationData);
      lastLocationFetchRef.current = Date.now();
      
      console.log('[CombinedSearchAdd] Current location obtained:', locationData);
    } catch (error) {
      console.error('[CombinedSearchAdd] Error getting current location:', error);
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  useEffect(() => {
    if (params.selectedLatitude && params.selectedLongitude && params.selectedLocationName) {
      const paramsKey = `${params.selectedLatitude}-${params.selectedLongitude}-${params.selectedLocationName}`;
      
      if (processedParamsRef.current === paramsKey) {
        console.log('[CombinedSearchAdd] Already processed these params, skipping');
        return;
      }
      
      processedParamsRef.current = paramsKey;
      
      const selectedLocation = {
        latitude: parseFloat(params.selectedLatitude as string),
        longitude: parseFloat(params.selectedLongitude as string),
        name: params.selectedLocationName as string,
        primaryType: params.selectedPrimaryType ? (params.selectedPrimaryType as string) : undefined,
      };
      
      console.log('[CombinedSearchAdd] Location selected from location-search:', selectedLocation);
      setLocation(selectedLocation);
      setShowDrawer(false);
      
      setTimeout(() => {
        try {
          console.log('[CombinedSearchAdd] Clearing location params');
          router.setParams({
            selectedLatitude: undefined,
            selectedLongitude: undefined,
            selectedLocationName: undefined,
            selectedDisplayName: undefined,
            selectedFullAddress: undefined,
            selectedPrimaryType: undefined,
          });
          
          setTimeout(() => {
            processedParamsRef.current = '';
          }, 1000);
        } catch (error) {
          console.error('[CombinedSearchAdd] Error clearing params:', error);
        }
      }, 0);
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName, params.selectedPrimaryType, router]);

  const handlePlusPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowDrawer(true);
  };

  const handleSearchPress = async () => {
    const searchQuery = text.trim();
    
    console.log('[CombinedSearchAdd] Dismissing keyboard');
    Keyboard.dismiss();
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    if (!searchQuery) {
      console.log('[CombinedSearchAdd] Empty search query - navigating to search screen to show history');
      
      setTimeout(() => {
        try {
          router.push('/search');
        } catch (error) {
          console.error('[CombinedSearchAdd] Error navigating to search:', error);
        }
      }, 0);
      return;
    }

    console.log('[CombinedSearchAdd] Search icon pressed with query:', searchQuery);

    const encodedQuery = encodeURIComponent(searchQuery);
    const searchRoute = `/search?q=${encodedQuery}&autoSearch=true`;
    
    console.log('[CombinedSearchAdd] Navigating to search screen:', searchRoute);
    
    setTimeout(() => {
      try {
        router.push(searchRoute);
      } catch (error) {
        console.error('[CombinedSearchAdd] Error navigating to search:', error);
      }
    }, 0);

    setText('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { saveSearchHistory } = await import('@/utils/supabase');
        await saveSearchHistory(user.id, searchQuery);
        console.log('[CombinedSearchAdd] Search history saved');
      }
    } catch (error) {
      console.error('[CombinedSearchAdd] Error saving search history:', error);
    }
  };

  const handleTextChange = (newText: string) => {
    setText(newText);
  };

  const handleImagePick = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        console.log('[CombinedSearchAdd] Selected images:', result.assets.length);
        
        const placeholderImages: ImageState[] = result.assets.map(asset => ({
          uri: asset.uri,
          isPlaceholder: true,
          originalUri: asset.uri,
        }));
        
        setImages(prev => [...prev, ...placeholderImages]);
        setShowDrawer(false);
        
        console.log('[CombinedSearchAdd] Starting image optimization for uploaded photos...');
        
        for (let i = 0; i < result.assets.length; i++) {
          const asset = result.assets[i];
          const originalUri = asset.uri;
          
          console.log(`[CombinedSearchAdd] Processing uploaded image ${i + 1}/${result.assets.length}`);
          
          const { compressImageForUpload } = await import('@/utils/imageOptimization');
          
          const optimizedUri = await compressImageForUpload(originalUri);
          
          console.log(`[CombinedSearchAdd] Image ${i + 1}/${result.assets.length} optimized`);
          
          setImages(prev => {
            const newImages = [...prev];
            const placeholderIndex = newImages.findIndex(
              img => img.isPlaceholder && img.originalUri === originalUri
            );
            
            if (placeholderIndex !== -1) {
              newImages[placeholderIndex] = {
                uri: optimizedUri,
                isPlaceholder: false,
              };
            }
            
            return newImages;
          });
        }
        
        console.log('[CombinedSearchAdd] All uploaded images optimized successfully');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleCameraPress = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        console.log('[CombinedSearchAdd] Camera photo taken');
        
        const placeholderImage: ImageState = {
          uri: result.assets[0].uri,
          isPlaceholder: true,
          originalUri: result.assets[0].uri,
        };
        
        setImages(prev => [...prev, placeholderImage]);
        setShowDrawer(false);
        
        console.log('[CombinedSearchAdd] Compressing camera photo...');
        const { compressImageForUpload } = await import('@/utils/imageOptimization');
        const compressedUri = await compressImageForUpload(result.assets[0].uri);
        console.log('[CombinedSearchAdd] Camera photo compressed successfully');
        
        setImages(prev => {
          const newImages = [...prev];
          const placeholderIndex = newImages.findIndex(
            img => img.isPlaceholder && img.originalUri === result.assets[0].uri
          );
          
          if (placeholderIndex !== -1) {
            newImages[placeholderIndex] = {
              uri: compressedUri,
              isPlaceholder: false,
            };
          }
          
          return newImages;
        });
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleLocationPress = () => {
    setShowDrawer(false);
    
    setTimeout(() => {
      try {
        router.push('/location-search');
      } catch (error) {
        console.error('[CombinedSearchAdd] Error navigating to location search:', error);
      }
    }, 0);
  };

  const handleCreateRecall = async () => {
    if (!text.trim() && images.length === 0 && documents.length === 0) {
      Alert.alert('Empty Recall', 'Please add some text, images, or documents');
      return;
    }

    console.log('[CombinedSearchAdd] Dismissing keyboard immediately on recall creation');
    console.log('[CombinedSearchAdd] Creating recall with', images.length, 'image(s) and', documents.length, 'document(s)');
    Keyboard.dismiss();
    if (textInputRef.current) {
      textInputRef.current.blur();
    }

    try {
      setIsCreating(true);
      
      const locationToSave = location;
      
      const imageUris = images.map(img => img.uri);
      
      await onCreateRecall(
        {
          text: text.trim(),
          images: imageUris,
          documents: documents,
          location: locationToSave || undefined,
        },
        (stage: string) => {
          setSavingStage(stage);
        }
      );

      setText('');
      setImages([]);
      setDocuments([]);
      setLocation(null);
      setSavingStage('');
    } catch (error) {
      console.error('Error creating recall:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsCreating(false);
      setSavingStage('');
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveDocument = (index: number) => {
    console.log('[CombinedSearchAdd] User tapped remove document at index:', index);
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const handleDocumentPick = async () => {
    console.log('[CombinedSearchAdd] User tapped document FAB');
    try {
      const picked = await pickDocuments();
      if (picked && picked.length > 0) {
        console.log('[CombinedSearchAdd] Picked', picked.length, 'document(s)');
        const newDocs: Document[] = picked.map(p => ({
          file_name: p.name,
          file_size: p.size,
          content_type: p.mimeType,
          local_uri: p.uri,
          local_thumbnail_uri: p.thumbnailUri,
          upload_state: 'pending' as const,
        }));
        setDocuments(prev => [...prev, ...newDocs]);
        setShowDrawer(false);
      }
    } catch (error) {
      console.error('[CombinedSearchAdd] Error picking documents:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handlePaste = async () => {
    console.log('[CombinedSearchAdd] Paste button pressed');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      // 1. Try image first
      const hasImage = await Clipboard.hasImageAsync();
      if (hasImage) {
        console.log('[CombinedSearchAdd] Clipboard has image, reading...');
        const clipImage = await Clipboard.getImageAsync({ format: 'jpeg' });
        if (clipImage?.data) {
          // Convert base64 to a local file URI via FileSystem
          const { FileSystem } = await import('expo-file-system');
          const fileUri = FileSystem.cacheDirectory + `clipboard_${Date.now()}.jpg`;
          await FileSystem.writeAsStringAsync(fileUri, clipImage.data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          console.log('[CombinedSearchAdd] Clipboard image written to cache:', fileUri);
          // Add as placeholder then optimise
          const placeholder: ImageState = { uri: fileUri, isPlaceholder: true, originalUri: fileUri };
          setImages(prev => [...prev, placeholder]);
          const { compressImageForUpload } = await import('@/utils/imageOptimization');
          const optimized = await compressImageForUpload(fileUri);
          setImages(prev => {
            const next = [...prev];
            const idx = next.findIndex(img => img.isPlaceholder && img.originalUri === fileUri);
            if (idx !== -1) next[idx] = { uri: optimized, isPlaceholder: false };
            return next;
          });
          console.log('[CombinedSearchAdd] Clipboard image optimized and added');
          return;
        }
      }

      // 2. Try URL (iOS only)
      if (Platform.OS === 'ios') {
        const hasUrl = await Clipboard.hasUrlAsync();
        if (hasUrl) {
          const url = await Clipboard.getUrlAsync();
          if (url) {
            console.log('[CombinedSearchAdd] Pasting URL from clipboard:', url);
            setText(prev => prev ? `${prev}\n${url}` : url);
            return;
          }
        }
      }

      // 3. Try plain text
      const hasText = await Clipboard.hasStringAsync();
      if (hasText) {
        const str = await Clipboard.getStringAsync();
        if (str) {
          console.log('[CombinedSearchAdd] Pasting text from clipboard, length:', str.length);
          setText(prev => prev ? `${prev}\n${str}` : str);
          return;
        }
      }

      // 4. Nothing found
      console.log('[CombinedSearchAdd] Clipboard is empty');
      Alert.alert('Nothing to paste', 'Your clipboard is empty.');
    } catch (err) {
      console.error('[CombinedSearchAdd] Paste error:', err);
      Alert.alert('Paste failed', 'Could not read clipboard content.');
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const allImagesOptimized = images.length === 0 || images.every(img => !img.isPlaceholder);
  
  const isUpArrowDisabled = (!text.trim() && images.length === 0 && documents.length === 0) || !allImagesOptimized;

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <Animated.View style={[styles.outerContainer, animatedStyle]}>
        {showDrawer && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.floatingActionsContainer}
          >
            <Pressable
              style={styles.floatingActionButton}
              onPress={handleDocumentPick}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="doc.fill" size={28} color={colors.primary} />
            </Pressable>

            <Pressable
              style={styles.floatingActionButton}
              onPress={handleImagePick}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="photo.fill" size={28} color={colors.primary} />
            </Pressable>

            <Pressable
              style={styles.floatingActionButton}
              onPress={handleCameraPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="camera.fill" size={28} color={colors.primary} />
            </Pressable>
          </Animated.View>
        )}

        <Pressable
          onPress={handlePaste}
          style={[styles.pasteButtonOuter, !onDismiss && styles.pasteButtonOuterNoClose]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <IconSymbol name="doc.on.clipboard" size={14} color={colors.primary} />
        </Pressable>

        {onDismiss && (
          <Pressable
            onPress={() => {
              console.log('[CombinedSearchAdd] Close button pressed');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDismiss();
            }}
            style={styles.closeButtonOuter}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <IconSymbol name="xmark" size={14} color={colors.primary} />
          </Pressable>
        )}

        <View style={styles.containerWrapper}>
          <View style={styles.container}>
            <View style={styles.inputContainer}>
              {(images.length > 0 || documents.length > 0) && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.imagesScroll}
                  contentContainerStyle={styles.imagesScrollContent}
                  decelerationRate="fast"
                  scrollEnabled={true}
                  nestedScrollEnabled={true}
                  removeClippedSubviews={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {images.map((imageState, index) => (
                    <View key={`img-${index}`} style={styles.imageContainer}>
                      <Image source={{ uri: imageState.uri }} style={styles.image} />
                      {imageState.isPlaceholder && (
                        <View style={styles.placeholderOverlay}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={styles.placeholderText}>Optimizing...</Text>
                        </View>
                      )}
                      <Pressable
                        style={styles.removeImageButton}
                        onPress={() => handleRemoveImage(index)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <IconSymbol name="xmark.circle.fill" size={20} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                  {documents.map((doc, index) => (
                    <DocumentTile
                      key={`doc-${index}`}
                      document={doc}
                      width={80}
                      height={80}
                      showRemoveButton
                      onRemove={() => handleRemoveDocument(index)}
                    />
                  ))}
                </ScrollView>
              )}

              <TextInput
                ref={textInputRef}
                style={styles.textInput}
                placeholder="Add a Recall"
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={handleTextChange}
                multiline
                returnKeyType="default"
                blurOnSubmit={false}
                enablesReturnKeyAutomatically={false}
              />

              <View style={styles.inputRow}>
                {/* Plus Button - First */}
                <Pressable
                  style={styles.plusButton}
                  onPress={handlePlusPress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol 
                    name="plus.circle.fill" 
                    size={28} 
                    color={colors.text} 
                  />
                </Pressable>

                {/* Location Pill - Second */}
                <View style={[styles.locationPillExtended, location && styles.locationPillExtendedWithX]}>
                  <Pressable
                    style={styles.locationPillInner}
                    onPress={() => {
                      console.log('[CombinedSearchAdd] Location pill pressed');
                      handleLocationPress();
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <IconSymbol 
                      name="mappin.circle.fill" 
                      size={16} 
                      color={colors.primary} 
                    />
                    <Text style={styles.locationPillText} numberOfLines={1}>
                      {location?.name || 'Click to add a location'}
                    </Text>
                  </Pressable>
                  {location && (
                    <Pressable
                      onPress={() => {
                        console.log('[CombinedSearchAdd] Location clear button pressed');
                        setLocation(null);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <IconSymbol name="xmark.circle.fill" size={16} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
								
                <View style={styles.iconSpacer} />

                {/* Up Arrow Button - Third (Create Recall) */}
                <Pressable
                  style={[styles.upArrowButtonContainer, isUpArrowDisabled && styles.upArrowButtonDisabled]}
                  onPress={handleCreateRecall}
                  disabled={isUpArrowDisabled || isCreating}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.upArrowButtonBorder}>
                    <IconSymbol 
                      name="arrow.up" 
                      size={18} 
                      color={colors.primary} 
                    />
                  </View>
                </Pressable>

              </View>
            </View>
          </View>
        </View>

        {showDrawer && (
          <Pressable 
            style={styles.drawerBackdrop} 
            onPress={() => setShowDrawer(false)} 
          />
        )}

        {isCreating && savingStage && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.savingText}>{savingStage}</Text>
          </View>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 25,
    left: 10,
    right: 10,
    zIndex: 1000,
    elevation: 1000,
  },
  closeButtonOuter: {
    position: 'absolute',
    top: -14,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1003,
    boxShadow: '0px 2px 6px rgba(255, 107, 122, 0.35)',
    elevation: 6,
  },
  pasteButtonOuter: {
    position: 'absolute',
    top: -14,
    right: 52,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1003,
    boxShadow: '0px 2px 6px rgba(255, 107, 122, 0.35)',
    elevation: 6,
  },
  pasteButtonOuterNoClose: {
    right: 16,
  },
  floatingActionsContainer: {
    position: 'absolute',
    bottom: 136,
    left: 16,
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
  containerWrapper: {
    position: 'relative',
    marginHorizontal: 16,
  },
  container: {
    backgroundColor: colors.background,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
    boxShadow: '0px 4px 12px rgba(255, 107, 122, 0.3)',
    elevation: 8,
  },
  inputContainer: {
    backgroundColor: '#333333',
    borderRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 4,
    minHeight: 129,
  },
  imagesScroll: {
    maxHeight: 150,
  },
  imagesScrollContent: {
    paddingRight: 8,
  },
  imageContainer: {
    position: 'relative',
    marginRight: 8,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  placeholderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  placeholderText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 10,
  },
  textInput: {
    fontSize: 16,
    color: colors.text,
    minHeight: 55,
    maxHeight: 172.5,
    paddingVertical: 8,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1,
    paddingTop: 4,
  },
  plusButton: {
    padding: 0,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPillExtended: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}20`,
    paddingVertical: 6,
    paddingRight: 24,
    paddingLeft: 8,
    borderRadius: 16,
    alignSelf: 'flex-start',
    maxWidth: '60%',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  locationPillExtendedWithX: {
    paddingRight: 8,
  },
  locationPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  locationPillText: {
    fontSize: 13,
    color: colors.primary,
    maxWidth: '90%',
    fontWeight: '600',
    flexShrink: 1,
  },
  iconSpacer: {
    flex: 1,
  },
  locationSpinner: {
    marginLeft: 4,
  },
  searchButtonContainer: {
    padding: 0,
  },
  searchButtonBorder: {
    width: 28,
    height: 28,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upArrowButtonContainer: {
    padding: 0,
  },
  upArrowButtonBorder: {
    width: 28,
    height: 28,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upArrowButtonDisabled: {
    opacity: 0.4,
  },
  drawerBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  },
  savingIndicator: {
    position: 'absolute',
    bottom: -50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  savingText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
});
