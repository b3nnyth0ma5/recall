
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from 'react-native';
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
 * 
 * Layout Pattern:
 * - Dynamic grid with varying image sizes
 * - Some images span 2 columns, others are single column
 * - Heights vary to create visual interest
 */
export default function ImageGalleryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse images from params (passed as JSON string)
  const images = useMemo(() => {
    try {
      return params.images ? JSON.parse(params.images as string) : [];
    } catch (error) {
      console.error('[ImageGalleryScreen] Error parsing images:', error);
      return [];
    }
  }, [params.images]);
  
  const imageIds = useMemo(() => {
    try {
      return params.imageIds ? JSON.parse(params.imageIds as string) : undefined;
    } catch (error) {
      console.error('[ImageGalleryScreen] Error parsing imageIds:', error);
      return undefined;
    }
  }, [params.imageIds]);
  
  const initialIndex = useMemo(() => {
    return params.initialIndex ? parseInt(params.initialIndex as string) : 0;
  }, [params.initialIndex]);
  
  const [optimizedUrls, setOptimizedUrls] = useState<string[]>([]);

  // Generate optimized URLs immediately
  useEffect(() => {
    if (images.length > 0) {
      console.log('[ImageGalleryScreen] Generating optimized URLs for', images.length, 'images');
      
      // Generate optimized URLs for all images
      const optimized = images.map((imageUrl: string) => {
        if (!imageUrl) {
          return '';
        }
        
        return getOptimizedCloudflareUrl(imageUrl, {
          width: Math.round(SCREEN_WIDTH * 0.8),
          quality: 85,
          fit: 'cover',
          format: 'webp',
        });
      });
      
      setOptimizedUrls(optimized);
      console.log('[ImageGalleryScreen] Setup complete');
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
    // Pattern repeats every 6 images for consistency
    const patterns = [
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

    optimizedUrls.forEach((_, index) => {
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
    });

    return items;
  }, [optimizedUrls]);

  const gridItems = useMemo(() => calculateVariableGrid(), [calculateVariableGrid]);

  // Group items into rows based on width patterns
  const rows = useMemo(() => {
    const result: (typeof gridItems[0])[][] = [];
    let currentRow: (typeof gridItems[0])[] = [];
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
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    resizeMode="cover"
                  />
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
  bottomSpacer: {
    height: 40,
  },
});
