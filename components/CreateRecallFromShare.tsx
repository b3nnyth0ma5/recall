
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import Animated, { FadeInDown, FadeIn, SlideInDown } from 'react-native-reanimated';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import { BlurView } from 'expo-blur';

interface CreateRecallFromShareProps {
  visible: boolean;
  sharedText?: string;
  sharedImages?: string[];
  onSave: (text: string, images: string[]) => Promise<void>;
  onClose: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function CreateRecallFromShare({
  visible,
  sharedText = '',
  sharedImages = [],
  onSave,
  onClose,
}: CreateRecallFromShareProps) {
  const [text, setText] = useState(sharedText);
  const [images, setImages] = useState<string[]>(sharedImages);
  const [isSaving, setIsSaving] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setText(sharedText);
  }, [sharedText]);

  useEffect(() => {
    setImages(sharedImages);
  }, [sharedImages]);

  const handleSave = async () => {
    if (!text.trim() && images.length === 0) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(text, images);
    } catch (error) {
      console.error('Error saving recall:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
    
    if (currentImageIndex >= newImages.length && newImages.length > 0) {
      setCurrentImageIndex(newImages.length - 1);
    } else if (newImages.length === 0) {
      setCurrentImageIndex(0);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <Animated.View 
      entering={FadeIn.duration(200)}
      style={styles.overlay}
    >
      <Pressable 
        style={styles.backdrop} 
        onPress={onClose}
      />
      
      <Animated.View 
        entering={SlideInDown.duration(300).springify()}
        style={styles.panel}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.dragHandle} />
            <Text style={styles.headerTitle}>Create Recall from Share</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              disabled={isSaving}
            >
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView 
            style={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Images */}
            {images.length > 0 && (
              <View style={styles.imagesSection}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  pagingEnabled
                  onScroll={(event) => {
                    const offsetX = event.nativeEvent.contentOffset.x;
                    const index = Math.round(offsetX / (Dimensions.get('window').width - 48));
                    setCurrentImageIndex(index);
                  }}
                  scrollEventThrottle={16}
                >
                  {images.map((imageUri, index) => (
                    <View key={index} style={styles.imageContainer}>
                      <Image
                        source={{ uri: imageUri }}
                        style={styles.image}
                        resizeMode="cover"
                      />
                      <Pressable
                        style={styles.removeImageButton}
                        onPress={() => handleRemoveImage(index)}
                      >
                        <BlurView intensity={80} style={styles.removeImageBlur}>
                          <IconSymbol
                            ios_icon_name="xmark.circle.fill"
                            android_material_icon_name="cancel"
                            size={28}
                            color={colors.text}
                          />
                        </BlurView>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                
                {images.length > 1 && (
                  <View style={styles.imageIndicators}>
                    {images.map((_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.indicator,
                          index === currentImageIndex && styles.indicatorActive,
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Text Input */}
            <View style={styles.textSection}>
              <Text style={styles.label}>Note</Text>
              <TextInput
                style={styles.textInput}
                value={text}
                onChangeText={setText}
                placeholder="Add a note about this shared content..."
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
                autoFocus={!sharedText}
              />
            </View>

            {/* Info */}
            <View style={styles.infoSection}>
              <IconSymbol
                ios_icon_name="info.circle"
                android_material_icon_name="info"
                size={16}
                color={colors.textTertiary}
              />
              <Text style={styles.infoText}>
                This content was shared from another app. You can edit it before saving.
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={isSaving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[
                styles.button,
                styles.saveButton,
                (!text.trim() && images.length === 0) && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={isSaving || (!text.trim() && images.length === 0)}
            >
              {isSaving ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Recall</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 20,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dragHandle: {
    position: 'absolute',
    top: 8,
    width: 40,
    height: 4,
    backgroundColor: colors.textTertiary,
    borderRadius: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 8,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  imagesSection: {
    marginTop: 20,
    marginBottom: 16,
  },
  imageContainer: {
    width: Dimensions.get('window').width - 48,
    height: 280,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.cardDark,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  removeImageBlur: {
    padding: 4,
    borderRadius: 20,
  },
  imageIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
  },
  indicatorActive: {
    backgroundColor: colors.primary,
    width: 20,
  },
  textSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.cardDark,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    minHeight: 120,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: colors.cardDark,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: colors.cardDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonDisabled: {
    backgroundColor: colors.inactive,
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
