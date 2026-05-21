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
import * as Location from 'expo-location';
import { BlurView } from 'expo-blur';
import { getInitialShareData, listenForShareIntents } from '@/utils/nativeShareReceiver';
import type { ReceivedShareData } from '@/types/ShareExtension';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── helpers ────────────────────────────────────────────────────────────────

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

// ─── skeleton shimmer card ───────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={styles.urlCard}>
      <View style={[styles.skeletonHero, { backgroundColor: colors.cardDark }]} />
      <View style={styles.urlCardBody}>
        <View style={[styles.skeletonLine, { width: '40%', marginBottom: 8 }]} />
        <View style={[styles.skeletonLine, { width: '90%', marginBottom: 6 }]} />
        <View style={[styles.skeletonLine, { width: '70%' }]} />
      </View>
    </View>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function CreateRecallFromShareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams();

  const [text, setText] = useState('');
  const [sharedText, setSharedText] = useState<string | undefined>(undefined);
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
  const [isScrapingUrl, setIsScrapingUrl] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [scrapedMetadata, setScrapedMetadata] = useState<{
    title?: string;
    description?: string;
    imageUrl?: string;
    siteName?: string;
    faviconUrl?: string;
  } | null>(null);

  // ── load initial share data ──────────────────────────────────────────────
  useEffect(() => {
    const loadShareData = async () => {
      try {
        console.log('[CreateRecallFromShare] Loading initial share data...');
        setIsLoadingShareData(true);

        let shareData = await getInitialShareData();

        if (!shareData) {
          // Direct fallback: read App Group container without URL dependency
          console.log('[CreateRecallFromShare] getInitialShareData returned null, trying direct App Group read...');
          const { getSharedData: getRaw, copySharedImages: copyRaw, clearSharedData: clearRaw } = await import('@/utils/shareExtensionModule');
          const raw = await getRaw();
          if (raw) {
            console.log('[CreateRecallFromShare] Direct App Group read succeeded:', {
              hasText: !!raw.text,
              imageCount: raw.images?.length || 0,
              urlCount: raw.urls?.length || 0,
            });
            let copiedImages: string[] = [];
            if (raw.images && raw.images.length > 0) {
              copiedImages = await copyRaw(raw.images);
            }
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const extractedUrls: string[] = raw.text ? (raw.text.match(urlRegex) || []) : [];
            const allUrls = [...(raw.urls || []), ...extractedUrls];
            await clearRaw();
            shareData = {
              text: raw.text,
              images: copiedImages,
              urls: allUrls.length > 0 ? allUrls : undefined,
              videos: raw.videos,
              files: raw.files,
            };
          }
        }

        if (shareData) {
          console.log('[CreateRecallFromShare] Received share data:', {
            hasText: !!shareData.text,
            imageCount: shareData.images?.length || 0,
            urlCount: shareData.urls?.length || 0,
          });

          // Store shared text separately — note field stays empty for user input
          if (shareData.text) {
            setSharedText(shareData.text);
          }
          if (shareData.images && shareData.images.length > 0) {
            setImages(shareData.images);
          }
          if (shareData.urls && shareData.urls.length > 0) {
            setUrls(shareData.urls);
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

  // ── auto-detect GPS location on mount ───────────────────────────────────
  useEffect(() => {
    const autoDetectLocation = async () => {
      console.log('[CreateRecallFromShare] Auto-detecting location...');
      setIsDetectingLocation(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('[CreateRecallFromShare] Location permission denied');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const [geocoded] = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        const name = [geocoded?.name, geocoded?.city, geocoded?.region]
          .filter(Boolean)
          .join(', ');
        const resolvedName =
          name || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        console.log('[CreateRecallFromShare] Auto-detected location:', resolvedName);
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          name: resolvedName,
        });
      } catch {
        console.log('[CreateRecallFromShare] Auto-location failed (non-fatal)');
      } finally {
        setIsDetectingLocation(false);
      }
    };

    autoDetectLocation();
  }, []);

  // ── scrape URL metadata ──────────────────────────────────────────────────
  useEffect(() => {
    const scrapeUrl = async () => {
      if (urls.length === 0) return;

      try {
        console.log('[CreateRecallFromShare] Scraping URL metadata for:', urls[0]);
        setIsScrapingUrl(true);
        const { data, error } = await supabase.functions.invoke('scrape-url-metadata', {
          body: { url: urls[0] },
        });
        if (!error && data) {
          console.log('[CreateRecallFromShare] Scraped metadata:', data);
          setScrapedMetadata(data);
        }
      } catch (err) {
        console.log('[CreateRecallFromShare] URL scraping failed (non-fatal):', err);
      } finally {
        setIsScrapingUrl(false);
      }
    };

    scrapeUrl();
  }, [urls]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── EXIF location fallback (only if GPS failed and no location set) ──────
  useEffect(() => {
    const extractExifLocation = async () => {
      if (images.length === 0 || location) return;
      try {
        const { extractLocationFromImage } = await import('@/utils/imageLocationExtractor');
        for (const imagePath of images) {
          const loc = await extractLocationFromImage(imagePath);
          if (loc) {
            console.log('[CreateRecallFromShare] Extracted EXIF location:', loc);
            setLocation({
              latitude: loc.latitude,
              longitude: loc.longitude,
              name: loc.name || `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`,
            });
            break;
          }
        }
      } catch (err) {
        console.log('[CreateRecallFromShare] EXIF location extraction failed (non-fatal):', err);
      }
    };

    extractExifLocation();
  }, [images]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── listen for foreground share intents ─────────────────────────────────
  useEffect(() => {
    console.log('[CreateRecallFromShare] Setting up share intent listener...');

    const unsubscribe = listenForShareIntents((shareData: ReceivedShareData) => {
      console.log('[CreateRecallFromShare] Received share intent:', {
        hasText: !!shareData.text,
        imageCount: shareData.images?.length || 0,
        urlCount: shareData.urls?.length || 0,
      });

      if (shareData.text) setText(shareData.text);
      if (shareData.images && shareData.images.length > 0) setImages(shareData.images);
      if (shareData.urls && shareData.urls.length > 0) setUrls(shareData.urls);
    });

    return () => {
      console.log('[CreateRecallFromShare] Cleaning up share intent listener');
      unsubscribe();
    };
  }, []);

  // ── watch location-search return params ─────────────────────────────────
  useEffect(() => {
    const lat = params.selectedLatitude;
    const lng = params.selectedLongitude;
    const name = params.selectedLocationName;
    const type = params.selectedPrimaryType;
    if (lat && lng && name) {
      console.log('[CreateRecallFromShare] Location selected from search:', name);
      setLocation({
        latitude: parseFloat(lat as string),
        longitude: parseFloat(lng as string),
        name: name as string,
        primaryType: type as string | undefined,
      });
    }
  }, [params.selectedLatitude, params.selectedLongitude, params.selectedLocationName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── handlers ─────────────────────────────────────────────────────────────

  const handleRemoveImage = useCallback(
    (index: number) => {
      console.log('[CreateRecallFromShare] Remove image at index:', index);
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
    },
    [images, currentImageIndex],
  );

  const handleAddLocation = () => {
    console.log('[CreateRecallFromShare] Navigate to location search');
    router.push('/location-search?from=create-recall-from-share');
  };

  const handleCancel = () => {
    console.log('[CreateRecallFromShare] Cancel pressed');
    router.back();
  };

  const handleSave = async () => {
    console.log('[CreateRecallFromShare] Save pressed');

    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a recall');
      return;
    }

    if (!text.trim() && !sharedText?.trim() && images.length === 0 && urls.length === 0) {
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
      console.log('[CreateRecallFromShare] URLs to persist:', urls);

      // Build final text: user note + shared text + scraped title/description + URLs
      const parts: string[] = [];
      if (text.trim()) parts.push(text.trim());
      if (sharedText?.trim()) parts.push(sharedText.trim());
      const metaParts = [scrapedMetadata?.title, scrapedMetadata?.description].filter(Boolean);
      if (metaParts.length > 0) parts.push(metaParts.join('\n'));
      if (urls.length > 0) parts.push(urls.join('\n'));
      const finalText = parts.join('\n\n');

      console.log('[CreateRecallFromShare] Final text length:', finalText.length);

      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert({
          text: finalText,
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

      if (images.length > 0) {
        setSavingStage('Uploading Images...');
        console.log('[CreateRecallFromShare] Uploading', images.length, 'images...');

        if (images[0]) {
          try {
            const firstImageId = await uploadImageToDatabase(images[0], recallData.id, 'image/jpeg');
            if (firstImageId) {
              console.log('[CreateRecallFromShare] First image uploaded:', firstImageId);
            }
          } catch (error) {
            console.error('[CreateRecallFromShare] Error uploading first image:', error);
          }
        }

        if (images.length > 1) {
          (async () => {
            for (let i = 1; i < images.length; i++) {
              try {
                const imageId = await uploadImageToDatabase(images[i], recallData.id, 'image/jpeg');
                if (imageId) {
                  console.log(`[CreateRecallFromShare] Image ${i + 1} uploaded:`, imageId);
                }
              } catch (error) {
                console.error(`[CreateRecallFromShare] Error uploading image ${i + 1}:`, error);
              }
            }

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
      router.replace('/(tabs)/(home)');
    } catch (error) {
      console.error('[CreateRecallFromShare] Error saving recall:', error);
      Alert.alert('Error', 'Failed to save recall. Please try again.');
    } finally {
      setIsSaving(false);
      setSavingStage('');
    }
  };

  // ── derived state ─────────────────────────────────────────────────────────

  const hasUrlAndImages = urls.length > 0 && images.length > 0;
  const showFromSection = urls.length > 0 || images.length > 0;

  const locationIconName = location ? 'location.fill' : 'location';
  const locationText = isDetectingLocation
    ? 'Detecting location...'
    : location
    ? location.name
    : 'Add Location';
  const locationColor = location ? colors.primary : '#FFFFFF';

  // ── loading state ─────────────────────────────────────────────────────────

  if (isLoadingShareData) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading shared content...</Text>
        </View>
      </View>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <Pressable onPress={handleCancel} style={styles.cancelButton} disabled={isSaving}>
            <IconSymbol
              ios_icon_name="xmark"
              android_material_icon_name="close"
              size={20}
              color="#FFFFFF"
            />
          </Pressable>

          <Text style={styles.headerTitle}>Save to Recall</Text>

          <Pressable
            onPress={handleSave}
            style={styles.savePill}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.savePillText}>
                Save
              </Text>
            )}
          </Pressable>
        </View>

        {/* ── Scroll content ── */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── FROM section ── */}
          {showFromSection && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>From</Text>

              {/* Image carousel (shown first when both images + URL present) */}
              {images.length > 0 && (
                <View style={styles.carouselWrapper}>
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
                          style={styles.carouselImage}
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
                    <View style={styles.pageDots}>
                      {images.map((_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.dot,
                            index === currentImageIndex && styles.dotActive,
                          ]}
                        />
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* URL card */}
              {urls.length > 0 && (
                <>
                  {isScrapingUrl ? (
                    <SkeletonCard />
                  ) : scrapedMetadata ? (
                    hasUrlAndImages ? (
                      /* Compact card when images are also present */
                      <View style={styles.urlCard}>
                        <View style={styles.compactCardRow}>
                          {scrapedMetadata.imageUrl ? (
                            <Image
                              source={{ uri: scrapedMetadata.imageUrl }}
                              style={styles.compactThumbnail}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={[styles.compactThumbnail, styles.compactThumbnailFallback]}>
                              <IconSymbol
                                ios_icon_name="globe"
                                android_material_icon_name="language"
                                size={24}
                                color={colors.textTertiary}
                              />
                            </View>
                          )}
                          <View style={styles.compactCardText}>
                            {scrapedMetadata.siteName ? (
                              <Text style={styles.siteNameText} numberOfLines={1}>
                                {scrapedMetadata.siteName}
                              </Text>
                            ) : null}
                            {scrapedMetadata.title ? (
                              <Text style={styles.cardTitle} numberOfLines={2}>
                                {scrapedMetadata.title}
                              </Text>
                            ) : (
                              <Text style={styles.domainChipText} numberOfLines={1}>
                                {getDomain(urls[0])}
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                    ) : (
                      /* Full card when no images */
                      <View style={styles.urlCard}>
                        {scrapedMetadata.imageUrl ? (
                          <Image
                            source={{ uri: scrapedMetadata.imageUrl }}
                            style={styles.heroImage}
                            resizeMode="cover"
                          />
                        ) : null}
                        <View style={styles.urlCardBody}>
                          <View style={styles.siteNameRow}>
                            <IconSymbol
                              ios_icon_name="globe"
                              android_material_icon_name="language"
                              size={12}
                              color={colors.textTertiary}
                            />
                            <Text style={styles.siteNameText} numberOfLines={1}>
                              {scrapedMetadata.siteName || getDomain(urls[0])}
                            </Text>
                          </View>
                          {scrapedMetadata.title ? (
                            <Text style={styles.cardTitle} numberOfLines={2}>
                              {scrapedMetadata.title}
                            </Text>
                          ) : null}
                          {scrapedMetadata.description ? (
                            <Text style={styles.cardDescription} numberOfLines={2}>
                              {scrapedMetadata.description}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    )
                  ) : (
                    /* Domain chip fallback — no metadata yet */
                    <View style={styles.domainChip}>
                      <IconSymbol
                        ios_icon_name="link"
                        android_material_icon_name="link"
                        size={14}
                        color={colors.textTertiary}
                      />
                      <Text style={styles.domainChipText} numberOfLines={1}>
                        {getDomain(urls[0])}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* ── NOTE section ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Note</Text>
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={(val) => {
                console.log('[CreateRecallFromShare] Note text changed, length:', val.length);
                setText(val);
              }}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.textTertiary}
              multiline
              textAlignVertical="top"
              editable={!isSaving}
            />
          </View>

          {/* ── LOCATION section ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Location</Text>
            <Pressable
              style={styles.locationRow}
              onPress={handleAddLocation}
              disabled={isSaving || isDetectingLocation}
            >
              <View style={styles.locationLeft}>
                {isDetectingLocation ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <IconSymbol
                    ios_icon_name={locationIconName}
                    android_material_icon_name="location-on"
                    size={20}
                    color={locationColor}
                  />
                )}
                <Text
                  style={[styles.locationText, location && styles.locationTextActive]}
                  numberOfLines={1}
                >
                  {locationText}
                </Text>
              </View>
              {location && !isDetectingLocation && (
                <Text style={styles.changeText}>Change</Text>
              )}
            </Pressable>
          </View>

          {/* ── Empty state fallback ── */}
          {!isLoadingShareData && images.length === 0 && urls.length === 0 && !sharedText && (
            <View style={styles.emptyState}>
              <IconSymbol
                ios_icon_name="exclamationmark.circle"
                android_material_icon_name="error"
                size={32}
                color={colors.textTertiary}
              />
              <Text style={styles.emptyStateText}>No content received — try sharing again</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Saving overlay ── */}
        {isSaving && (
          <View style={styles.savingOverlay}>
            <View style={styles.savingCard}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.savingText}>{savingStage || 'Saving...'}</Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

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

  // Header
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
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  savePill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  savePillText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 24,
  },

  // Section
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 0,
  },

  // Image carousel
  carouselWrapper: {
    gap: 10,
  },
  imageContainer: {
    width: SCREEN_WIDTH - 32,
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.cardDark,
  },
  carouselImage: {
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
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textTertiary,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },

  // URL card (full)
  urlCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  heroImage: {
    height: 180,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: '100%',
  },
  urlCardBody: {
    padding: 12,
    gap: 4,
  },
  siteNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  siteNameText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 20,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },

  // Compact URL card (when images also present)
  compactCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  compactThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  compactThumbnailFallback: {
    backgroundColor: colors.cardDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCardText: {
    flex: 1,
    gap: 4,
  },

  // Domain chip fallback
  domainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  domainChipText: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Skeleton
  skeletonHero: {
    height: 140,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.cardDark,
  },

  // Note input
  textInput: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    minHeight: 100,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Location
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  locationText: {
    fontSize: 15,
    color: colors.textSecondary,
    flex: 1,
  },
  locationTextActive: {
    color: colors.text,
    fontWeight: '500',
  },
  changeText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
    marginLeft: 8,
  },

  // Saving overlay
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savingCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savingText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 15,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
