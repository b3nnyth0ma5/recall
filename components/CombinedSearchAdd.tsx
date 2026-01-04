
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/utils/supabase';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import * as ImagePicker from 'expo-image-picker';
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
import * as Haptics from 'expo-haptics';

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
  originalUri?: string;
}

export function CombinedSearchAdd({ onCreateRecall, userId }: CombinedSearchAddProps) {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageState[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; name: string; primaryType?: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationStage, setCreationStage] = useState('');
  const [isDetectingIntent, setIsDetectingIntent] = useState(false);
  const [showIntentChoice, setShowIntentChoice] = useState(false);
  
  const textInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);
  const aiIconRotation = useSharedValue(0);
  const aiIconScale = useSharedValue(1);

  // Handle location selection from params
  useEffect(() => {
    if (params.selectedLatitude && params.selectedLongitude) {
      setLocation({
        latitude: parseFloat(params.selectedLatitude as string),
        longitude: parseFloat(params.selectedLongitude as string),
        name: params.selectedLocationName as string || 'Selected Location',
        primaryType: params.selectedPrimaryType as string,
      });
      
      // Clear the params
      router.setParams({
        selectedLatitude: undefined,
        selectedLongitude: undefined,
        selectedLocationName: undefined,
        selectedPrimaryType: undefined,
      });
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName, params.selectedPrimaryType, router]);

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Animation for AI icon when detecting intent
  useEffect(() => {
    if (isDetectingIntent) {
      aiIconRotation.value = withRepeat(
        withTiming(360, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      );
      aiIconScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );
    } else {
      aiIconRotation.value = withTiming(0, { duration: 300 });
      aiIconScale.value = withTiming(1, { duration: 300 });
    }
  }, [isDetectingIntent, aiIconRotation, aiIconScale]);

  const aiIconAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${aiIconRotation.value}deg` },
        { scale: aiIconScale.value },
      ],
    };
  });

  // Handle app state changes
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      getCurrentLocation();
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      
      // Only set location if user hasn't manually selected one
      if (!location) {
        setLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          name: 'Current Location',
        });
      }
    } catch (error) {
      console.error('Error getting current location:', error);
    }
  };

  const handleTextChange = (newText: string) => {
    setText(newText);
  };

  const handleCameraPress = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissKeyboard();

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImages([...images, { uri: result.assets[0].uri, isPlaceholder: false }]);
    }
  };

  const handleImagePick = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissKeyboard();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library permission is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newImages = result.assets.map(asset => ({
        uri: asset.uri,
        isPlaceholder: false,
      }));
      setImages([...images, ...newImages]);
    }
  };

  const handleLocationPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissKeyboard();
    router.push('/location-search');
  };

  const handleRemoveImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSearchPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismissKeyboard();
    
    if (text.trim()) {
      router.push({
        pathname: '/search',
        params: { q: text.trim(), autoSearch: 'true' }
      });
    } else {
      router.push('/search');
    }
  };

  // Comment out intent detector
  // const handleIntentDetection = async () => {
  //   if (!text.trim()) return;
  //   
  //   setIsDetectingIntent(true);
  //   try {
  //     const { data, error } = await supabase.functions.invoke('intent-detector', {
  //       body: { text: text.trim() }
  //     });
  //     
  //     if (error) throw error;
  //     
  //     if (data?.intent === 'search') {
  //       setShowIntentChoice(true);
  //     } else {
  //       await handleCreateRecall();
  //     }
  //   } catch (error) {
  //     console.error('Error detecting intent:', error);
  //     await handleCreateRecall();
  //   } finally {
  //     setIsDetectingIntent(false);
  //   }
  // };

  const handleIntentChoice = async (choice: 'create' | 'search') => {
    setShowIntentChoice(false);
    
    if (choice === 'search') {
      router.push({
        pathname: '/search',
        params: { q: text.trim(), autoSearch: 'true' }
      });
    } else {
      await handleCreateRecall();
    }
  };

  const handleCreateRecallDirect = async () => {
    if (isCreating || (!text.trim() && images.length === 0)) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await handleCreateRecall();
  };

  const handleCreateRecall = async () => {
    if (!text.trim() && images.length === 0) {
      Alert.alert('Empty Recall', 'Please add some text or images.');
      return;
    }

    setIsCreating(true);
    dismissKeyboard();

    try {
      const imageUris = images.map(img => img.uri);
      
      await onCreateRecall(
        {
          text: text.trim(),
          images: imageUris,
          location: location || undefined,
        },
        (stage: string) => {
          setCreationStage(stage);
        }
      );

      // Clear form
      setText('');
      setImages([]);
      setCreationStage('');
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error creating recall:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to create recall. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <Animated.View style={[styles.container, containerAnimatedStyle]}>
        {/* Images Preview */}
        {images.length > 0 && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.imagesPreview}
            contentContainerStyle={styles.imagesPreviewContent}
          >
            {images.map((image, index) => (
              <View key={index} style={styles.imagePreviewContainer}>
                <Image source={{ uri: image.uri }} style={styles.imagePreview} />
                {image.isPlaceholder && (
                  <View style={styles.imagePlaceholderOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
                <Pressable
                  style={styles.removeImageButton}
                  onPress={() => handleRemoveImage(index)}
                >
                  <IconSymbol 
                    ios_icon_name="xmark.circle.fill" 
                    android_material_icon_name="cancel" 
                    size={24} 
                    color="#FF3B30" 
                  />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Main Input Row */}
        <View style={styles.mainRow}>
          {/* Camera Icon - moved to left of location */}
          <Pressable style={styles.cameraButton} onPress={handleCameraPress}>
            <IconSymbol 
              ios_icon_name="camera.fill" 
              android_material_icon_name="camera" 
              size={24} 
              color={colors.primary} 
            />
          </Pressable>

          {/* Location Button */}
          <Pressable style={styles.locationButton} onPress={handleLocationPress}>
            <IconSymbol 
              ios_icon_name="location.fill" 
              android_material_icon_name="location-on" 
              size={20} 
              color={location ? colors.primary : colors.textTertiary} 
            />
            {location && (
              <Text style={styles.locationText} numberOfLines={1}>
                {location.name}
              </Text>
            )}
          </Pressable>

          {/* Text Input */}
          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            placeholder="Add a recall or search..."
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={1000}
          />

          {/* Right Side Actions */}
          <View style={styles.rightActions}>
            {/* Search Icon - above up arrow */}
            <Pressable
              style={styles.searchButton}
              onPress={handleSearchPress}
            >
              <IconSymbol 
                ios_icon_name="magnifyingglass" 
                android_material_icon_name="search" 
                size={24} 
                color={colors.primary} 
              />
            </Pressable>

            {/* Up Arrow Icon - triggers create recall directly */}
            <Pressable
              style={[styles.createButton, isCreating && styles.createButtonDisabled]}
              onPress={handleCreateRecallDirect}
              disabled={isCreating || (!text.trim() && images.length === 0)}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol 
                  ios_icon_name="arrow.up.circle.fill" 
                  android_material_icon_name="arrow-upward" 
                  size={32} 
                  color={(!text.trim() && images.length === 0) ? colors.textTertiary : colors.primary} 
                />
              )}
            </Pressable>
          </View>
        </View>

        {/* Creation Progress */}
        {isCreating && creationStage && (
          <Animated.View entering={FadeIn} style={styles.progressContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.progressText}>{creationStage}</Text>
          </Animated.View>
        )}

        {/* Intent Choice Modal */}
        {showIntentChoice && (
          <Animated.View entering={FadeIn} style={styles.intentChoiceOverlay}>
            <View style={styles.intentChoiceModal}>
              <Text style={styles.intentChoiceTitle}>What would you like to do?</Text>
              <Pressable
                style={styles.intentChoiceButton}
                onPress={() => handleIntentChoice('search')}
              >
                <IconSymbol 
                  ios_icon_name="magnifyingglass" 
                  android_material_icon_name="search" 
                  size={24} 
                  color={colors.primary} 
                />
                <Text style={styles.intentChoiceButtonText}>Search</Text>
              </Pressable>
              <Pressable
                style={styles.intentChoiceButton}
                onPress={() => handleIntentChoice('create')}
              >
                <IconSymbol 
                  ios_icon_name="plus.circle.fill" 
                  android_material_icon_name="add-circle" 
                  size={24} 
                  color={colors.primary} 
                />
                <Text style={styles.intentChoiceButtonText}>Create Recall</Text>
              </Pressable>
              <Pressable
                style={styles.intentChoiceCancelButton}
                onPress={() => setShowIntentChoice(false)}
              >
                <Text style={styles.intentChoiceCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
  },
  imagesPreview: {
    maxHeight: 100,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  imagesPreviewContent: {
    padding: 8,
    gap: 8,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginRight: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.secondaryBackground,
  },
  imagePlaceholderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  cameraButton: {
    padding: 8,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: 150,
  },
  locationText: {
    marginLeft: 4,
    fontSize: 12,
    color: colors.text,
    flex: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    maxHeight: 100,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rightActions: {
    alignItems: 'center',
    gap: 8,
  },
  searchButton: {
    padding: 4,
  },
  createButton: {
    padding: 4,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  intentChoiceOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  intentChoiceModal: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  intentChoiceTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  intentChoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryBackground,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
  },
  intentChoiceButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  intentChoiceCancelButton: {
    padding: 12,
    alignItems: 'center',
  },
  intentChoiceCancelText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
