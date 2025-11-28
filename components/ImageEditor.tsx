
import React, { useState } from 'react';
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

/**
 * Image Editor Component
 * 
 * Allows users to edit photos with the following features:
 * - Rotate 90 degrees clockwise
 * - Flip horizontally
 * - Flip vertically
 * - Crop to square
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

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentUri(imageUri);
      setRotationAngle(0);
      setIsFlippedH(false);
      setIsFlippedV(false);
    }
  }, [visible, imageUri]);

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

  const handleCropSquare = async () => {
    if (isProcessing) return;
    
    try {
      setIsProcessing(true);
      
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Get image dimensions first
      const imageInfo = await ImageManipulator.manipulateAsync(
        currentUri,
        [],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Calculate square crop dimensions (center crop)
      const size = Math.min(imageInfo.width, imageInfo.height);
      const originX = (imageInfo.width - size) / 2;
      const originY = (imageInfo.height - size) / 2;

      const manipResult = await ImageManipulator.manipulateAsync(
        currentUri,
        [
          {
            crop: {
              originX,
              originY,
              width: size,
              height: size,
            },
          },
        ],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );

      setCurrentUri(manipResult.uri);
      console.log('Image cropped to square');
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
          
          <Text style={styles.headerTitle}>Edit Photo</Text>
          
          <Pressable
            onPress={handleSave}
            style={[styles.headerButton, styles.saveButton]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={isProcessing}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>

        {/* Image Preview */}
        <View style={styles.imageContainer}>
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.processingText}>Processing...</Text>
            </View>
          )}
          <Image
            source={{ uri: currentUri }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        {/* Edit Controls */}
        <View style={styles.controlsContainer}>
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
              onPress={handleCropSquare}
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
