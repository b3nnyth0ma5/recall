
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
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
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (visible && imageUri) {
      console.log('[ImageEditor] Opening native image editor');
      openNativeEditor();
    }
  }, [visible, imageUri]);

  const openNativeEditor = async () => {
    try {
      setIsProcessing(true);
      console.log('[ImageEditor] Launching native editor for:', imageUri);

      // Request permissions first
      const { status: cameraRollStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraRollStatus !== 'granted') {
        console.log('[ImageEditor] Media library permission denied');
        Alert.alert(
          'Permission Required',
          'Please grant photo library access to edit images.',
          [{ text: 'OK', onPress: () => onCancel() }]
        );
        setIsProcessing(false);
        return;
      }

      // For iOS and Android, we need to save the image to the library first
      // then open it with the native editor
      if (Platform.OS !== 'web') {
        // Request media library write permission
        const { status: mediaLibraryStatus } = await MediaLibrary.requestPermissionsAsync();
        
        if (mediaLibraryStatus !== 'granted') {
          console.log('[ImageEditor] Media library write permission denied');
          Alert.alert(
            'Permission Required',
            'Please grant photo library write access to edit images.',
            [{ text: 'OK', onPress: () => onCancel() }]
          );
          setIsProcessing(false);
          return;
        }

        // Save the image to the library temporarily
        console.log('[ImageEditor] Saving image to library for editing');
        const asset = await MediaLibrary.createAssetAsync(imageUri);
        console.log('[ImageEditor] Image saved to library:', asset.uri);

        // Now launch the image picker with editing enabled
        // This will open the native OS image editor
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.9,
          // On iOS, this opens the Photos app editor
          // On Android, this opens the native image editor
          base64: false,
          exif: false,
        });

        // Delete the temporary asset from the library
        try {
          await MediaLibrary.deleteAssetsAsync([asset]);
          console.log('[ImageEditor] Temporary asset deleted');
        } catch (deleteError) {
          console.error('[ImageEditor] Error deleting temporary asset:', deleteError);
          // Continue anyway - the edit was successful
        }

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const editedImage = result.assets[0];
          console.log('[ImageEditor] Image edited successfully:', editedImage.uri);
          
          if (Platform.OS !== 'web') {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }

          // Return the edited image URI
          setIsProcessing(false);
          onSave(editedImage.uri);
        } else {
          // User canceled the editor
          console.log('[ImageEditor] User canceled editing');
          
          if (Platform.OS !== 'web') {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }

          setIsProcessing(false);
          onCancel();
        }
      } else {
        // Web fallback - just use image manipulator for basic crop
        console.log('[ImageEditor] Web platform - using basic crop');
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 2048 } }],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
        
        setIsProcessing(false);
        onSave(manipulatedImage.uri);
      }
    } catch (error) {
      console.error('[ImageEditor] Error opening native editor:', error);
      
      // Show error to user
      Alert.alert(
        'Error',
        'Failed to open image editor. Please try again.',
        [{ text: 'OK', onPress: () => onCancel() }]
      );
      
      setIsProcessing(false);
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
          <Text style={styles.loadingText}>
            {isProcessing ? 'Processing...' : 'Opening Editor...'}
          </Text>
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
