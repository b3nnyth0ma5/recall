
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  useAnimatedGestureHandler,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';

interface ImageEditorProps {
  visible: boolean;
  imageUri: string;
  onSave: (editedUri: string) => void;
  onCancel: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CROP_AREA_SIZE = SCREEN_WIDTH - 40;
const MIN_CROP_SIZE = 100;
const HANDLE_SIZE = 30;

/**
 * Image Editor Component with Custom Crop
 * 
 * Allows users to edit photos with the following features:
 * - Custom crop with draggable edges and corners
 * - Pinch to zoom in/out
 * - Pan to move image
 * - Rotate 90 degrees clockwise
 * - Flip horizontally
 * - Flip vertically
 * - Reset to original
 */
export function ImageEditor({
  visible,
  imageUri,
  onSave,
  onCancel,
}: ImageEditorProps) {
  const [currentUri, setCurrentUri] = useState(imageUri);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isFlippedH, setIsFlippedH] = useState(false);
  const [isFlippedV, setIsFlippedV] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  // Image transform values
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Crop area values (relative to the crop container)
  const cropLeft = useSharedValue(20);
  const cropTop = useSharedValue(100);
  const cropWidth = useSharedValue(CROP_AREA_SIZE);
  const cropHeight = useSharedValue(CROP_AREA_SIZE);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentUri(imageUri);
      setRotationAngle(0);
      setIsFlippedH(false);
      setIsFlippedV(false);
      setIsCropMode(false);
      
      // Reset transform values
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      
      // Reset crop area
      cropLeft.value = 20;
      cropTop.value = 100;
      cropWidth.value = CROP_AREA_SIZE;
      cropHeight.value = CROP_AREA_SIZE;

