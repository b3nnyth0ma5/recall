
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
import { getOptimizedCloudflareUrl } from '@/utils/cloudflareCDN';
import * as Haptics from 'expo-haptics';

interface ImageGalleryProps {
  visible: boolean;
  images: string[];
  imageIds?: string[];
  initialIndex?: number;
  onClose: () => void;
  onImagePress: (index: number) => void;
}

const screenDimensions = Dimensions.get('window');
const SCREEN_WIDTH = screenDimensions.width;
const GALLERY_PADDING = 16;
const IMAGE_SPACING = 8;
const COLUMN_WIDTH = (SCREEN_WIDTH - GALLERY_PADDING * 2 - IMAGE_SPACING) / 2;

/**
 * ImageGallery Component
 * 
 * Displays images in a 2-column, multi-row 'Z layout' format (left-to-right, top-to-bottom).
 * Features:
 * - 2-column grid layout with proper Z-order
 * - Optimized Cloudflare CDN images with lower aspect ratio for speed
 * - Iterative image loading with skeleton placeholders
 * - Scrolls to the initially selected image position
 * - Tapping an image opens FullScreenImage with left/right scroll
 * - Opens on top of other modals with proper z-index
 */
export function ImageGallery({
  visible,
  images,
  imageIds,
  initialIndex = 0,
  onClose,
  onImagePress,
}: ImageGalleryProps) {
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const [optimizedUrls, setOptimizedUrls] = useState<string[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const imageRefs = useRef<{ [key: number]: View | null }>({});

  // Generate optimized Cloudflare URLs when modal opens
  useEffect(() => {
    if (visible && images.length > 0) {
      console.log('[ImageGallery] Generating optimized URLs for', images.length, 'images');
      
      // Generate optimized URLs with lower aspect ratio for faster loading
      const optimized = images.map(imageUrl => {
        if (!imageUrl) {
          return '';
        }
        
        // Use Cloudflare image optimization with lower dimensions for gallery view
        return getOptimizedCloudflareUrl(imageUrl, {
          width: Math.round(COLUMN_WIDTH * 2), // 2x for retina displays
          quality: 80,
          fit: 'cover',
          format: 'webp',
        });
      });
      
      setOptimizedUrls(optimized);
      console.log('[ImageGallery] Optimized URLs generated');
      
      // Scroll to initial image after a short delay
      setTimeout(() => {
        scrollToImage(initialIndex);
      }, 300);
    } else {
      // Reset state when modal closes
      setLoadedImages(new Set());
      setOptimizedUrls([]);
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
    console.log('[ImageGallery] Image loaded:', index);
    setLoadedImages(prev => new Set(prev).add(index));
  };

  // Render images in 2-column Z layout
  const renderGalleryContent = () => {
    if (optimizedUrls.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading gallery...</Text>
        </View>
      );
    }

    // Create rows of 2 images each (Z layout: left-to-right, top-to-bottom)
    const rows: number[][] = [];
    for (let i = 0; i < optimizedUrls.length; i += 2) {
      rows.push([i, i + 1].filter(idx => idx < optimizedUrls.length));
    }

    return (
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {rows.map((rowIndices, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {rowIndices.map((imageIndex) => {
              const imageUrl = optimizedUrls[imageIndex];
              const isLoaded = loadedImages.has(imageIndex);
              
              return (
                <View
                  key={`image-${imageIndex}`}
                  ref={(ref) => { imageRefs.current[imageIndex] = ref; }}
                  style={styles.imageContainer}
                >
                  <Pressable
                    onPress={() => handleImagePress(imageIndex)}
                    style={styles.imagePressable}
                  >
                    {/* Skeleton placeholder - shown until image loads */}
                    {!isLoaded && (
                      <View style={styles.skeletonContainer}>
                        <SkeletonLoader
                          width={COLUMN_WIDTH}
                          height={COLUMN_WIDTH}
                          borderRadius={12}
                          variant="wave"
                        />
                      </View>
                    )}
                    
                    {/* Actual image - loads iteratively */}
                    {imageUrl && (
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.image}
                        resizeMode="cover"
                        onLoad={() => handleImageLoad(imageIndex)}
                      />
                    )}
                    
                    {/* Image counter badge */}
                    <View style={styles.imageCounterBadge}>
                      <Text style={styles.imageCounterText}>
                        {imageIndex + 1}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            })}
            
            {/* Add empty spacer if odd number of images in last row */}
            {rowIndices.length === 1 && (
              <View style={styles.imageContainer} />
            )}
          </View>
        ))}
        
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
      presentationStyle="fullScreen"
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconSymbol 
              ios_icon_name="xmark" 
              android_material_icon_name="close" 
              size={24} 
              color={colors.text} 
            />
          </Pressable>
          <Text style={styles.headerTitle}>
            {images.length}
          </Text>
          <Text style={styles.headerSubtitle}>
            {images.length === 1 ? 'Image' : 'Images'}
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
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.textSecondary,
    marginLeft: 4,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: IMAGE_SPACING,
  },
  imageContainer: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH,
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
