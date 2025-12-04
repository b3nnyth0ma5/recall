
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
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import Animated, { 
  FadeIn, 
  FadeOut, 
  SlideInDown, 
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

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
  const [isRecording, setIsRecording] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; name: string } | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const textInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);

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
        translateY.value = withTiming(-e.endCoordinates.height, { duration: 250 });
      }
    );

    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        translateY.value = withTiming(0, { duration: 250 });
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

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
      console.log('Current location obtained:', locationData);
    } catch (error) {
      console.error('Error getting current location:', error);
    }
  };

  // Listen for location selection from location-search screen
  useEffect(() => {
    if (params.selectedLatitude && params.selectedLongitude && params.selectedLocationName) {
      const selectedLocation = {
        latitude: parseFloat(params.selectedLatitude as string),
        longitude: parseFloat(params.selectedLongitude as string),
        name: params.selectedLocationName as string,
      };
      
      console.log('Location selected from location-search:', selectedLocation);
      setLocation(selectedLocation);
      setShowDrawer(false);
      
      // Clear the params after processing
      router.setParams({
        selectedLatitude: undefined,
        selectedLongitude: undefined,
        selectedLocationName: undefined,
        selectedDisplayName: undefined,
        selectedFullAddress: undefined,
        selectedPrimaryType: undefined,
      });
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName]);

  const handlePlusPress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setShowDrawer(true);
  };

  const handleSearchPress = () => {
    if (text.trim()) {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      router.push(`/search?query=${encodeURIComponent(text.trim())}`);
    }
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
    router.push('/location-search');
  };

  const handleMicrophonePress = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not Supported', 'Speech-to-text is not supported on web');
      return;
    }

    // Note: React Native doesn't have built-in speech-to-text
    // You would need to use a library like @react-native-voice/voice
    // or expo-speech (for text-to-speech, not speech-to-text)
    Alert.alert(
      'Speech-to-Text',
      'Speech-to-text functionality requires additional setup. Please type your text for now.'
    );
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
      setLocation(null);
      Keyboard.dismiss();
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

  const handleRemoveLocation = () => {
    setLocation(null);
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <Animated.View style={[styles.outerContainer, animatedStyle]}>
        {/* Search Text Display - Shows above the component when typing */}
        {text.trim().length > 0 && (
          <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)}>
            <Pressable
              style={styles.searchTextContainer}
              onPress={handleSearchPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.searchTextContent}>
                <IconSymbol name="magnifyingglass" size={18} color={colors.primary} />
                <Text style={styles.searchText} numberOfLines={1}>
                  {text.trim()}
                </Text>
              </View>
              <IconSymbol name="arrow.right.circle.fill" size={24} color={colors.primary} />
            </Pressable>
          </Animated.View>
        )}

        {/* Main Input Container with Blur Border */}
        <View style={styles.containerWrapper}>
          <View style={styles.borderBlur}>
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
          </View>
          <View style={styles.container}>
            <View style={styles.inputContainer}>
              {/* Location Display - Above Images */}
              {location && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.locationChip}>
                  <IconSymbol name="mappin.circle.fill" size={16} color={colors.primary} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {location.name}
                  </Text>
                  <Pressable onPress={handleRemoveLocation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <IconSymbol name="xmark.circle.fill" size={16} color={colors.textSecondary} />
                  </Pressable>
                </Animated.View>
              )}

              {/* Images Display */}
              {images.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesScroll}>
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

              {/* Text Input - Now above the button row */}
              <TextInput
                ref={textInputRef}
                style={styles.textInput}
                placeholder="Recall or search..."
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={1000}
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

                <View style={styles.spacer} />

                <Pressable
                  style={styles.micButton}
                  onPress={handleMicrophonePress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol
                    name={isRecording ? "waveform" : "mic.fill"}
                    size={24}
                    color={colors.text}
                  />
                </Pressable>

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

        {/* Slide-up Drawer */}
        {showDrawer && (
          <Animated.View
            entering={SlideInDown.duration(300)}
            exiting={SlideOutDown.duration(300)}
            style={styles.drawerOverlay}
          >
            <Pressable style={styles.drawerBackdrop} onPress={() => setShowDrawer(false)} />
            <View style={styles.drawer}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>Sources</Text>

              <View style={styles.drawerOptions}>
                <Pressable
                  style={styles.drawerOption}
                  onPress={handleImagePick}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.drawerOptionIcon}>
                    <IconSymbol name="photo.fill" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.drawerOptionText}>Image</Text>
                </Pressable>

                <Pressable
                  style={styles.drawerOption}
                  onPress={handleCameraPress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.drawerOptionIcon}>
                    <IconSymbol name="camera.fill" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.drawerOptionText}>Camera</Text>
                </Pressable>

                <Pressable
                  style={styles.drawerOption}
                  onPress={handleLocationPress}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.drawerOptionIcon}>
                    <IconSymbol name="mappin.circle.fill" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.drawerOptionText}>Location</Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.drawerCloseButton}
                onPress={() => setShowDrawer(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol name="xmark.circle.fill" size={28} color={colors.textSecondary} />
              </Pressable>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  containerWrapper: {
    position: 'relative',
    marginHorizontal: 16, // Match SearchBar's paddingHorizontal (16 * 1.15 ≈ 18, but using 16 for consistency)
  },
  borderBlur: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  container: {
    backgroundColor: colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  searchTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#323232', // Lighter than colors.card (#2A2A2A)
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 8, // Reduced from 10 by 20% (10 * 0.8 = 8)
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  searchTextContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  searchText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
  },
  inputContainer: {
    backgroundColor: '#323232', // Lighter than colors.card (#2A2A2A)
    borderRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 4, 
    gap: 6,
    minHeight: 108, // Reduced from 120 by 10% (120 * 0.9 = 108)
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  locationText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    maxWidth: 200,
  },
  imagesScroll: {
    maxHeight: 100,
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
    minHeight: 44,
    maxHeight: 100,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  plusButton: {
    padding: 4,
  },
  spacer: {
    flex: 1,
  },
  micButton: {
    padding: 4,
  },
  submitButton: {
    padding: 8,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  drawerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#323232', // Lighter than colors.card (#2A2A2A)
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
  },
  drawerOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  drawerOption: {
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  drawerOptionIcon: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerOptionText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  drawerCloseButton: {
    position: 'absolute',
    top: 24,
    right: 24,
  },
});
