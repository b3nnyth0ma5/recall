
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Alert,
} from 'react-native';
import Animated, { 
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { IconSymbol } from './IconSymbol';
import ImageOCRDisplay from './ImageOCRDisplay';
import { colors } from '@/styles/commonStyles';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { getImageDataUrl } from '@/utils/supabase';
import { SkeletonLoader } from './SkeletonLoader';

interface FullScreenImageProps {
  visible: boolean;
  images: string[];
  imageIds?: string[];
  initialIndex?: number;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Threshold for dismissing the modal (swipe down distance)
const DISMISS_THRESHOLD = 100;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * Standalone full-screen image viewer component with integrated OCR functionality
 * 
 * Features:
 * - Full-screen image carousel with smooth scrolling
 * - Pinch-to-zoom and pan per image slide
 * - Double-tap to toggle zoom
 * - OCR button always visible and clickable on top of images
 * - Share image using native share functionality
 * - Swipe down to dismiss with improved gesture handling (no refresh on close)
 * - Image counter and pagination dots
 * - OCR modal for viewing image analysis
 * - Reusable across NoteCard and note-editor
 * - Loads all images from imageIds when opened
 * - Skeleton placeholders instead of loading spinner
 */

interface ZoomableImageProps {
  imageUrl: string;
  index: number;
  isLoaded: boolean;
  onLoad: (index: number) => void;
  resetTrigger: number;
}

function ZoomableImage({ imageUrl, index, isLoaded, onLoad, resetTrigger }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Reset zoom when resetTrigger changes (i.e. when currentImageIndex changes)
  useEffect(() => {
    scale.value = withTiming(1, { duration: 200 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTrigger]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const newScale = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_event, stateManager) => {
      if (scale.value > 1) {
        stateManager.activate();
      } else {
        stateManager.fail();
      }
    })
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.imageWrapper}>
        {imageUrl ? (
          <>
            {!isLoaded && (
              <View style={styles.skeletonContainer}>
                <SkeletonLoader
                  width={SCREEN_WIDTH}
                  height={SCREEN_HEIGHT}
                  borderRadius={0}
                  variant="wave"
                />
              </View>
            )}
            <Animated.Image
              source={{ uri: imageUrl }}
              style={[styles.image, animatedImageStyle]}
              resizeMode="contain"
              onLoad={() => onLoad(index)}
            />
          </>
        ) : (
          <View style={styles.skeletonContainer}>
            <SkeletonLoader
              width={SCREEN_WIDTH}
              height={SCREEN_HEIGHT}
              borderRadius={0}
              variant="wave"
            />
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

export function FullScreenImage({
  visible,
  images,
  imageIds,
  initialIndex = 0,
  onClose,
}: FullScreenImageProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(initialIndex);
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [imageLoadStates, setImageLoadStates] = useState<{ [key: number]: boolean }>({});
  // resetTrigger increments whenever currentImageIndex changes to reset zoom in each slide
  const [resetTrigger, setResetTrigger] = useState(0);
  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  // Animated values for swipe-to-dismiss gesture
  const translateY = useSharedValue(0);
  const contextY = useSharedValue(0);

  // Load all images when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentImageIndex(initialIndex);
      setIsClosing(false);
      // Reset animation values immediately
      translateY.value = 0;
      contextY.value = 0;
      
      // Load all images from imageIds if available
      const loadAllImages = async () => {
        if (imageIds && imageIds.length > 0) {
          console.log('[FullScreenImage] Loading all images from imageIds');
          setIsLoadingImages(true);
          
          try {
            const imagePromises = imageIds.map(async (imageId, index) => {
              try {
                const imageUrl = await getImageDataUrl(imageId);
                return imageUrl || images[index] || '';
              } catch (error) {
                console.error(`[FullScreenImage] Error loading image ${index}:`, error);
                return images[index] || '';
              }
            });
            
            const allImages = await Promise.all(imagePromises);
            setLoadedImages(allImages);
            console.log('[FullScreenImage] Successfully loaded all images');
          } catch (error) {
            console.error('[FullScreenImage] Error loading images:', error);
            // Fallback to original images array
            setLoadedImages(images);
          } finally {
            setIsLoadingImages(false);
          }
        } else {
          // No imageIds, use images array directly
          console.log('[FullScreenImage] Using images array directly');
          setLoadedImages(images);
        }
      };
      
      loadAllImages();
      
      // Scroll to initial index after a short delay to ensure layout is ready
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: initialIndex * SCREEN_WIDTH,
          y: 0,
          animated: false,
        });
      }, 100);
    }
  }, [visible, initialIndex, images, imageIds, translateY, contextY]);

  // Reset zoom on all slides when the active index changes
  useEffect(() => {
    setResetTrigger(prev => prev + 1);
  }, [currentImageIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    if (index !== currentImageIndex && index >= 0 && index < loadedImages.length) {
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

  const handleShareImage = async () => {
    if (Platform.OS === 'web') {
      Toast.show({
        type: 'info',
        text1: 'Not Available',
        text2: 'Sharing images is not fully supported on web',
        position: 'bottom',
      });
      return;
    }

    try {
      setIsSharing(true);
      console.log('Checking if sharing is available...');

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (!isAvailable) {
        console.log('Sharing is not available on this device');
        Alert.alert(
          'Not Available',
          'Sharing is not available on this device.',
          [{ text: 'OK' }]
        );
        setIsSharing(false);
        return;
      }

      console.log('Sharing is available');
      
      // Get current image URL
      const currentImageUrl = loadedImages[currentImageIndex];
      console.log('Sharing image:', currentImageUrl);

      // Trigger haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Download the image to a temporary location
      const fileUri = FileSystem.cacheDirectory + `share_image_${Date.now()}.jpg`;
      console.log('Downloading image to:', fileUri);
      
      const downloadResult = await FileSystem.downloadAsync(currentImageUrl, fileUri);
      console.log('Download result:', downloadResult);

      if (downloadResult.status !== 200) {
        throw new Error('Failed to download image');
      }

      // Share the image
      console.log('Opening share dialog...');
      await Sharing.shareAsync(downloadResult.uri, {
        dialogTitle: 'Share Image',
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
      });

      console.log('Share dialog completed');

      // Success haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

    } catch (error) {
      console.error('Error sharing image:', error);
      
      // Error haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      Alert.alert(
        'Error',
        'Failed to share image. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleClose = () => {
    if (isClosing) return;
    
    console.log('Closing full screen image - preventing route refresh');
    setIsClosing(true);
    
    // Reset animation values immediately to prevent any lingering animations
    translateY.value = 0;
    contextY.value = 0;
    
    // Call onClose which will update the parent's state
    // This should NOT trigger navigation or route refresh
    onClose();
  };

  const handleImageLoad = (index: number) => {
    setImageLoadStates(prev => ({ ...prev, [index]: true }));
  };

  // Outer Pan Gesture for swipe-to-dismiss — only activates on clear vertical swipes
  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      // Only allow downward swipes
      if (event.translationY > 0) {
        translateY.value = contextY.value + event.translationY;
      } else {
        // Allow slight upward movement for natural feel
        translateY.value = contextY.value + event.translationY * 0.3;
      }
    })
    .onEnd(() => {
      const shouldDismiss = translateY.value > DISMISS_THRESHOLD;
      
      if (shouldDismiss) {
        // Animate out smoothly
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 200 },
          (finished) => {
            if (finished) {
              // Reset immediately before closing to prevent flicker
              translateY.value = 0;
              contextY.value = 0;
              runOnJS(handleClose)();
            }
          }
        );
      } else {
        // Spring back to original position
        translateY.value = withSpring(0, {
          damping: 25,
          stiffness: 400,
          mass: 0.8,
        });
      }
    });

  // Animated style for the container with smooth interpolation
  const animatedContainerStyle = useAnimatedStyle(() => {
    // Smooth opacity fade
    const opacity = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP
    );
    
    // Smooth scale down
    const containerScale = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT],
      [1, 0.85],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { translateY: translateY.value },
        { scale: containerScale },
      ],
      opacity: opacity,
    };
  });

  // Animated style for background overlay
  const animatedBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [0.98, 0],
      Extrapolation.CLAMP
    );

    return {
      opacity: opacity,
    };
  });

  // Use loaded images or show loading state
  const displayImages = loadedImages.length > 0 ? loadedImages : images;

  const counterText = `${currentImageIndex + 1} / ${displayImages.length}`;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        {/* Animated background */}
        <Animated.View style={[styles.background, animatedBackgroundStyle]} />
        
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.container, animatedContainerStyle]}>
            {/* Close Button - Top Right */}
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
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
              {displayImages.map((imageUrl, index) => (
                <ZoomableImage
                  key={`fullscreen-${index}`}
                  imageUrl={imageUrl}
                  index={index}
                  isLoaded={!!imageLoadStates[index]}
                  onLoad={handleImageLoad}
                  resetTrigger={currentImageIndex === index ? 0 : resetTrigger}
                />
              ))}
            </ScrollView>

            {/* Share Image Button - Bottom Left */}
            <Pressable
              style={styles.shareButton}
              onPress={handleShareImage}
              disabled={isSharing}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <View style={styles.shareButtonContent}>
                {isSharing ? (
                  <SkeletonLoader
                    width={24}
                    height={24}
                    borderRadius={12}
                    variant="pulse"
                  />
                ) : (
                  <IconSymbol 
                    name="paperplane.fill" 
                    size={24} 
                    color="#FFFFFF" 
                  />
                )}
              </View>
            </Pressable>

            {/* OCR Button - Bottom Right */}
            <Pressable
              style={styles.ocrButton}
              onPress={() => {
                console.log('[FullScreenImage] Text/OCR button pressed for image index:', currentImageIndex);
                handleOCRButtonPress();
              }}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              accessibilityLabel="View extracted text and explanation"
              accessibilityRole="button"
            >
              <View style={styles.shareButtonContent}>
                <IconSymbol
                  name="text.alignleft"
                  size={24}
                  color="#FFFFFF"
                />
              </View>
            </Pressable>

            {/* Pagination Dots - Bottom Center */}
            {displayImages.length > 1 && (
              <View style={styles.paginationContainer}>
                {displayImages.map((_, index) => (
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
            {displayImages.length > 1 && (
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>
                  {counterText}
                </Text>
              </View>
            )}

            {/* Swipe Down Hint - Top Center */}
            <View style={styles.swipeHintContainer}>
              <View style={styles.swipeHintBar} />
            </View>
          </Animated.View>
        </GestureDetector>
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
  modalContainer: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.98)',
  },
  container: {
    flex: 1,
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
    overflow: 'hidden',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  skeletonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButton: {
    position: 'absolute',
    bottom: 40,
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
  shareButtonContent: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ocrButton: {
    position: 'absolute',
    bottom: 40,
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
  swipeHintContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  swipeHintBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
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
