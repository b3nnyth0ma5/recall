
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
import { useRouter } from 'expo-router';
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
  useAnimatedKeyboard,
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
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; name: string } | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number; name: string } | null>(null);
  const textInputRef = useRef<TextInput>(null);
  
  // Keyboard handling
  const keyboard = useAnimatedKeyboard();
  const translateY = useSharedValue(0);

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Handle keyboard animation
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        translateY.value = withTiming(-e.endCoordinates.height, { duration: 250 });
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        translateY.value = withTiming(0, { duration: 250 });
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const animatedContainerStyle = useAnimatedStyle(() => {
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
    const handleLocationUpdate = (params: any) => {
      if (params.selectedLatitude && params.selectedLongitude && params.selectedLocationName) {
        setLocation({
          latitude: parseFloat(params.selectedLatitude),
          longitude: parseFloat(params.selectedLongitude),
          name: params.selectedLocationName,
        });
        setShowDrawer(false);
      }
    };

    // This would be called when returning from location-search
    // In a real implementation, you'd use a proper event listener or navigation params
    return () => {
      // Cleanup
    };
  }, []);

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
    <>
      {/* Search Text Display - Shows above the component when typing */}
      {text.trim().length > 0 && (
        <Animated.View 
          entering={FadeIn.duration(300)} 
          exiting={FadeOut.duration(300)}
          style={[styles.searchTextWrapper, animatedContainerStyle]}
        >
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

      {/* Main Floating Container */}
      <Animated.View style={[styles.floatingContainer, animatedContainerStyle]}>
        <BlurView intensity={80} tint="dark" style={styles.blurContainer}>
          <View style={styles.contentWrapper}>
            {/* Location Display - Now above images */}
            {location && (
              <View style={styles.locationChip}>
                <IconSymbol name="mappin.circle.fill" size={16} color={colors.primary} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {location.name}
                </Text>
                <Pressable onPress={handleRemoveLocation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <IconSymbol name="xmark.circle.fill" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
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

            {/* Ask Anything Text - Now above the input row */}
            <Text style={styles.askAnythingText}>Ask anything...</Text>

            {/* Text Input Row with increased height */}
            <View style={styles.inputRow}>
              <Pressable
                style={styles.plusButton}
                onPress={handlePlusPress}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <IconSymbol name="plus.circle.fill" size={32} color={colors.text} />
              </Pressable>

              <TextInput
                ref={textInputRef}
                style={styles.textInput}
                placeholder=""
                placeholderTextColor={colors.textTertiary}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={1000}
                textAlignVertical="top"
              />

              <Pressable
                style={styles.micButton}
                onPress={handleMicrophonePress}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <IconSymbol name="arrow.up.circle.fill" size={32} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </BlurView>
      </Animated.View>

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
    </>
  );
}

const styles = StyleSheet.create({
  searchTextWrapper: {
    position: 'absolute',
    bottom: 180,
    left: 16,
    right: 16,
    zIndex: 999,
  },
  searchTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
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
  floatingContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  blurContainer: {
    overflow: 'hidden',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomWidth: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  contentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: 'rgba(42, 42, 42, 0.85)',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  askAnythingText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
    paddingHorizontal: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 80,
  },
  plusButton: {
    paddingTop: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    minHeight: 80,
    maxHeight: 120,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  micButton: {
    paddingTop: 8,
  },
  submitButton: {
    paddingTop: 8,
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
    zIndex: 2000,
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
    backgroundColor: colors.card,
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
