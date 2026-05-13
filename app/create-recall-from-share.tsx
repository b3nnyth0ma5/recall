/**
 * Create Recall from Share Screen
 * 
 * This screen handles creating a recall from shared content (images, text, URLs)
 * received from other apps via share intents.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadImageToDatabase } from '@/utils/supabase';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { getInitialShareData, listenForShareIntents } from '@/utils/nativeShareReceiver';
import type { ReceivedShareData } from '@/types/ShareExtension';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CreateRecallFromShareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [savingStage, setSavingStage] = useState('');
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    name: string;
    primaryType?: string;
  } | null>(null);
  const [isLoadingShareData, setIsLoadingShareData] = useState(true);

  // Load initial share data
  useEffect(() => {
    const loadShareData = async () => {
      try {
        console.log('[CreateRecallFromShare] Loading initial share data...');
        setIsLoadingShareData(true);

        const shareData = await getInitialShareData();
        if (shareData) {
          console.log('[CreateRecallFromShare] Received share data:', {
            hasText: !!shareData.text,
            imageCount: shareData.images?.length || 0,
            urlCount: shareData.urls?.length || 0,
          });

          if (shareData.text) {
            setText(shareData.text);
          }
          if (shareData.images && shareData.images.length > 0) {
            setImages(shareData.images);
          }
          if (shareData.urls && shareData.urls.length > 0) {
            setUrls(shareData.urls);
            // If we have URLs but no text, add them to the text
            if (!shareData.text) {
              setText(shareData.urls.join('\n'));
            }
          }
        } else {
          console.log('[CreateRecallFromShare] No initial share data found');
        }
      } catch (error) {
        console.error('[CreateRecallFromShare] Error loading share data:', error);
      } finally {
        setIsLoadingShareData(false);
      }
    };

    loadShareData();
  }, []);

  // Listen for share intents while screen is active
  useEffect(() => {
    console.log('[CreateRecallFromShare] Setting up share intent listener...');

    const unsubscribe = listenForShareIntents((shareData: ReceivedShareData) => {
      console.log('[CreateRecallFromShare] Received share intent:', {
        hasText: !!shareData.text,
        imageCount: shareData.images?.length || 0,
        urlCount: shareData.urls?.length || 0,
      });

      if (shareData.text) {
        setText(shareData.text);
      }
      if (shareData.images && shareData.images.length > 0) {
        setImages(shareData.images);
      }
      if (shareData.urls && shareData.urls.length > 0) {
        setUrls(shareData.urls);
        if (!shareData.text) {
          setText(shareData.urls.join('\n'));
        }
      }
    });

    return () => {
      console.log('[CreateRecallFromShare] Cleaning up share intent listener');
      unsubscribe();
    };
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);

    if (currentImageIndex >= newImages.length && newImages.length > 0) {
      setCurrentImageIndex(newImages.length - 1);
    } else if (newImages.length === 0) {
      setCurrentImageIndex(0);
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [images, currentImageIndex]);

  const handleAddLocation = () => {
    router.push('/location-search?from=create-recall-from-share');
  };

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a recall');
      return;
    }

    if (!text.trim() && images.length === 0) {
      Alert.alert('Error', 'Please add some content before saving');
      return;
    }

    try {
      setIsSaving(true);
      setSavingStage('Creating Recall...');

      console.log('[CreateRecallFromShare] Creating recall...');
      console.log('[CreateRecallFromShare] Text length:', text.length);
      console.log('[CreateRecallFromShare] Number of images:', images.length);
      console.log('[CreateRecallFromShare] Has location:', !!location);

      // Create the recall
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert({
          text: text.trim(),
          user_id: user.id,
          latitude: location?.latitude,
          longitude: location?.longitude,
          location: location?.name,
          location_primary_type: location?.primaryType || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (recallError) {
        console.error('[CreateRecallFromShare] Error creating recall:', recallError);
        Alert.alert('Error', 'Failed to create recall');
        return;
      }

      console.log('[CreateRecallFromShare] Recall created with ID:', recallData.id);

      // Upload images
      if (images.length > 0) {
        setSavingStage('Uploading Images...');
        console.log('[CreateRecallFromShare] Uploading', images.length, 'images...');

        // Upload first image synchronously
        if (images[0]) {
          try {
            const firstImageId = await uploadImageToDatabase(
              images[0],
              recallData.id,
              'image/jpeg'
            );
            if (firstImageId) {
              console.log('[CreateRecallFromShare] First image uploaded:', firstImageId);
            }
          } catch (error) {
            console.error('[CreateRecallFromShare] Error uploading first image:', error);
          }
        }

        // Upload remaining images asynchronously
        if (images.length > 1) {
          (async () => {
            for (let i = 1; i < images.length; i++) {
              try {
                const imageId = await uploadImageToDatabase(
                  images[i],
                  recallData.id,
                  'image/jpeg'
                );
                if (imageId) {
                  console.log(`[CreateRecallFromShare] Image ${i + 1} uploaded:`, imageId);
                }
              } catch (error) {
                console.error(`[CreateRecallFromShare] Error uploading image ${i + 1}:`, error);
              }
            }

            // Trigger category matching after all images are uploaded
            console.log('[CreateRecallFromShare] Triggering category matching...');
            try {
              await supabase.functions.invoke('match-recollection-category', {
                body: { recallId: recallData.id },
              });
            } catch (error) {
              console.error('[CreateRecallFromShare] Error in category matching:', error);
            }
          })();
        }
      } else {
        // No images - trigger category matching immediately
        (async () => {
          console.log('[CreateRecallFromShare] Triggering category matching (no images)...');
          try {
            await supabase.functions.invoke('match-recollection-category', {
              body: { recallId: recallData.id },
            });
          } catch (error) {
            console.error('[CreateRecallFromShare] Error in category matching:', error);
          }
        })();
      }

      setSavingStage('Finalizing...');

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      console.log('[CreateRecallFromShare] Recall created successfully');

      // Navigate back to home
      router.replace('/(tabs)/(home)');
    } catch (error) {
      console.error('[CreateRecallFromShare] Error saving recall:', error);
      Alert.alert('Error', 'Failed to save recall. Please try again.');
    } finally {
      setIsSaving(false);
      setSavingStage('');
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoadingShareData) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading shared content...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={handleCancel} style={styles.headerButton} disabled={isSaving}>
            <IconSymbol
              ios_icon_name="xmark"
              android_material_icon_name="close"
              size={24}
              color={colors.text}
            />
          </Pressable>

          <Text style={styles.headerTitle}>Create from Share</Text>

          <Pressable
            onPress={handleSave}
            style={[styles.headerButton, styles.saveButton]}
            disabled={isSaving || (!text.trim() && images.length === 0)}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text
                style={[
                  styles.saveButtonText,
                  (!text.trim() && images.length === 0) && styles.saveButtonTextDisabled,
                ]}
              >
                Save
              </Text>
            )}
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Images */}
          {images.length > 0 && (
            <View style={styles.imagesSection}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={(event) => {
                  const offsetX = event.nativeEvent.contentOffset.x;
                  const index = Math.round(offsetX / (SCREEN_WIDTH - 32));
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
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              placeholder="Add a note about this shared content..."
              placeholderTextColor={colors.textTertiary}
              multiline
              textAlignVertical="top"
              editable={!isSaving}
            />
          </View>

          {/* Location */}
          <View style={styles.locationSection}>
            <Pressable
              style={styles.locationButton}
              onPress={handleAddLocation}
              disabled={isSaving}
            >
              <IconSymbol
                ios_icon_name="location.fill"
                android_material_icon_name="location-on"
                size={20}
                color={location ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.locationButtonText,
                  location && styles.locationButtonTextActive,
                ]}
              >
                {location ? location.name : 'Add Location'}
              </Text>
            </Pressable>
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

        {/* Saving Overlay */}
        {isSaving && (
          <View style={styles.savingOverlay}>
            <View style={styles.savingContent}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.savingText}>{savingStage || 'Saving...'}</Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoid: {
    flex: 1,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    alignItems: 'flex-end',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  saveButtonTextDisabled: {
    color: colors.textTertiary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  imagesSection: {
    marginBottom: 16,
  },
  imageContainer: {
    width: SCREEN_WIDTH - 32,
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
    marginBottom: 16,
  },
  textInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    minHeight: 150,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationSection: {
    marginBottom: 16,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  locationButtonTextActive: {
    color: colors.primary,
    fontWeight: '500',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: colors.cardDark,
    borderRadius: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 18,
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savingContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  savingText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
});
