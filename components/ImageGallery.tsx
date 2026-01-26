
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import { SkeletonLoader } from './SkeletonLoader';
import * as Haptics from 'expo-haptics';

interface ImageGalleryProps {
  visible: boolean;
  images: string[];
  imageIds?: string[];
  initialIndex?: number;
  onClose: () => void;
  onImagePress: (index: number) => void;
}

interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GALLERY_PADDING = 16;
const IMAGE_SPACING = 8;
const COLUMN_WIDTH = (SCREEN_WIDTH - GALLERY_PADDING * 2 - IMAGE_SPACING) / 2;

/**
 * ImageGallery Component
 * 
 * Displays images in an optimized masonry-style grid layout similar to property listing galleries.
 * Features:
 * - Intelligent layout based on image dimensions and aspect ratios
 * - Vertical scrolling to view all images
 * - Scrolls to the initially selected image position
 * - Tapping an image opens FullScreenImage with left/right scroll
 * - Optimized for performance with lazy loading
 */
export function ImageGallery({
  visible,
  images,
  imageIds,
  initialIndex = 0,
  onClose,
  onImagePress,
}: ImageGalleryProps) {
  const [imageDimensions, setImageDimensions] = useState<{ [key: number]: ImageDimensions }>({});
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const imageRefs = useRef<{ [key: number]: View | null }>({});

  // Load image dimensions when modal opens
  useEffect(() => {
    if (visible && images.length > 0) {
      console.log('[ImageGallery] Loading dimensions for', images.length, 'images');
      setIsLoadingDimensions(true);
      
      const loadDimensions = async () => {
        const dimensions: { [key: number]: ImageDimensions } = {};
        
        // Load dimensions for all images
        const promises = images.map((imageUrl, index) => {
          return new Promise<void>((resolve) => {
            if (!imageUrl) {
              resolve();
              return;
            }
            
            Image.getSize(
              imageUrl,
              (width, height) => {
                const aspectRatio = width / height;
                dimensions[index] = { width, height, aspectRatio };
                console.log(`[ImageGallery] Image ${index} dimensions:`, { width, height, aspectRatio });
                resolve();
              },
              (error) => {
                console.error(`[ImageGallery] Error loading dimensions for image ${index}:`, error);
                // Default to square aspect ratio on error
                dimensions[index] = { width: 1, height: 1, aspectRatio: 1 };
                resolve();
              }
            );
          });
        });
        
        await Promise.all(promises);
        setImageDimensions(dimensions);
        setIsLoadingDimensions(false);
        console.log('[ImageGallery] All dimensions loaded');
        
        // Scroll to initial image after layout
        setTimeout(() => {
          scrollToImage(initialIndex);
        }, 300);
      };
      
      loadDimensions();
    }
  }, [visible, images, initialIndex]);

  const scrollToImage = useCallback((index: number) => {
    if (imageRefs.current[index]) {
      console.log('[ImageGallery] Scrolling to image index:', index);
      imageRefs.current[index]?.measureLayout(
        scrollViewRef.current as any,
        (x, y) => {
          scrollViewRef.current?.scrollTo({
            y: Math.max(0, y - 100), // Offset to show image near top
            animated: true,
          });
        },
        () => {
          console.error('[ImageGallery] Failed to measure image layout');
        }
      );
    }
  }, []);

  const handleImagePress = (index: number) => {
    console.log('[ImageGallery] Image tapped at index:', index);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onImagePress(index);
  };

  const handleClose = () => {
    console.log('[ImageGallery] Closing gallery');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onClose();
  };

  const handleImageLoad = (index: number) => {
    setLoadedImages(prev => new Set(prev).add(index));
  };

  // Render all images in a simple vertical layout
  const renderGalleryContent = () => {
    if (isLoadingDimensions) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading gallery...</Text>
        </View>
      );
    }

    return (
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {images.map((imageUrl, index) => {
          const dims = imageDimensions[index];
          const isLoaded = loadedImages.has(index);
          
          // Calculate height based on aspect ratio
          let imageHeight = COLUMN_WIDTH;
          if (dims) {
            const { aspectRatio } = dims;
            
            // Wide images span full width
            if (aspectRatio > 1.5) {
              const fullWidth = SCREEN_WIDTH - GALLERY_PADDING * 2;
              imageHeight = fullWidth / aspectRatio;
            } else {
              // All other images use column width
              imageHeight = COLUMN_WIDTH / aspectRatio;
            }
          }
          
          // Determine if image should be full width
          const isFullWidth = dims && dims.aspectRatio > 1.5;
          const imageWidth = isFullWidth ? SCREEN_WIDTH - GALLERY_PADDING * 2 : COLUMN_WIDTH;
          
          return (
            <View
              key={`image-${index}`}
              ref={(ref) => { imageRefs.current[index] = ref; }}
              style={[
                styles.imageContainer,
                { 
                  width: imageWidth,
                  height: imageHeight,
                  marginBottom: IMAGE_SPACING,
                },
              ]}
            >
              <Pressable
                onPress={() => handleImagePress(index)}
                style={styles.imagePressable}
              >
                {!isLoaded && (
                  <View style={styles.skeletonContainer}>
                    <SkeletonLoader
                      width={imageWidth}
                      height={imageHeight}
                      borderRadius={12}
                      variant="wave"
                    />
                  </View>
                )}
                {imageUrl && (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    resizeMode="cover"
                    onLoad={() => handleImageLoad(index)}
                  />
                )}
                
                {/* Image counter badge */}
                <View style={styles.imageCounterBadge}>
                  <Text style={styles.imageCounterText}>
                    {index + 1}
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        })}
        
        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol name="xmark" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {images.length} {images.length === 1 ? 'Image' : 'Images'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Gallery Content */}
        {renderGalleryContent()}
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
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  headerSpacer: {
    width: 44,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: GALLERY_PADDING,
  },
  imageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardDark,
  },
  imagePressable: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  skeletonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  imageCounterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageCounterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bottomSpacer: {
    height: 40,
  },
});
