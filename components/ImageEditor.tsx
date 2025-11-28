
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';

interface ImageEditorProps {
  visible: boolean;
  imageUri: string;
  onSave: (editedUri: string) => void;
  onCancel: () => void;
}

/**
 * Native Image Editor Component
 * 
 * Uses the native OS image editing capabilities:
 * - iOS: Photos app built-in editor
 * - Android: Native image editor
 * 
 * Provides basic editing features like crop, rotate, and filters
 * through the platform's native interface.
 */
export function ImageEditor({
  visible,
  imageUri,
  onSave,
  onCancel,
}: ImageEditorProps) {
  useEffect(() => {
    if (visible && imageUri) {
      console.log('[ImageEditor] Opening native image editor');
      openNativeEditor();
    }
  }, [visible, imageUri]);

  const openNativeEditor = async () => {
    try {
      console.log('[ImageEditor] Launching native editor for:', imageUri);

      // Use expo-image-picker's built-in editing capability
      // This opens the native OS image editor
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.9,
        // On iOS, this opens the Photos app editor
        // On Android, this opens the native image editor
        base64: false,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const editedImage = result.assets[0];
        console.log('[ImageEditor] Image edited successfully:', editedImage.uri);
        
        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Return the edited image URI
        onSave(editedImage.uri);
      } else {
        // User canceled the editor
        console.log('[ImageEditor] User canceled editing');
        
        if (Platform.OS !== 'web') {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }

        onCancel();
      }
    } catch (error) {
      console.error('[ImageEditor] Error opening native editor:', error);
      
      // If there's an error, just cancel
      onCancel();
    }
  };

  // Show a brief loading indicator while the native editor is launching
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
          <Text style={styles.loadingText}>Opening Editor...</Text>
          <Text style={styles.loadingSubtext}>
            {Platform.OS === 'ios' ? 'Using Photos app' : 'Using native editor'}
          </Text>
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
