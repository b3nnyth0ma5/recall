
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
} from 'react-native-reanimated';
import { supabase } from '@/utils/supabase';

interface CombinedSearchAddProps {
  onCreateRecall: (data: {
    text: string;
    images: string[];
    location?: { latitude: number; longitude: number; name: string };
  }) => Promise<void>;
  userId: string;
}

export function CombinedSearchAdd({ onCreateRecall, userId }: CombinedSearchAddProps) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; name: string } | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; name: string } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);
  
  // FIXED: Track if we've already processed these params to prevent infinite loops
  const processedParamsRef = useRef<string>('');

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

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

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentPosition.coords;

      // Reverse geocode to get location name
      const { reverseGeocode } = await import('@/utils/supabase');
      const locationName = await reverseGeocode(latitude, longitude);

      const locationData = {
        latitude,
        longitude,
        name: locationName,
      };

      setCurrentLocation(locationData);
      setLocation(locationData); // Set as default location
      console.log('Current location obtained:', locationData);
    } catch (error) {
      console.error('Error getting current location:', error);
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
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName, router]);

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

    // If there's no search query, just navigate to search screen to show history
    if (!searchQuery) {
      console.log('[CombinedSearchAdd] Empty search query - navigating to search screen to show history');
      
      // FIXED: Use setTimeout to break the call stack and prevent recursion
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

    // Navigate to search screen with the query text
    // The search screen will handle executing the search
    const encodedQuery = encodeURIComponent(searchQuery);
    const searchRoute = `/search?q=${encodedQuery}&autoSearch=true`;
    
    console.log('[CombinedSearchAdd] Navigating to search screen:', searchRoute);
    
    // FIXED: Use setTimeout to break the call stack and prevent recursion
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
        const newImages = result.assets.map(asset => asset.uri);
        setImages(prev => [...prev, ...newImages]);
        setShowDrawer(false);
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
        setImages(prev => [...prev, result.assets[0].uri]);
        setShowDrawer(false);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleLocationPress = () => {
    setShowDrawer(false);
    
    // FIXED: Use setTimeout to break the call stack and prevent recursion
    setTimeout(() => {
      try {
        router.push('/location-search');
      } catch (error) {
        console.error('[CombinedSearchAdd] Error navigating to location search:', error);
      }
    }, 0);
  };

  const handleCreateRecall = async () => {
    if (!text.trim() && images.length === 0) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    try {
      setIsCreating(true);
      
      // Use manually selected location if available, otherwise use current location
      const locationToSave = location || currentLocation;
      
      await onCreateRecall({
        text: text.trim(),
        images,
        location: locationToSave || undefined,
      });

      // Reset form
      setText('');
      setImages([]);
      // Reset location to current location after creating recall
      setLocation(currentLocation);
      
      // Dismiss keyboard after creating recall
      console.log('[CombinedSearchAdd] Dismissing keyboard after recall creation');
      Keyboard.dismiss();
      
      // Blur the text input to ensure keyboard is dismissed
      if (textInputRef.current) {
        textInputRef.current.blur();
      }
    } catch (error) {
      console.error('Error creating recall:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <Animated.View style={[styles.outerContainer, animatedStyle]}>
        {/* Floating Action Icons - Image and Camera above the component */}
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
                  {images.map((uri, index) => (
                    <View key={index} style={styles.imageContainer}>
                      <Image source={{ uri }} style={styles.image} />
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

              {/* Button Row */}
              <View style={styles.inputRow}>
                <Pressable
                  style={styles.plusButton}
                  onPress={handlePlusPress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol name="plus.circle.fill" size={32} color={colors.text} />
                </Pressable>

                {/* Location Pill - Always visible between + and create icons */}
                <Pressable
                  style={styles.locationPill}
                  onPress={handleLocationPress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol name="mappin.circle.fill" size={16} color={colors.primary} />
                  <Text style={styles.locationPillText} numberOfLines={1}>
                    {location?.name || currentLocation?.name || 'Add Location'}
                  </Text>
                </Pressable>

                {/* Search Icon - Top Right within component */}
                <Pressable
                  style={styles.searchButton}
                  onPress={handleSearchPress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol
                    name="magnifyingglass"
                    size={28}
                    color={colors.text}
                  />
                </Pressable>

                {/* Create Recall Button - Top Right */}
                <Pressable
                  style={[styles.submitButton, (!text.trim() && images.length === 0) && styles.submitButtonDisabled]}
                  onPress={handleCreateRecall}
                  disabled={(!text.trim() && images.length === 0) || isCreating}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol name="arrow.up.circle.fill" size={32} color={colors.primary} />
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
    bottom: 95,
    right: 24,
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
    paddingBottom: 4,
    gap: 4,
    minHeight: 77, // Increased by 10% from 70
  },
  imagesScroll: {
    maxHeight: 100,
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
    minHeight: 38,
    maxHeight: 100,
    paddingVertical: 8,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1,
  },
  plusButton: {
    padding: 4,
    paddingLeft: 8, // leftPadding: 8
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    flex: 1,
    maxWidth: 160,
  },
  locationPillText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  searchButton: {
    padding: 4,
  },
  submitButton: {
    padding: 4,
    paddingRight: 8, // rightPadding: 8
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
});
