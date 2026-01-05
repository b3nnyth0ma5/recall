
import LocationSearchScreen from '@/app/location-search';
import { colors } from '@/styles/commonStyles';
import { useRouter } from 'expo-router';
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
  withSpring,
} from 'react-native-reanimated';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { SymbolView } from 'expo-symbols';
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
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

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
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageState[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; name: string; primaryType?: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDetectingIntent, setIsDetectingIntent] = useState(false);
  const [showIntentModal, setShowIntentModal] = useState(false);
  const [isCreatingRecall, setIsCreatingRecall] = useState(false);
  const [creationStage, setCreationStage] = useState('');
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const translateY = useSharedValue(0);
  const router = useRouter();
  const aiIconRotation = useSharedValue(0);
  const aiIconScale = useSharedValue(1);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const handleAppStateChange = useCallback((nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to the foreground
    }
    appState.current = nextAppState;
  }, []);

  useEffect(() => {
    if (isDetectingIntent) {
      aiIconRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
      aiIconScale.value = withRepeat(
        withSequence(
          withTiming(1.1, { duration: 500 }),
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

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const aiIconAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: `${aiIconRotation.value}deg` },
        { scale: aiIconScale.value },
      ],
    };
  });

  useEffect(() => {
    translateY.value = withSpring(isExpanded ? -10 : 0, {
      damping: 15,
      stiffness: 150,
    });
  }, [isExpanded, translateY]);

  const handleTextChange = (newText: string) => {
    setText(newText);
    if (newText.length > 0 && !isExpanded) {
      setIsExpanded(true);
    } else if (newText.length === 0 && images.length === 0 && !location) {
      setIsExpanded(false);
    }
  };

  const handlePlusPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Add Content',
      'Choose an option',
      [
        { text: 'Take Photo', onPress: handleCameraPress },
        { text: 'Choose from Library', onPress: handleImagePick },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  const handleImagePick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library access');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 10,
    });

    if (!result.canceled && result.assets) {
      const newImages = result.assets.map(asset => ({
        uri: asset.uri,
        isPlaceholder: false,
      }));
      setImages(prev => [...prev, ...newImages]);
      setIsExpanded(true);
    }
  };

  const handleCameraPress = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera access');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      setImages(prev => [...prev, { uri: result.assets[0].uri, isPlaceholder: false }]);
      setIsExpanded(true);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    if (images.length === 1 && text.length === 0 && !location) {
      setIsExpanded(false);
    }
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
    setLocation({
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
      name: selectedLocation.name,
      primaryType: selectedLocation.primaryType,
    });
    setShowLocationSearch(false);
    setIsExpanded(true);
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return null;
      }

      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  };

  const handleIntentChoice = async (choice: 'create' | 'search') => {
    setShowIntentModal(false);
    setIsDetectingIntent(false);

    if (choice === 'search') {
      router.push({
        pathname: '/search',
        params: { q: text, autoSearch: 'true' },
      });
      setText('');
      setImages([]);
      setLocation(null);
      setIsExpanded(false);
    } else {
      await handleCreateRecallDirect();
    }
  };

  const handleCreateRecallDirect = async () => {
    if (!text.trim() && images.length === 0) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCreatingRecall(true);

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

      setText('');
      setImages([]);
      setLocation(null);
      setIsExpanded(false);
      setCreationStage('');
    } catch (error) {
      console.error('Error creating recall:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsCreatingRecall(false);
    }
  };

  const handleCreateRecall = async () => {
    // Comment out intent detection
    // setIsDetectingIntent(true);
    // ... intent detection logic ...
    
    // Directly create recall
    await handleCreateRecallDirect();
  };

  const handleSearchPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (text.trim()) {
      router.push({
        pathname: '/search',
        params: { q: text.trim(), autoSearch: 'true' },
      });
    } else {
      router.push('/search');
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <>
      <TouchableWithoutFeedback onPress={dismissKeyboard}>
        <Animated.View style={[styles.container, animatedStyle]}>
          <View style={styles.mainRow}>
            <Pressable
              onPress={handlePlusPress}
              style={styles.plusButton}
            >
              <IconSymbol name="plus.circle.fill" size={36} color={colors.primary} />
            </Pressable>

            <View style={styles.inputContainer}>
              <TextInput
                ref={textInputRef}
                style={styles.input}
                placeholder="What's on your mind?"
                placeholderTextColor={colors.textSecondary}
                value={text}
                onChangeText={handleTextChange}
                multiline
                maxLength={5000}
              />

              {isExpanded && (
                <Animated.View entering={FadeIn.duration(200)} style={styles.expandedContent}>
                  {images.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
                      {images.map((image, index) => (
                        <View key={index} style={styles.imageContainer}>
                          <Image source={{ uri: image.uri }} style={styles.image} />
                          <Pressable
                            onPress={() => handleRemoveImage(index)}
                            style={styles.removeImageButton}
                          >
                            <IconSymbol name="xmark.circle.fill" size={24} color={colors.error} />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  )}

                  <View style={styles.metadataRow}>
                    <Pressable onPress={handleLocationPress} style={styles.locationButton}>
                      <IconSymbol
                        name={location ? "mappin.circle.fill" : "mappin.circle"}
                        size={24}
                        color={location ? colors.primary : colors.textSecondary}
                      />
                      {location && (
                        <Text style={styles.locationText} numberOfLines={1}>
                          {location.name}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </Animated.View>
              )}
            </View>

            <View style={styles.rightIconsContainer}>
              <Pressable
                onPress={handleCreateRecall}
                style={[styles.iconButton, styles.topIcon]}
                disabled={isCreatingRecall}
              >
                {isCreatingRecall ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Animated.View style={aiIconAnimatedStyle}>
                    <IconSymbol name="arrow.up.circle.fill" size={28} color={colors.primary} />
                  </Animated.View>
                )}
              </Pressable>

              <Pressable
                onPress={handleSearchPress}
                style={[styles.iconButton, styles.bottomIcon]}
              >
                <IconSymbol name="magnifyingglass.circle.fill" size={28} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {isCreatingRecall && creationStage && (
            <Animated.View entering={FadeIn} style={styles.progressContainer}>
              <Text style={styles.progressText}>{creationStage}</Text>
            </Animated.View>
          )}
        </Animated.View>
      </TouchableWithoutFeedback>

      <Modal
        visible={showIntentModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowIntentModal(false);
          setIsDetectingIntent(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowIntentModal(false);
            setIsDetectingIntent(false);
          }}
        >
          <Animated.View entering={SlideInDown.duration(300)} style={styles.intentModal}>
            <Text style={styles.intentTitle}>What would you like to do?</Text>
            <Pressable
              style={styles.intentButton}
              onPress={() => handleIntentChoice('create')}
            >
              <IconSymbol name="plus.circle.fill" size={24} color={colors.primary} />
              <Text style={styles.intentButtonText}>Create Recall</Text>
            </Pressable>
            <Pressable
              style={styles.intentButton}
              onPress={() => handleIntentChoice('search')}
            >
              <IconSymbol name="magnifyingglass" size={24} color={colors.primary} />
              <Text style={styles.intentButtonText}>Search Recalls</Text>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal
        visible={showLocationSearch}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLocationSearch(false)}
      >
        <LocationSearchScreen
          onLocationSelected={handleLocationSelected}
          onClose={() => setShowLocationSearch(false)}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  plusButton: {
    marginRight: 8,
    marginTop: 4,
  },
  inputContainer: {
    flex: 1,
    marginRight: 8,
  },
  input: {
    fontSize: 16,
    color: colors.text,
    minHeight: 40,
    maxHeight: 120,
  },
  expandedContent: {
    marginTop: 8,
  },
  imageScroll: {
    marginBottom: 8,
  },
  imageContainer: {
    marginRight: 8,
    position: 'relative',
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  locationText: {
    marginLeft: 4,
    fontSize: 14,
    color: colors.text,
    maxWidth: 150,
  },
  rightIconsContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topIcon: {
    // Up arrow icon at top right
  },
  bottomIcon: {
    // Search icon at bottom right
  },
  progressContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  intentModal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  intentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  intentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
    marginBottom: 12,
  },
  intentButtonText: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
    fontWeight: '500',
  },
});