      // Get image dimensions
      Image.getSize(imageUri, (width, height) => {
        setImageSize({ width, height });
        console.log('Image dimensions:', width, height);
      });
    }
  }, [visible, imageUri]);

  // Pinch gesture for zooming
  const pinchGesture = Gesture.Pinch()
    .enabled(isCropMode)
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
      // Limit scale between 0.5x and 5x
      scale.value = Math.max(0.5, Math.min(5, scale.value));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  // Pan gesture for moving image
  const panGesture = Gesture.Pan()
    .enabled(isCropMode)
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Combine gestures
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Animated style for image
  const animatedImageStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  // Animated style for crop overlay
  const animatedCropStyle = useAnimatedStyle(() => {
    return {
      left: cropLeft.value,
      top: cropTop.value,
      width: cropWidth.value,
      height: cropHeight.value,
    };
  });

  // Handle gestures for crop area corners and edges
  const createCornerGesture = (corner: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight') => {
    return Gesture.Pan()
      .onUpdate((event) => {
        const newLeft = corner.includes('Left') ? cropLeft.value + event.translationX : cropLeft.value;
        const newTop = corner.includes('top') ? cropTop.value + event.translationY : cropTop.value;
        const newWidth = corner.includes('Left') 
          ? cropWidth.value - event.translationX 
          : cropWidth.value + event.translationX;
        const newHeight = corner.includes('top')
          ? cropHeight.value - event.translationY
          : cropHeight.value + event.translationY;

        // Apply constraints
        if (newWidth >= MIN_CROP_SIZE && newLeft >= 0 && newLeft + newWidth <= SCREEN_WIDTH) {
          cropLeft.value = newLeft;
          cropWidth.value = newWidth;
        }
        if (newHeight >= MIN_CROP_SIZE && newTop >= 0 && newTop + newHeight <= SCREEN_HEIGHT * 0.6) {
          cropTop.value = newTop;
          cropHeight.value = newHeight;
        }
      });
  };

  const createEdgeGesture = (edge: 'left' | 'right' | 'top' | 'bottom') => {
    return Gesture.Pan()
      .onUpdate((event) => {
        if (edge === 'left') {
          const newLeft = cropLeft.value + event.translationX;
          const newWidth = cropWidth.value - event.translationX;
          if (newWidth >= MIN_CROP_SIZE && newLeft >= 0) {
            cropLeft.value = newLeft;
            cropWidth.value = newWidth;
          }
        } else if (edge === 'right') {
          const newWidth = cropWidth.value + event.translationX;
          if (newWidth >= MIN_CROP_SIZE && cropLeft.value + newWidth <= SCREEN_WIDTH) {
            cropWidth.value = newWidth;
          }
        } else if (edge === 'top') {
          const newTop = cropTop.value + event.translationY;
          const newHeight = cropHeight.value - event.translationY;
          if (newHeight >= MIN_CROP_SIZE && newTop >= 0) {
            cropTop.value = newTop;
            cropHeight.value = newHeight;
          }
        } else if (edge === 'bottom') {
          const newHeight = cropHeight.value + event.translationY;
          if (newHeight >= MIN_CROP_SIZE && cropTop.value + newHeight <= SCREEN_HEIGHT * 0.6) {
            cropHeight.value = newHeight;
          }
        }
      });
  };

  const handleRotate = async () => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const newRotation = (rotationAngle + 90) % 360;
      setRotationAngle(newRotation);

      const manipResult = await ImageManipulator.manipulateAsync(
        currentUri,
        [{ rotate: 90 }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      setCurrentUri(manipResult.uri);
      
      // Update image dimensions after rotation
      Image.getSize(manipResult.uri, (width, height) => {
        setImageSize({ width, height });
      });
      
      console.log('Image rotated successfully');
    } catch (error) {
      console.error('Error rotating image:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFlipHorizontal = async () => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setIsFlippedH(!isFlippedH);

      const manipResult = await ImageManipulator.manipulateAsync(
        currentUri,
        [{ flip: ImageManipulator.FlipType.Horizontal }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      setCurrentUri(manipResult.uri);
      console.log('Image flipped horizontally');
    } catch (error) {
      console.error('Error flipping image:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFlipVertical = async () => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setIsFlippedV(!isFlippedV);

      const manipResult = await ImageManipulator.manipulateAsync(
        currentUri,
        [{ flip: ImageManipulator.FlipType.Vertical }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      setCurrentUri(manipResult.uri);
      console.log('Image flipped vertically');
    } catch (error) {
      console.error('Error flipping image:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCropPress = () => {
    if (isProcessing) return;
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setIsCropMode(!isCropMode);
    console.log('Crop mode:', !isCropMode);
  };

  const handleApplyCrop = async () => {
    if (isProcessing || !isCropMode) return;
    
    try {
      setIsProcessing(true);
      
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // Calculate crop dimensions relative to the actual image
      const imageContainerWidth = SCREEN_WIDTH;
      const imageContainerHeight = SCREEN_HEIGHT * 0.6;
      
      // Calculate the displayed image dimensions (maintaining aspect ratio)
      const imageAspectRatio = imageSize.width / imageSize.height;
      const containerAspectRatio = imageContainerWidth / imageContainerHeight;
      
      let displayedWidth, displayedHeight, offsetX, offsetY;
      
      if (imageAspectRatio > containerAspectRatio) {
        // Image is wider - fit to width
        displayedWidth = imageContainerWidth;
        displayedHeight = imageContainerWidth / imageAspectRatio;
        offsetX = 0;
        offsetY = (imageContainerHeight - displayedHeight) / 2;
      } else {
        // Image is taller - fit to height
        displayedHeight = imageContainerHeight;
        displayedWidth = imageContainerHeight * imageAspectRatio;
        offsetX = (imageContainerWidth - displayedWidth) / 2;
        offsetY = 0;
      }

      // Account for zoom and pan
      const effectiveScale = scale.value;
      const effectiveTranslateX = translateX.value;
      const effectiveTranslateY = translateY.value;

      // Calculate crop area relative to the displayed image
      const cropRelativeLeft = (cropLeft.value - offsetX - effectiveTranslateX) / effectiveScale;
      const cropRelativeTop = (cropTop.value - offsetY - effectiveTranslateY) / effectiveScale;
      const cropRelativeWidth = cropWidth.value / effectiveScale;
      const cropRelativeHeight = cropHeight.value / effectiveScale;

      // Convert to actual image coordinates
      const scaleToActual = imageSize.width / displayedWidth;
      const actualCropX = Math.max(0, cropRelativeLeft * scaleToActual);
      const actualCropY = Math.max(0, cropRelativeTop * scaleToActual);
      const actualCropWidth = Math.min(imageSize.width - actualCropX, cropRelativeWidth * scaleToActual);
      const actualCropHeight = Math.min(imageSize.height - actualCropY, cropRelativeHeight * scaleToActual);

      console.log('Crop parameters:', {
        originX: actualCropX,
        originY: actualCropY,
        width: actualCropWidth,
        height: actualCropHeight,
      });

      const manipResult = await ImageManipulator.manipulateAsync(
        currentUri,
        [
          {
            crop: {
              originX: actualCropX,
              originY: actualCropY,
              width: actualCropWidth,
              height: actualCropHeight,
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      setCurrentUri(manipResult.uri);
      
      // Update image dimensions after crop
      Image.getSize(manipResult.uri, (width, height) => {
        setImageSize({ width, height });
      });
      
      // Reset transform values
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      
      // Reset crop area
      cropLeft.value = 20;
      cropTop.value = 100;
      cropWidth.value = CROP_AREA_SIZE;
      cropHeight.value = CROP_AREA_SIZE;
      
      setIsCropMode(false);
      console.log('Image cropped successfully');
    } catch (error) {
      console.error('Error cropping image:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    if (isProcessing) return;
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setCurrentUri(imageUri);
    setRotationAngle(0);
    setIsFlippedH(false);
    setIsFlippedV(false);
    setIsCropMode(false);
    
    // Reset transform values
    scale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    
    // Reset crop area
    cropLeft.value = 20;
    cropTop.value = 100;
    cropWidth.value = CROP_AREA_SIZE;
    cropHeight.value = CROP_AREA_SIZE;
    
    // Reset image dimensions
    Image.getSize(imageUri, (width, height) => {
      setImageSize({ width, height });
    });
    
    console.log('Image reset to original');
  };

  const handleSave = async () => {
    if (isProcessing) return;
    
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    console.log('Saving edited image:', currentUri);
    onSave(currentUri);
  };

  const handleCancel = () => {
    if (isProcessing) return;
    
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    console.log('Canceling image edit');
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleCancel}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={isProcessing}
          >
            <Text style={styles.headerButtonText}>Cancel</Text>
          </Pressable>
          
          <Text style={styles.headerTitle}>
            {isCropMode ? 'Adjust Crop' : 'Edit Photo'}
          </Text>
          
          <Pressable
            onPress={handleSave}
            style={[styles.headerButton, styles.saveButton]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={isProcessing}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>

        {/* Image Preview with Crop Overlay */}
        <View style={styles.imageContainer}>
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.processingText}>Processing...</Text>
            </View>
          )}
          
          <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.imageWrapper, animatedImageStyle]}>
              <Image
                source={{ uri: currentUri }}
                style={styles.image}
                resizeMode="contain"
              />
            </Animated.View>
          </GestureDetector>

          {/* Crop Overlay */}
          {isCropMode && (
            <View style={styles.cropOverlayContainer}>
              {/* Dark overlay outside crop area */}
              <View style={styles.darkOverlay} />
              
              {/* Crop area with handles */}
              <Animated.View style={[styles.cropArea, animatedCropStyle]}>
                {/* Grid lines */}
                <View style={styles.gridContainer}>
                  <View style={[styles.gridLine, styles.gridLineVertical, { left: '33.33%' }]} />
                  <View style={[styles.gridLine, styles.gridLineVertical, { left: '66.66%' }]} />
                  <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '33.33%' }]} />
                  <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '66.66%' }]} />
                </View>

                {/* Corner handles */}
                <GestureDetector gesture={createCornerGesture('topLeft')}>
                  <View style={[styles.cornerHandle, styles.cornerTopLeft]} />
                </GestureDetector>
                <GestureDetector gesture={createCornerGesture('topRight')}>
                  <View style={[styles.cornerHandle, styles.cornerTopRight]} />
                </GestureDetector>
                <GestureDetector gesture={createCornerGesture('bottomLeft')}>
                  <View style={[styles.cornerHandle, styles.cornerBottomLeft]} />
                </GestureDetector>
                <GestureDetector gesture={createCornerGesture('bottomRight')}>
                  <View style={[styles.cornerHandle, styles.cornerBottomRight]} />
                </GestureDetector>

                {/* Edge handles */}
                <GestureDetector gesture={createEdgeGesture('left')}>
                  <View style={[styles.edgeHandle, styles.edgeLeft]} />
                </GestureDetector>
                <GestureDetector gesture={createEdgeGesture('right')}>
                  <View style={[styles.edgeHandle, styles.edgeRight]} />
                </GestureDetector>
                <GestureDetector gesture={createEdgeGesture('top')}>
                  <View style={[styles.edgeHandle, styles.edgeTop]} />
                </GestureDetector>
                <GestureDetector gesture={createEdgeGesture('bottom')}>
                  <View style={[styles.edgeHandle, styles.edgeBottom]} />
                </GestureDetector>
              </Animated.View>
            </View>
          )}

          {/* Crop mode instructions */}
          {isCropMode && (
            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionsText}>
                Pinch to zoom • Drag to move • Adjust edges to crop
              </Text>
            </View>
          )}
        </View>

        {/* Edit Controls */}
        <View style={styles.controlsContainer}>
          {isCropMode ? (
            <View style={styles.cropControlsRow}>
              <Pressable
                onPress={handleCropPress}
                style={styles.cropControlButton}
                disabled={isProcessing}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.cropControlButtonText}>Cancel Crop</Text>
              </Pressable>

              <Pressable
                onPress={handleApplyCrop}
                style={[styles.cropControlButton, styles.cropControlButtonPrimary]}
                disabled={isProcessing}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.cropControlButtonTextPrimary}>Apply Crop</Text>
              </Pressable>
            </View>
          ) : (
            <React.Fragment>
              <View style={styles.controlsRow}>
                <Pressable
                  onPress={handleRotate}
                  style={styles.controlButton}
                  disabled={isProcessing}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={styles.controlButtonCircle}>
                    <IconSymbol 
                      name="rotate.right" 
                      size={24} 
                      color={isProcessing ? colors.textTertiary : colors.primary} 
                    />
                  </View>
                  <Text style={styles.controlButtonLabel}>Rotate</Text>
                </Pressable>

                <Pressable
                  onPress={handleFlipHorizontal}
                  style={styles.controlButton}
                  disabled={isProcessing}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={styles.controlButtonCircle}>
                    <IconSymbol 
                      name="arrow.left.and.right" 
                      size={24} 
                      color={isProcessing ? colors.textTertiary : colors.primary} 
                    />
                  </View>
                  <Text style={styles.controlButtonLabel}>Flip H</Text>
                </Pressable>

                <Pressable
                  onPress={handleFlipVertical}
                  style={styles.controlButton}
                  disabled={isProcessing}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={styles.controlButtonCircle}>
                    <IconSymbol 
                      name="arrow.up.and.down" 
                      size={24} 
                      color={isProcessing ? colors.textTertiary : colors.primary} 
                    />
                  </View>
                  <Text style={styles.controlButtonLabel}>Flip V</Text>
                </Pressable>

                <Pressable
                  onPress={handleCropPress}
                  style={styles.controlButton}
                  disabled={isProcessing}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <View style={styles.controlButtonCircle}>
                    <IconSymbol 
                      name="crop" 
                      size={24} 
                      color={isProcessing ? colors.textTertiary : colors.primary} 
                    />
                  </View>
                  <Text style={styles.controlButtonLabel}>Crop</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={handleReset}
                style={styles.resetButton}
                disabled={isProcessing || currentUri === imageUri}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol 
                  name="arrow.counterclockwise" 
                  size={20} 
                  color={currentUri === imageUri ? colors.textTertiary : colors.primary} 
                />
                <Text 
                  style={[
                    styles.resetButtonText,
                    currentUri === imageUri && styles.resetButtonTextDisabled
                  ]}
                >
                  Reset to Original
                </Text>
              </Pressable>
            </React.Fragment>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    position: 'relative',
    overflow: 'hidden',
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    gap: 12,
  },
  processingText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cropOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cropArea: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  gridLineVertical: {
    width: 1,
    height: '100%',
  },
  gridLineHorizontal: {
    height: 1,
    width: '100%',
  },
  cornerHandle: {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: HANDLE_SIZE / 2,
  },
  cornerTopLeft: {
    top: -HANDLE_SIZE / 2,
    left: -HANDLE_SIZE / 2,
  },
  cornerTopRight: {
    top: -HANDLE_SIZE / 2,
    right: -HANDLE_SIZE / 2,
  },
  cornerBottomLeft: {
    bottom: -HANDLE_SIZE / 2,
    left: -HANDLE_SIZE / 2,
  },
  cornerBottomRight: {
    bottom: -HANDLE_SIZE / 2,
    right: -HANDLE_SIZE / 2,
  },
  edgeHandle: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  edgeLeft: {
    left: -10,
    top: 0,
    bottom: 0,
    width: 20,
  },
  edgeRight: {
    right: -10,
    top: 0,
    bottom: 0,
    width: 20,
  },
  edgeTop: {
    top: -10,
    left: 0,
    right: 0,
    height: 20,
  },
  edgeBottom: {
    bottom: -10,
    left: 0,
    right: 0,
    height: 20,
  },
  instructionsContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 6,
  },
  instructionsText: {
    fontSize: 14,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  controlsContainer: {
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  controlButton: {
    alignItems: 'center',
    gap: 8,
  },
  controlButtonCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  controlButtonLabel: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  cropControlsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  cropControlButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cropControlButtonPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cropControlButtonText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  cropControlButtonTextPrimary: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  resetButtonTextDisabled: {
    color: colors.textTertiary,
  },
});
