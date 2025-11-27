
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
  Modal,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { IconSymbol } from './IconSymbol';
import ImageOCRDisplay from './ImageOCRDisplay';
import { colors } from '@/styles/commonStyles';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

interface FullScreenImageProps {
  visible: boolean;
  images: string[];
  imageIds?: string[];
  initialIndex?: number;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Standalone full-screen image viewer component with integrated OCR functionality
 * 
 * Features:
 * - Full-screen image carousel with smooth scrolling
 * - OCR button always visible and clickable on top of images
 * - Save image to native photo library
 * - Image counter and pagination dots
 * - OCR modal for viewing image analysis
 * - Reusable across NoteCard and note-editor
 */
export function FullScreenImage({
  visible,
  images,
  imageIds,
  initialIndex = 0,
  onClose,
}: FullScreenImageProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(initialIndex);
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Reset to initial index when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentImageIndex(initialIndex);
      // Scroll to initial index after a short delay to ensure layout is ready
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: initialIndex * SCREEN_WIDTH,
          y: 0,
          animated: false,
        });
      }, 100);
    }
  }, [visible, initialIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    if (index !== currentImageIndex && index >= 0 && index < images.length) {
      setCurrentImageIndex(index);
    }
  };

  const handleOCRButtonPress = () => {
    console.log('OCR button pressed for image index:', currentImageIndex);
    setShowOCRModal(true);
  };

  const getCurrentImageId = () => {
    if (imageIds && imageIds.length > currentImageIndex) {
      return imageIds[currentImageIndex];
    }
    return undefined;
  };

  const handleCloseOCRModal = () => {
    setShowOCRModal(false);
  };

  const handleSaveImage = async () => {
    if (Platform.OS === 'web') {
      Toast.show({
        type: 'info',
        text1: 'Not Available',
        text2: 'Saving images is not supported on web',
        position: 'bottom',
      });
      return;
    }

    try {
      setIsSaving(true);
      console.log('Requesting media library permissions...');

      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      
      if (status !== 'granted') {
        console.log('Media library permission denied');
        Alert.alert(
          'Permission Required',
          'Please grant permission to save images to your photo library.',
          [{ text: 'OK' }]
        );
        setIsSaving(false);
        return;
      }

      console.log('Media library permission granted');
      
      // Get current image URL
      const currentImageUrl = images[currentImageIndex];
      console.log('Saving image:', currentImageUrl);

      // Trigger haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Download the image to a temporary location
      const fileUri = FileSystem.cacheDirectory + `image_${Date.now()}.jpg`;
      console.log('Downloading image to:', fileUri);
      
      const downloadResult = await FileSystem.downloadAsync(currentImageUrl, fileUri);
      console.log('Download result:', downloadResult);

      if (downloadResult.status !== 200) {
        throw new Error('Failed to download image');
      }

      // Save to media library
      console.log('Saving to media library...');
      const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
      console.log('Image saved successfully:', asset);

      // Success haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      Toast.show({
        type: 'success',
        text1: 'Image Saved',
        text2: 'Image has been saved to your photo library',
        position: 'bottom',
      });

    } catch (error) {
      console.error('Error saving image:', error);
      
      // Error haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      Alert.alert(
        'Error',
        'Failed to save image. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Close Button - Top Right */}
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.closeButtonCircle}>
            <IconSymbol name="xmark" size={24} color="#FFFFFF" />
          </View>
        </Pressable>

        {/* Image Carousel */}
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          snapToInterval={SCREEN_WIDTH}
          decelerationRate="fast"
          style={styles.scrollView}
        >
          {images.map((imageUrl, index) => (
            <View key={`fullscreen-${index}`} style={styles.imageWrapper}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
              />
            </View>
          ))}
        </ScrollView>

        {/* Save Image Button - Bottom Left */}
        <Pressable
          style={styles.saveButton}
          onPress={handleSaveImage}
          disabled={isSaving}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <View style={styles.saveButtonContent}>
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <IconSymbol 
                ios_icon_name="arrow.down.to.line" 
                android_material_icon_name="download" 
                size={24} 
                color="#FFFFFF" 
              />
            )}
          </View>
        </Pressable>

        {/* OCR Button - Bottom Right */}
        <Pressable
          style={styles.ocrButton}
          onPress={handleOCRButtonPress}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Image
            source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
            style={styles.ocrButtonIcon}
            resizeMode="contain"
          />
        </Pressable>

        {/* Pagination Dots - Bottom Center */}
        {images.length > 1 && (
          <View style={styles.paginationContainer}>
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.paginationDot,
                  currentImageIndex === index && styles.paginationDotActive,
                ]}
              />
            ))}
          </View>
        )}

        {/* Counter Badge - Top Left */}
        {images.length > 1 && (
          <View style={styles.counterBadge}>
            <Text style={styles.counterText}>
              {currentImageIndex + 1} / {images.length}
            </Text>
          </View>
        )}
      </View>

      {/* OCR Modal */}
      <Modal
        visible={showOCRModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseOCRModal}
      >
        <View style={styles.ocrModalContainer}>
          <View style={styles.ocrModalContent}>
            <View style={styles.ocrModalHeader}>
              <Text style={styles.ocrModalTitle}>Image Analysis</Text>
              <Pressable
                onPress={handleCloseOCRModal}
                style={styles.ocrModalCloseButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol name="xmark" size={24} color={colors.text} />
              </Pressable>
            </View>

            {getCurrentImageId() ? (
              <ImageOCRDisplay
                imageId={getCurrentImageId()!}
                autoLoad={true}
                compact={false}
              />
            ) : (
              <View style={styles.ocrModalError}>
                <Text style={styles.ocrModalErrorText}>
                  No image ID available for analysis
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.98)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1000,
  },
  closeButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  saveButton: {
    position: 'absolute',
    bottom: 120,
    left: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.6)',
    elevation: 12,
    borderWidth: 3,
    borderColor: colors.primary,
    zIndex: 1000,
  },
  saveButtonContent: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ocrButton: {
    position: 'absolute',
    bottom: 120,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.6)',
    elevation: 12,
    borderWidth: 3,
    borderColor: colors.primary,
    zIndex: 1000,
  },
  ocrButtonIcon: {
    width: 36,
    height: 36,
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
  },
  paginationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: {
    width: 28,
    backgroundColor: '#FFFFFF',
  },
  counterBadge: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    zIndex: 100,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  ocrModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  ocrModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  ocrModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ocrModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  ocrModalCloseButton: {
    padding: 4,
  },
  ocrModalError: {
    padding: 20,
    alignItems: 'center',
  },
  ocrModalErrorText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
