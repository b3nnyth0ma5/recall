
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import { PESDK, Configuration } from 'react-native-photoeditorsdk';
import * as FileSystem from 'expo-file-system/legacy';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';

interface ImageEditorProps {
  visible: boolean;
  imageUri: string;
  onSave: (editedUri: string) => void;
  onCancel: () => void;
}

/**
 * Image Editor Component using IMG.LY PhotoEditor SDK
 * 
 * Provides professional image editing capabilities including:
 * - Crop with various aspect ratios
 * - Rotate and flip
 * - Filters and adjustments
 * - Text and stickers
 * - Drawing tools
 * - And much more
 * 
 * Documentation: https://github.com/imgly/catalog-react-native
 */
export function ImageEditor({
  visible,
  imageUri,
  onSave,
  onCancel,
}: ImageEditorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    if (visible) {
      console.log('[ImageEditor] Opening IMG.LY PhotoEditor SDK');
      setEditorReady(true);
      openPhotoEditor();
    }
  }, [visible, imageUri]);

  const openPhotoEditor = async () => {
    if (isProcessing) {
      console.log('[ImageEditor] Editor already processing, skipping');
      return;
    }

    try {
      setIsProcessing(true);

      // Prepare the image URI for the editor
      let editorImageUri = imageUri;

      // For content:// URIs (Android), copy to cache first
      if (Platform.OS === 'android' && imageUri.startsWith('content://')) {
        console.log('[ImageEditor] Converting Android content URI to file URI');
        const filename = `editor_input_${Date.now()}.jpg`;
        const destUri = `${FileSystem.cacheDirectory}${filename}`;
        
        try {
          await FileSystem.copyAsync({
            from: imageUri,
            to: destUri,
          });
          editorImageUri = destUri;
          console.log('[ImageEditor] Converted to:', editorImageUri);
        } catch (copyError) {
          console.error('[ImageEditor] Error copying content URI:', copyError);
          // Try to use the original URI
          editorImageUri = imageUri;
        }
      }

      // Configure the PhotoEditor SDK
      const configuration: Configuration = {
        // Export settings
        export: {
          image: {
            exportType: 1, // JPEG
            quality: 0.9,
          },
        },
        
        // Enable/disable features
        tools: [
          'transform', // Crop, rotate, flip
          'filter',    // Photo filters
          'adjustment', // Brightness, contrast, saturation, etc.
          'text',      // Add text
          'sticker',   // Add stickers
          'brush',     // Drawing tools
          'focus',     // Focus effects
          'overlay',   // Color overlays
          'frame',     // Photo frames
        ],

        // Transform tool configuration
        transform: {
          items: [
            { identifier: 'imgly_transform_common_custom', name: 'Custom' },
            { identifier: 'imgly_transform_common_square', name: 'Square' },
            { identifier: 'imgly_transform_common_4-3', name: '4:3' },
            { identifier: 'imgly_transform_common_16-9', name: '16:9' },
            { identifier: 'imgly_transform_common_3-2', name: '3:2' },
          ],
        },

        // Theme configuration
        theme: {
          // Customize colors to match your app
          primaryColor: colors.primary,
          backgroundColor: colors.background,
          surfaceColor: colors.card,
        },
      };

      console.log('[ImageEditor] Opening PhotoEditor SDK with image:', editorImageUri);

      // Open the PhotoEditor SDK
      const result = await PESDK.openEditor(editorImageUri, configuration);

      console.log('[ImageEditor] PhotoEditor SDK result:', result);

      if (result && result.image) {
        // User saved the edited image
        console.log('[ImageEditor] Image edited successfully:', result.image);
        
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Return the edited image URI
        onSave(result.image);
      } else {
        // User canceled the editor
        console.log('[ImageEditor] User canceled editing');
        
        if (Platform.OS !== 'web') {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        onCancel();
      }
    } catch (error) {
      console.error('[ImageEditor] Error opening PhotoEditor SDK:', error);
      
      // Show user-friendly error message
      Alert.alert(
        'Editor Error',
        'Failed to open the image editor. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => onCancel(),
          },
        ]
      );
    } finally {
      setIsProcessing(false);
      setEditorReady(false);
    }
  };

  // The IMG.LY SDK opens as a native modal, so we don't need to render much here
  // Just show a loading indicator while the SDK is initializing
  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Opening Image Editor...</Text>
          <Text style={styles.loadingSubtext}>Powered by IMG.LY PhotoEditor SDK</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 250,
    boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  loadingText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  loadingSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
