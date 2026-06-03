
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { getOptimizedCloudflareUrl } from '@/utils/cloudflareCDN';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';

const screenDimensions = Dimensions.get('window');
const SCREEN_WIDTH = screenDimensions.width;
const GALLERY_PADDING = 4;
const IMAGE_SPACING = 4;

/**
 * ImageGallery Screen - Variable Grid Masonry Layout
 * 
 * Features:
 * - Variable grid pattern (inspired by Pinterest/Instagram)
 * - Images load promptly without stuck skeleton placeholders
 * - Clicking an image opens FullScreenImage on a different route
 * - Back button returns to previous screen
 * - Optimized Cloudflare CDN images
 * - Filters out empty/undefined images
 * 
 * Layout Pattern:
 * - Dynamic grid with varying image sizes
 * - Some images span 2 columns, others are single column
 * - Heights vary to create visual interest
 */
export default function ImageGalleryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse images from params (passed as JSON string) and filter out empty ones
  const images = useMemo(() => {
    try {
      const parsedImages = params.images ? JSON.parse(params.images as string) : [];
      // Filter out empty, null, or undefined images
      const filteredImages = parsedImages.filter((img: string) => img && img.trim().length > 0);
      console.log('[ImageGalleryScreen] Parsed images:', parsedImages.length);
      console.log('[ImageGalleryScreen] Filtered images:', filteredImages.length);
      return filteredImages;
    } catch (error) {
      console.error('[ImageGalleryScreen] Error parsing images:', error);
      return [];
    }
  }, [params.images]);
  
  const imageIds = useMemo(() => {
    try {
      if (!params.imageIds) {
        return undefined;
      }
      const parsedIds = JSON.parse(params.imageIds as string);
      // Filter to match the filtered images array length
      const filteredIds = parsedIds.filter((_: string, index: number) => {
        const originalImages = params.images ? JSON.parse(params.images as string) : [];
        return originalImages[index] && originalImages[index].trim().length > 0;
      });
      console.log('[ImageGalleryScreen] Filtered imageIds:', filteredIds.length);
      return filteredIds;
    } catch (error) {
      console.error('[ImageGalleryScreen] Error parsing imageIds:', error);
      return undefined;
    }
  }, [params.imageIds, params.images]);
  
  const initialIndex = useMemo(() => {
    return params.initialIndex ? parseInt(params.initialIndex as string) : 0;
  }, [params.initialIndex]);
  
  const [optimizedUrls, setOptimizedUrls] = useState<string[]>([]);
  const [imageLoadErrors, setImageLoadErrors] = useState<{ [key: number]: boolean }>({});

  // Generate optimized URLs immediately
  useEffect(() => {
    if (images.length > 0) {
      console.log('[ImageGalleryScreen] Generating optimized URLs for', images.length, 'images');
      console.log('[ImageGalleryScreen] First 3 image URLs:', images.slice(0, 3));
      
      // Generate optimized URLs for all images
      const optimized = images.map((imageUrl: string, index: number) => {
        if (!imageUrl || imageUrl.trim().length === 0) {
          console.log('[ImageGalleryScreen] Skipping empty image URL at index', index);
          return '';
        }
        
        // Try to optimize, but fallback to original if optimization fails
        try {
          const optimizedUrl = getOptimizedCloudflareUrl(imageUrl, {
            width: Math.round(SCREEN_WIDTH * 0.8),
            quality: 85,
            fit: 'cover',
            format: 'webp',
          });
          
          // If optimization returns the same URL or empty, use original
          const finalUrl = optimizedUrl && optimizedUrl.trim().length > 0 ? optimizedUrl : imageUrl;
          
          if (index < 3) {
            console.log(`[ImageGalleryScreen] Image ${index} - Original:`, imageUrl.substring(0, 80));
            console.log(`[ImageGalleryScreen] Image ${index} - Optimized:`, finalUrl.substring(0, 80));
          }
          
          return finalUrl;
        } catch (error) {
          console.error(`[ImageGalleryScreen] Error optimizing image ${index}:`, error);
          return imageUrl; // Fallback to original
        }
      });
      
      setOptimizedUrls(optimized);
      console.log('[ImageGalleryScreen] Setup complete with', optimized.length, 'URLs');
      console.log('[ImageGalleryScreen] Non-empty URLs:', optimized.filter(url => url && url.trim().length > 0).length);
    }
  }, [images]);

  const handleImagePress = useCallback((index: number) => {
    console.log('[ImageGalleryScreen] Image tapped at index:', index);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    // Navigate to full screen image route
    router.push({
      pathname: '/full-screen-image',
      params: {
        images: JSON.stringify(images),
        imageIds: imageIds ? JSON.stringify(imageIds) : undefined,
        initialIndex: index.toString(),
      },
    });
  }, [images, imageIds, router]);

  const handleBack = useCallback(() => {
    console.log('[ImageGalleryScreen] Back button pressed');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.back();
  }, [router]);

  // Calculate variable grid layout based on image count
  const calculateVariableGrid = useCallback(() => {
    const items: {
      index: number;
      width: number;
      height: number;
      aspectRatio: number;
    }[] = [];

    // Define layout patterns (inspired by the attached images)
    // Pattern repeats every 11 images for consistency
    const patterns: {
      width: number;
      aspectRatio: number;
    }[] = [
      // Row 1: Large + Small
      { width: 0.66, aspectRatio: 1.2 },  // Large left
      { width: 0.34, aspectRatio: 1.2 },  // Small right
      
      // Row 2: Small + Large
      { width: 0.34, aspectRatio: 1.0 },  // Small left
      { width: 0.66, aspectRatio: 1.0 },  // Large right
      
      // Row 3: Three equal
      { width: 0.33, aspectRatio: 1.1 },  // Left
      { width: 0.33, aspectRatio: 1.1 },  // Center
      { width: 0.34, aspectRatio: 1.1 },  // Right (slightly larger to fill)
      
      // Row 4: Two equal
      { width: 0.5, aspectRatio: 0.9 },   // Left
      { width: 0.5, aspectRatio: 0.9 },   // Right
      
      // Row 5: Large + Small
      { width: 0.66, aspectRatio: 1.3 },  // Large left
      { width: 0.34, aspectRatio: 1.3 },  // Small right
    ];

    console.log('[ImageGalleryScreen] Calculating grid for', optimizedUrls.length, 'images');
    
    // FIXED: Process ALL images, not just the first batch
    for (let index = 0; index < optimizedUrls.length; index++) {
      const pattern = patterns[index % patterns.length];
      const availableWidth = SCREEN_WIDTH - (GALLERY_PADDING * 2);
      const imageWidth = availableWidth * pattern.width - IMAGE_SPACING;
      const imageHeight = imageWidth * pattern.aspectRatio;
      
      items.push({
        index,
        width: imageWidth,
        height: imageHeight,
        aspectRatio: pattern.aspectRatio,
      });
    }

    console.log('[ImageGalleryScreen] Generated', items.length, 'grid items');
    return items;
  }, [optimizedUrls]);

  const gridItems = useMemo(() => calculateVariableGrid(), [calculateVariableGrid]);

  // Group items into rows based on width patterns
  const rows = useMemo(() => {
    type GridItem = typeof gridItems[0];
    const result: GridItem[][] = [];
    let currentRow: GridItem[] = [];
    let currentRowWidth = 0;
    const maxRowWidth = SCREEN_WIDTH - (GALLERY_PADDING * 2);

    gridItems.forEach((item) => {
      const itemTotalWidth = item.width + IMAGE_SPACING;
      
      if (currentRowWidth + itemTotalWidth > maxRowWidth + 1) {
        // Start new row
        if (currentRow.length > 0) {
          result.push(currentRow);
        }
        currentRow = [item];
        currentRowWidth = itemTotalWidth;
      } else {
        // Add to current row
        currentRow.push(item);
        currentRowWidth += itemTotalWidth;
      }
    });

    // Add last row
    if (currentRow.length > 0) {
      result.push(currentRow);
    }

    return result;
  }, [gridItems]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Gallery',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable
              onPress={handleBack}
              style={styles.headerBackButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <IconSymbol 
                ios_icon_name="chevron.left"
                android_material_icon_name="arrow-back"
                size={24} 
                color={colors.text} 
              />
            </Pressable>
          ),
        }}
      />

      {/* Variable Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {rows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((item) => {
              const imageUrl = optimizedUrls[item.index];
              const originalUrl = images[item.index];
              const hasError = imageLoadErrors[item.index];
              
              // Use original URL as fallback if optimized URL is empty
              const displayUrl = imageUrl && imageUrl.trim().length > 0 ? imageUrl : originalUrl;
              
              return (
                <Pressable
                  key={`image-${item.index}`}
                  onPress={() => handleImagePress(item.index)}
                  style={[
                    styles.imageContainer,
                    {
                      width: item.width,
                      height: item.height,
                    },
                  ]}
                >
                  {displayUrl && !hasError ? (
                    <Image
                      source={{ uri: displayUrl }}
                      style={styles.image}
                      contentFit="cover"
                      transition={150}
                      cachePolicy="memory-disk"
                      onError={() => {
                        console.error('[ImageGalleryScreen] Image load error for index', item.index);
                        console.error('[ImageGalleryScreen] Failed URL:', displayUrl);
                        setImageLoadErrors(prev => ({ ...prev, [item.index]: true }));
                      }}
                      onLoad={() => {
                        console.log('[ImageGalleryScreen] Image loaded successfully for index', item.index);
                      }}
                    />
                  ) : (
                    <View style={styles.errorPlaceholder}>
                      <IconSymbol 
                        ios_icon_name="photo"
                        android_material_icon_name="image"
                        size={32} 
                        color={colors.textTertiary} 
                      />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
        
        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBackButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: GALLERY_PADDING,
  },
  row: {
    flexDirection: 'row',
    marginBottom: IMAGE_SPACING,
    gap: IMAGE_SPACING,
  },
  imageContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.cardDark,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  errorPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardDark,
  },
  bottomSpacer: {
    height: 40,
  },
});
