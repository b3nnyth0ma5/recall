
import React, { useState, useRef, useEffect } from 'react';
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
import { SymbolView } from 'expo-symbols';

interface CombinedSearchAddProps {
  onCreateRecall: (data: {
    text: string;
    images: string[];
    location?: { latitude: number; longitude: number; name: string; primaryType?: string };
  }, onProgress?: (stage: string) => void) => Promise<void>;
  userId: string;
}

interface ImageState {
  uri: string;
  isPlaceholder: boolean;
  originalUri?: string; // Store original URI for placeholder replacement
}

export function CombinedSearchAdd({ onCreateRecall, userId }: CombinedSearchAddProps) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageState[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; name: string; primaryType?: string } | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [savingStage, setSavingStage] = useState<string>('');
  const [isDetectingIntent, setIsDetectingIntent] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; name: string; primaryType?: string } | null>(null);
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);
  const lastLocationFetchRef = useRef<number>(0);
  const locationRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // FIXED: Track if we've already processed these params to prevent infinite loops
  const processedParamsRef = useRef<string>('');

  // Animation values for AI icon
  const aiIconRotation = useSharedValue(0);
  const aiIconScale = useSharedValue(1);

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Handle app state changes for location refresh
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, []);

  // Set up periodic location refresh (every 5 minutes of inactivity)
  useEffect(() => {
    // Clear any existing interval
    if (locationRefreshIntervalRef.current) {
      clearInterval(locationRefreshIntervalRef.current);
    }

    // Set up new interval to check if location needs refresh
    locationRefreshIntervalRef.current = setInterval(() => {
      const timeSinceLastFetch = Date.now() - lastLocationFetchRef.current;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (timeSinceLastFetch > fiveMinutes) {
        console.log('[CombinedSearchAdd] Auto-refreshing location after 5 minutes of inactivity');
        getCurrentLocation();
      }
    }, 60000); // Check every minute

    return () => {
      if (locationRefreshIntervalRef.current) {
        clearInterval(locationRefreshIntervalRef.current);
      }
    };
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      console.log('[CombinedSearchAdd] App became active - refreshing location');
      getCurrentLocation();
    }
  };

  // Handle keyboard show/hide
  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
        translateY.value = withTiming(-(e.endCoordinates.height + 10), { duration: 250 });
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

  // AI Icon animation styles
  const aiIconAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${aiIconRotation.value}deg` },
        { scale: aiIconScale.value },
      ],
    };
  });

  // Start AI icon animation when detecting intent
  useEffect(() => {
    if (isDetectingIntent) {
      // Continuous rotation
      aiIconRotation.value = withRepeat(
        withTiming(360, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      );
      // Pulsing scale
      aiIconScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      // Reset animations
      aiIconRotation.value = withTiming(0, { duration: 300 });
      aiIconScale.value = withTiming(1, { duration: 300 });
    }
  }, [isDetectingIntent]);

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

      // Use Google Places API for accurate reverse geocoding
      const { reverseGeocodeGoogle } = await import('@/utils/googlePlaces');
      const locationName = await reverseGeocodeGoogle(latitude, longitude);

      console.log('[CombinedSearchAdd] Resolved location name:', locationName);

      const locationData = {
        latitude,
        longitude,
        name: locationName,
        primaryType: undefined, // Will be set when user selects a specific location
      };

      setCurrentLocation(locationData);
      setLocation(locationData); // Set as default location
      lastLocationFetchRef.current = Date.now();
      
      console.log('[CombinedSearchAdd] Current location obtained:', locationData);
    } catch (error) {
      console.error('[CombinedSearchAdd] Error getting current location:', error);
    } finally {
      setIsRefreshingLocation(false);
    }
  };

  // FIXED: Listen for location selection from location-search screen with proper deduplication
  useEffect(() => {
    if (params.selectedLatitude && params.selectedLongitude && params.selectedLocationName) {
      // Create a unique key for these params
      const paramsKey = `${params.selectedLatitude}-${params.selectedLongitude}-${params.selectedLocationName}`;
      
      // Check if we've already processed these exact params
      if (processedParamsRef.current === paramsKey) {
        console.log('[CombinedSearchAdd] Already processed these params, skipping');
        return;
      }
      
      // Mark these params as processed
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
      
      // FIXED: Clear the params after processing - use setTimeout to break call stack
      // This prevents the infinite loop by ensuring the param clearing happens
      // in a separate event loop tick
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
          
          // Reset the processed params ref after a delay to allow for new selections
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
    
    // Dismiss keyboard first before navigation
    console.log('[CombinedSearchAdd] Dismissing keyboard');
    Keyboard.dismiss();
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // FIXED: Navigate to search screen WITHOUT showing zero state by default
    // If there's no search query, navigate to search screen to show history (not zero state)
    if (!searchQuery) {
      console.log('[CombinedSearchAdd] Empty search query - navigating to search screen to show history');
      
      // Use setTimeout to break the call stack and prevent recursion
      setTimeout(() => {
        try {
          // Navigate without any query parameter - search screen will show history, not zero state
          router.push('/search');
        } catch (error) {
          console.error('[CombinedSearchAdd] Error navigating to search:', error);
        }
      }, 0);
      return;
    }

    console.log('[CombinedSearchAdd] Search icon pressed with query:', searchQuery);

    // Navigate to search screen with the query text
    // The search screen will handle executing the search
    const encodedQuery = encodeURIComponent(searchQuery);
    const searchRoute = `/search?q=${encodedQuery}&autoSearch=true`;
    
    console.log('[CombinedSearchAdd] Navigating to search screen:', searchRoute);
    
    // Use setTimeout to break the call stack and prevent recursion
    setTimeout(() => {
      try {
        router.push(searchRoute);
      } catch (error) {
        console.error('[CombinedSearchAdd] Error navigating to search:', error);
      }
    }, 0);

    // Clear the text input after navigation
    setText('');

    // Save search history asynchronously (don't wait for it)
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
        
        // Create placeholder images immediately
        const placeholderImages: ImageState[] = result.assets.map(asset => ({
          uri: asset.uri, // Use original URI as placeholder initially
          isPlaceholder: true,
          originalUri: asset.uri,
        }));
        
        // Add placeholders to state immediately - user returns to component
        setImages(prev => [...prev, ...placeholderImages]);
        setShowDrawer(false);
        
        // Start optimizing images in the background
        console.log('[CombinedSearchAdd] Starting image optimization...');
        const { compressImagesForUpload } = await import('@/utils/imageOptimization');
        const originalUris = result.assets.map(asset => asset.uri);
        
        // Optimize images one by one and replace placeholders as they complete
        await compressImagesForUpload(originalUris, (optimizedUri: string, index: number) => {
          console.log(`[CombinedSearchAdd] Image ${index + 1}/${originalUris.length} optimized`);
          
          // Replace placeholder with optimized image
          setImages(prev => {
            const newImages = [...prev];
            // Find the placeholder with matching original URI
            const placeholderIndex = newImages.findIndex(
              img => img.isPlaceholder && img.originalUri === originalUris[index]
            );
            
            if (placeholderIndex !== -1) {
              newImages[placeholderIndex] = {
                uri: optimizedUri,
                isPlaceholder: false,
              };
            }
            
            return newImages;
          });
        });
        
        console.log('[CombinedSearchAdd] All images optimized successfully');
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
        
        // Create placeholder image immediately
        const placeholderImage: ImageState = {
          uri: result.assets[0].uri,
          isPlaceholder: true,
          originalUri: result.assets[0].uri,
        };
        
        // Add placeholder to state immediately - user returns to component
        setImages(prev => [...prev, placeholderImage]);
        setShowDrawer(false);
        
        // Optimize image in the background
        console.log('[CombinedSearchAdd] Compressing camera photo...');
        const { compressImageForUpload } = await import('@/utils/imageOptimization');
        const compressedUri = await compressImageForUpload(result.assets[0].uri);
        console.log('[CombinedSearchAdd] Camera photo compressed successfully');
        
        // Replace placeholder with optimized image
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
    
    // Use setTimeout to break the call stack and prevent recursion
    setTimeout(() => {
      try {
        router.push('/location-search');
      } catch (error) {
        console.error('[CombinedSearchAdd] Error navigating to location search:', error);
      }
    }, 0);
  };

  const handleIntentChoice = (choice: 'create' | 'search') => {
    if (choice === 'create') {
      handleCreateRecallDirect();
    } else {
      handleSearchPress();
    }
  };

  const handleCreateRecallDirect = async () => {
    if (!text.trim() && images.length === 0) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    // IMMEDIATELY dismiss keyboard and blur input when user presses submit
    console.log('[CombinedSearchAdd] Dismissing keyboard immediately on recall creation');
    Keyboard.dismiss();
    if (textInputRef.current) {
      textInputRef.current.blur();
    }

    try {
      setIsCreating(true);
      
      // Use manually selected location if available, otherwise use current location
      const locationToSave = location || currentLocation;
      
      // Extract URIs from image states
      const imageUris = images.map(img => img.uri);
      
      await onCreateRecall(
        {
          text: text.trim(),
          images: imageUris,
          location: locationToSave || undefined,
        },
        (stage: string) => {
          setSavingStage(stage);
        }
      );

      // Reset form
      setText('');
      setImages([]);
      // Reset location to current location after creating recall
      setLocation(currentLocation);
      setSavingStage('');
    } catch (error) {
      console.error('Error creating recall:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsCreating(false);
      setSavingStage('');
    }
  };

  const handleCreateRecall = async () => {
    if (!text.trim() && images.length === 0) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    // If images are attached, skip intent detection and create recall directly
    if (images.length > 0) {
      console.log('[CombinedSearchAdd] Images attached - skipping intent detection');
      await handleCreateRecallDirect();
      return;
    }

    // Run intent detector
    try {
      setIsDetectingIntent(true);
      console.log('[CombinedSearchAdd] Running intent detector...');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No active session');
        Alert.alert('Error', 'Please log in to continue');
        return;
      }

      const { data: intentData, error: intentError } = await supabase.functions.invoke('intent-detector', {
        body: { text: text.trim() },
      });

      if (intentError) {
        console.error('Error detecting intent:', intentError);
        // Fallback to create recall on error
        await handleCreateRecallDirect();
        return;
      }

      console.log('[CombinedSearchAdd] Intent detected:', intentData);

      const { intent, confidence } = intentData;

      if (intent === 'create') {
        console.log('[CombinedSearchAdd] Intent: CREATE recall');
        await handleCreateRecallDirect();
      } else if (intent === 'search') {
        console.log('[CombinedSearchAdd] Intent: SEARCH');
        await handleSearchPress();
      } else {
        // Unknown intent - present choice to user
        console.log('[CombinedSearchAdd] Intent: UNKNOWN - presenting choice');
        Alert.alert(
          'What would you like to do?',
          'Would you like to create a recall or search for existing recalls?',
          [
            {
              text: 'Create Recall',
              onPress: () => handleIntentChoice('create'),
            },
            {
              text: 'Search',
              onPress: () => handleIntentChoice('search'),
            },
            {
              text: 'Cancel',
              style: 'cancel',
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error in intent detection:', error);
      // Fallback to create recall on error
      await handleCreateRecallDirect();
    } finally {
      setIsDetectingIntent(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  // Check if all images are optimized (no placeholders remaining)
  const allImagesOptimized = images.length === 0 || images.every(img => !img.isPlaceholder);
  
  // Disable sparkle icon if:
  // 1. No content (text or images)
  // 2. Any images are still placeholders (not yet optimized)
  const isSparkleDisabled = (!text.trim() && images.length === 0) || !allImagesOptimized;

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <Animated.View style={[styles.outerContainer, animatedStyle]}>
        {/* Floating Action Icons - Image and Camera above the component, aligned with plus button on the right */}
        {showDrawer && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.floatingActionsContainer}
          >
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

        {/* Main Input Container - Single border only */}
        <View style={styles.containerWrapper}>
          <View style={styles.container}>
            <View style={styles.inputContainer}>
              {/* Images Display - Horizontal Scrollable */}
              {images.length > 0 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false} 
                  style={styles.imagesScroll}
                  contentContainerStyle={styles.imagesScrollContent}
                  decelerationRate="fast"
                  snapToInterval={88}
                  snapToAlignment="start"
                  scrollEnabled={true}
                  nestedScrollEnabled={true}
                  removeClippedSubviews={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {images.map((imageState, index) => (
                    <View key={index} style={styles.imageContainer}>
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
                </ScrollView>
              )}

              {/* Text Input - Now above the button row, multiline enabled with newline support */}
              <TextInput
                ref={textInputRef}
                style={styles.textInput}
                placeholder="Add a Recall or Search..."
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={handleTextChange}
                multiline
                maxLength={1000}
                returnKeyType="default"
                blurOnSubmit={false}
                enablesReturnKeyAutomatically={false}
              />

              {/* Button Row - Icons moved to the right */}
              <View style={styles.inputRow}>
                {/* Location Pill - Dynamic width to fit text */}
                <Pressable
                  style={styles.locationPillExtended}
                  onPress={handleLocationPress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol name="mappin.circle.fill" size={16} color={colors.primary} />
                  {isRefreshingLocation ? (
                    <ActivityIndicator size="small" color={colors.primary} style={styles.locationSpinner} />
                  ) : (
                    <Text style={styles.locationPillText} numberOfLines={1}>
                      {location?.name || currentLocation?.name || 'Add Location'}
                    </Text>
                  )}
                </Pressable>
								
                {/* Spacer to push icons to the right */}
                <View style={styles.iconSpacer} />

                {/* Submit Button - Shows AI animation when detecting intent, disabled when images are being optimized */}
                <Pressable
                  style={[styles.submitButton, isSparkleDisabled && styles.submitButtonDisabled]}
                  onPress={handleCreateRecall}
                  disabled={isSparkleDisabled || isCreating || isDetectingIntent}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {isDetectingIntent ? (
                    Platform.OS === 'ios' ? (
                      <Animated.View style={aiIconAnimatedStyle}>
                        <SymbolView
                          name="sparkles"
                          size={28}
                          tintColor={colors.primary}
                          type="hierarchical"
                          animationSpec={{
                            effect: {
                              type: 'pulse',
                            },
                            repeating: true,
                          }}
                        />
                      </Animated.View>
                    ) : (
                      <Animated.View style={aiIconAnimatedStyle}>
                        <IconSymbol name="auto.awesome" size={28} color={colors.primary} />
                      </Animated.View>
                    )
                  ) : (
                    Platform.OS === 'ios' ? (
                      <SymbolView
                        name="sparkles"
                        size={28}
                        tintColor={colors.primary}
                        type="hierarchical"
                      />
                    ) : (
                      <IconSymbol name="auto.awesome" size={28} color={colors.primary} />
                    )
                  )}
                </Pressable>

								{/* Plus Button */}
                <Pressable
                  style={styles.plusButton}
                  onPress={handlePlusPress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol name="plus.circle.fill" size={28} color={colors.text} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Backdrop for drawer */}
        {showDrawer && (
          <Pressable 
            style={styles.drawerBackdrop} 
            onPress={() => setShowDrawer(false)} 
          />
        )}

        {/* Saving Stage Indicator */}
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
  floatingActionsContainer: {
    position: 'absolute',
    bottom: 109.25, // Increased by 15% from 95 (95 * 1.15 = 109.25)
    right: 16, // Aligned with plus button on the right
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
    paddingBottom: 12, // Fixed padding to ensure consistent spacing
    gap: 4,
    minHeight: 103.5, // Increased by 15% from 90 (90 * 1.15 = 103.5)
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
    minHeight: 43.7, // Increased by 15% from 38 (38 * 1.15 = 43.7)
    maxHeight: 172.5, // Increased by 15% from 150 (150 * 1.15 = 172.5)
    paddingVertical: 8,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1,
    paddingTop: 4, // Consistent top padding
  },
  locationPillExtended: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: `${colors.primary}20`,
    paddingVertical: 6,
    paddingRight: 8,
    paddingLeft: 8,
    borderRadius: 16,
    alignSelf: 'flex-start', // Dynamic width based on content
    maxWidth: '70%',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  locationPillText: {
    fontSize: 13,
    color: colors.primary,
    maxWidth: '90%',
    fontWeight: '600',
  },
  iconSpacer: {
    flex: 1, // Pushes icons to the right
  },
  locationSpinner: {
    marginLeft: 4,
  },
  plusButton: {
    padding: 0,
  },
  submitButton: {
    padding: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
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
