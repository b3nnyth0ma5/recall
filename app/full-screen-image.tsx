
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { FullScreenImage } from '@/components/FullScreenImage';

/**
 * Full Screen Image Route
 * 
 * This route displays a single image in full screen with zoom capabilities.
 * It's opened from the ImageGallery when a user taps an image.
 */
export default function FullScreenImageRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse images from params
  const images = useMemo(() => {
    try {
      return params.images ? JSON.parse(params.images as string) : [];
    } catch (error) {
      console.error('[FullScreenImageRoute] Error parsing images:', error);
      return [];
    }
  }, [params.images]);
  
  const imageIds = useMemo(() => {
    try {
      return params.imageIds ? JSON.parse(params.imageIds as string) : undefined;
    } catch (error) {
      console.error('[FullScreenImageRoute] Error parsing imageIds:', error);
      return undefined;
    }
  }, [params.imageIds]);
  
  const initialIndex = useMemo(() => {
    return params.initialIndex ? parseInt(params.initialIndex as string) : 0;
  }, [params.initialIndex]);

  const [visible, setVisible] = useState(true);

  const handleClose = () => {
    console.log('[FullScreenImageRoute] Closing full screen image');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVisible(false);
    // Navigate back to gallery
    router.back();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'fade',
        }}
      />
      
      <FullScreenImage
        visible={visible}
        images={images}
        imageIds={imageIds}
        initialIndex={initialIndex}
        onClose={handleClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
