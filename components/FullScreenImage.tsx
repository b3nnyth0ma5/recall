
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { IconSymbol } from './IconSymbol';
import ImageOCRDisplay from './ImageOCRDisplay';
import { colors } from '@/styles/commonStyles';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { getImageDataUrl, getDocumentSignedUrl } from '@/utils/supabase';
import { SkeletonLoader } from './SkeletonLoader';
import { Document } from '@/types/Document';
import { formatFileSize, getFileExtension, getDocumentColor } from '@/utils/documentPicker';
// Lucide share icon — non-negotiable per spec
import { Share } from 'lucide-react-native';

type MediaItem =
  | { kind: 'image'; url: string; id?: string }
  | { kind: 'document'; doc: Document };

interface FullScreenImageProps {
  visible: boolean;
  images?: string[];
  imageIds?: string[];
  media?: MediaItem[];
  initialIndex?: number;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Threshold for dismissing the modal (swipe down distance)
const DISMISS_THRESHOLD = 100;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

/**
 * Standalone full-screen image viewer component with integrated OCR functionality
 * 
 * Features:
 * - Full-screen image carousel with smooth scrolling
 * - Pinch-to-zoom and pan per image slide
 * - Double-tap to toggle zoom
 * - OCR button always visible and clickable on top of images
 * - Share image/document using native share functionality
 * - Swipe down to dismiss with improved gesture handling (no refresh on close)
 * - Image counter and pagination dots
 * - OCR modal for viewing image/document analysis
 * - Reusable across NoteCard and note-editor
 * - Loads all images from imageIds when opened
 * - Skeleton placeholders instead of loading spinner
 * - "Tap to preview" pill overlay for document slides
 */

interface ZoomableImageProps {
  imageUrl: string;
  index: number;
  isLoaded: boolean;
  onLoad: (index: number) => void;
  resetTrigger: number;
}

function ZoomableImage({ imageUrl, index, isLoaded, onLoad, resetTrigger }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Reset zoom when resetTrigger changes (i.e. when currentImageIndex changes)
  useEffect(() => {
    scale.value = withTiming(1, { duration: 200 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTrigger]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const newScale = savedScale.value * event.scale;
      scale.value = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE);
        savedScale.value = MIN_SCALE;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_event, stateManager) => {
      if (scale.value > 1) {
        stateManager.activate();
      } else {
        stateManager.fail();
      }
    })
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composedGesture = Gesture.Race(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.imageWrapper}>
        {imageUrl ? (
          <>
            {!isLoaded && (
              <View style={styles.skeletonContainer}>
                <SkeletonLoader
                  width={SCREEN_WIDTH}
                  height={SCREEN_HEIGHT}
                  borderRadius={0}
                  variant="wave"
                />
              </View>
            )}
            <Animated.Image
              source={{ uri: imageUrl }}
              style={[styles.image, animatedImageStyle]}
              resizeMode="contain"
              onLoad={() => onLoad(index)}
            />
          </>
        ) : (
          <View style={styles.skeletonContainer}>
            <SkeletonLoader
              width={SCREEN_WIDTH}
              height={SCREEN_HEIGHT}
              borderRadius={0}
              variant="wave"
            />
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

// ─── Tap-to-preview pill ────────────────────────────────────────────────────

interface TapToPreviewPillProps {
  onPress: () => void;
  isOpening: boolean;
}

function TapToPreviewPill({ onPress, isOpening }: TapToPreviewPillProps) {
  const pillScale = useSharedValue(1);

  const handlePress = () => {
    console.log('[FullScreenImage] Tap to preview pill pressed');
    pillScale.value = withSpring(0.96, { damping: 15, stiffness: 300 }, () => {
      pillScale.value = withSpring(1, { damping: 15, stiffness: 300 });
    });
    onPress();
  };

  const animatedPillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pillScale.value }],
  }));

  const labelText = isOpening ? 'Opening…' : 'Tap to preview';

  return (
    <Animated.View style={[styles.tapToPreviewPill, animatedPillStyle]}>
      <Pressable
        onPress={handlePress}
        disabled={isOpening}
        style={styles.tapToPreviewPressable}
        accessibilityLabel="Tap to preview document"
        accessibilityRole="button"
      >
        {isOpening ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <IconSymbol name="arrow.down.circle" size={22} color="#FFFFFF" />
        )}
        <Text style={styles.tapToPreviewLabel}>{labelText}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function FullScreenImage({
  visible,
  images = [],
  imageIds,
  media,
  initialIndex = 0,
  onClose,
}: FullScreenImageProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(initialIndex);
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [imageLoadStates, setImageLoadStates] = useState<{ [key: number]: boolean }>({});
  const [openingDocument, setOpeningDocument] = useState(false);
  // resetTrigger increments whenever currentImageIndex changes to reset zoom in each slide
  const [resetTrigger, setResetTrigger] = useState(0);
  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  // Animated values for swipe-to-dismiss gesture
  const translateY = useSharedValue(0);
  const contextY = useSharedValue(0);

  // Build the effective media array — prefer `media` prop, fall back to images array
  const effectiveMedia: MediaItem[] = media && media.length > 0
    ? media
    : images.map((url, i) => ({ kind: 'image' as const, url, id: imageIds?.[i] }));

  // Load all images when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentImageIndex(initialIndex);
      setIsClosing(false);
      // Reset animation values immediately
      translateY.value = 0;
      contextY.value = 0;
      
      // Load all images from imageIds if available
      const loadAllImages = async () => {
        if (imageIds && imageIds.length > 0) {
          console.log('[FullScreenImage] Loading all images from imageIds');
          setIsLoadingImages(true);
          
          try {
            const imagePromises = imageIds.map(async (imageId, index) => {
              try {
                const imageUrl = await getImageDataUrl(imageId);
                return imageUrl || images[index] || '';
              } catch (error) {
                console.error(`[FullScreenImage] Error loading image ${index}:`, error);
                return images[index] || '';
              }
            });
            
            const allImages = await Promise.all(imagePromises);
            setLoadedImages(allImages);
            console.log('[FullScreenImage] Successfully loaded all images');
          } catch (error) {
            console.error('[FullScreenImage] Error loading images:', error);
            // Fallback to original images array
            setLoadedImages(images);
          } finally {
            setIsLoadingImages(false);
          }
        } else {
          // No imageIds, use images array directly
          console.log('[FullScreenImage] Using images array directly');
          setLoadedImages(images);
        }
      };
      
      loadAllImages();
      
      // Scroll to initial index after a short delay to ensure layout is ready
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: initialIndex * SCREEN_WIDTH,
          y: 0,
          animated: false,
        });
      }, 100);
    }
  }, [visible, initialIndex, images, imageIds, translateY, contextY]);

  // Reset zoom on all slides when the active index changes
  useEffect(() => {
    setResetTrigger(prev => prev + 1);
  }, [currentImageIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    if (index !== currentImageIndex && index >= 0 && index < effectiveMedia.length) {
      setCurrentImageIndex(index);
    }
  };

  const handleOCRButtonPress = () => {
    console.log('[FullScreenImage] Analysis button pressed for index:', currentImageIndex, 'isDocument:', isCurrentDocument);
    setShowOCRModal(true);
  };

  const getCurrentImageId = () => {
    const item = effectiveMedia[currentImageIndex];
    if (item?.kind === 'image' && item.id) return item.id;
    if (imageIds && imageIds.length > currentImageIndex) {
      return imageIds[currentImageIndex];
    }
    return undefined;
  };

  const getCurrentDocument = (): Document | null => {
    const item = effectiveMedia[currentImageIndex];
    if (item?.kind === 'document') return item.doc;
    return null;
  };

  const handleOpenDocument = async () => {
    const doc = getCurrentDocument();
    if (!doc) return;
    console.log('[FullScreenImage] User tapped Open Document:', doc.file_name);
    setOpeningDocument(true);
    try {
      // Prefer local file for docs not yet uploaded
      const localUrl = doc.local_uri;
      if (localUrl && (localUrl.startsWith('file://') || localUrl.startsWith('/'))) {
        console.log('[FullScreenImage] Opening local document:', localUrl);
        await Sharing.shareAsync(localUrl, { dialogTitle: doc.file_name });
        return;
      }

      // cdn_url is a Supabase Storage path — must resolve to a signed URL
      const storagePath = doc.cdn_url;
      if (!storagePath) {
        Toast.show({ type: 'error', text1: 'Document not available', position: 'bottom' });
        return;
      }
      console.log('[FullScreenImage] Resolving storage path to signed URL:', storagePath);
      const signedUrl = await getDocumentSignedUrl(storagePath);
      console.log('[FullScreenImage] Signed URL resolved:', signedUrl ? 'ok' : 'null');
      if (!signedUrl) {
        Toast.show({ type: 'error', text1: 'Could not open document', position: 'bottom' });
        return;
      }
      await WebBrowser.openBrowserAsync(signedUrl);
    } catch (err) {
      console.error('[FullScreenImage] Error opening document:', err);
      Toast.show({ type: 'error', text1: 'Failed to open document', position: 'bottom' });
    } finally {
      setOpeningDocument(false);
    }
  };

  const handleCloseOCRModal = () => {
    setShowOCRModal(false);
  };

  const handleShareImage = async () => {
    if (Platform.OS === 'web') {
      Toast.show({
        type: 'info',
        text1: 'Not Available',
        text2: 'Sharing is not fully supported on web',
        position: 'bottom',
      });
      return;
    }

    try {
      setIsSharing(true);
      console.log('[FullScreenImage] Share button pressed — isDocument:', isCurrentDocument);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        console.log('[FullScreenImage] Sharing is not available on this device');
        Alert.alert('Not Available', 'Sharing is not available on this device.', [{ text: 'OK' }]);
        setIsSharing(false);
        return;
      }

      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      // ── Document share path ──────────────────────────────────────────────
      if (isCurrentDocument) {
        const doc = getCurrentDocument();
        if (!doc) {
          setIsSharing(false);
          return;
        }
        console.log('[FullScreenImage] Sharing document:', doc.file_name);

        // Prefer local file
        const localUrl = doc.local_uri;
        if (localUrl && (localUrl.startsWith('file://') || localUrl.startsWith('/'))) {
          console.log('[FullScreenImage] Sharing local document file:', localUrl);
          await Sharing.shareAsync(localUrl, { dialogTitle: doc.file_name });
        } else if (doc.cdn_url) {
          console.log('[FullScreenImage] Resolving signed URL for document share:', doc.cdn_url);
          const signedUrl = await getDocumentSignedUrl(doc.cdn_url);
          if (!signedUrl) {
            Toast.show({ type: 'error', text1: 'Could not share document', position: 'bottom' });
            return;
          }
          const sanitizedName = doc.file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const destUri = (FileSystem.cacheDirectory ?? '') + sanitizedName;
          console.log('[FullScreenImage] Downloading document to cache:', destUri);
          const downloadResult = await FileSystem.downloadAsync(signedUrl, destUri);
          if (downloadResult.status !== 200) {
            throw new Error('Failed to download document for sharing');
          }
          await Sharing.shareAsync(downloadResult.uri, {
            dialogTitle: doc.file_name,
            mimeType: doc.content_type,
          });
        } else {
          Toast.show({ type: 'error', text1: 'Document not available for sharing', position: 'bottom' });
        }

        if (Platform.OS !== 'web') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        return;
      }

      // ── Image share path ─────────────────────────────────────────────────
      const currentImageUrl = loadedImages[currentImageIndex];
      console.log('[FullScreenImage] Sharing image:', currentImageUrl);

      const fileUri = (FileSystem.cacheDirectory ?? '') + `share_image_${Date.now()}.jpg`;
      console.log('[FullScreenImage] Downloading image to:', fileUri);
      const downloadResult = await FileSystem.downloadAsync(currentImageUrl, fileUri);
      console.log('[FullScreenImage] Download result status:', downloadResult.status);

      if (downloadResult.status !== 200) {
        throw new Error('Failed to download image');
      }

      console.log('[FullScreenImage] Opening share dialog for image...');
      await Sharing.shareAsync(downloadResult.uri, {
        dialogTitle: 'Share Image',
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
      });

      console.log('[FullScreenImage] Share dialog completed');

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

    } catch (error) {
      console.error('[FullScreenImage] Error sharing:', error);
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert('Error', 'Failed to share. Please try again.', [{ text: 'OK' }]);
    } finally {
      setIsSharing(false);
    }
  };

  const handleClose = () => {
    if (isClosing) return;
    
    console.log('[FullScreenImage] Closing full screen viewer');
    setIsClosing(true);
    
    translateY.value = 0;
    contextY.value = 0;
    
    onClose();
  };

  const handleImageLoad = (index: number) => {
    setImageLoadStates(prev => ({ ...prev, [index]: true }));
  };

  // Outer Pan Gesture for swipe-to-dismiss — only activates on clear vertical swipes
  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = contextY.value + event.translationY;
      } else {
        translateY.value = contextY.value + event.translationY * 0.3;
      }
    })
    .onEnd(() => {
      const shouldDismiss = translateY.value > DISMISS_THRESHOLD;
      
      if (shouldDismiss) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          { duration: 200 },
          (finished) => {
            if (finished) {
              translateY.value = 0;
              contextY.value = 0;
              runOnJS(handleClose)();
            }
          }
        );
      } else {
        translateY.value = withSpring(0, {
          damping: 25,
          stiffness: 400,
          mass: 0.8,
        });
      }
    });

  const animatedContainerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP
    );
    const containerScale = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT],
      [1, 0.85],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateY: translateY.value },
        { scale: containerScale },
      ],
      opacity: opacity,
    };
  });

  const animatedBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [0.98, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  // Build resolved image URLs for image items (use loadedImages for imageId-based items)
  const resolvedMedia: MediaItem[] = effectiveMedia.map((item, i) => {
    if (item.kind === 'image') {
      const resolvedUrl = loadedImages[i] ?? item.url;
      return { ...item, url: resolvedUrl };
    }
    return item;
  });

  const counterText = `${currentImageIndex + 1} / ${resolvedMedia.length}`;
  const currentItem = resolvedMedia[currentImageIndex];
  const isCurrentDocument = currentItem?.kind === 'document';

  // Derived values for OCR modal
  const ocrModalTitle = isCurrentDocument ? 'Document Analysis' : 'Image Analysis';
  const currentDoc = getCurrentDocument();
  const currentImageId = getCurrentImageId();
  const hasAnalysisTarget = isCurrentDocument ? !!currentDoc?.id : !!currentImageId;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        {/* Animated background */}
        <Animated.View style={[styles.background, animatedBackgroundStyle]} />
        
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.container, animatedContainerStyle]}>
            {/* Close Button - Top Right */}
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <View style={styles.closeButtonCircle}>
                <IconSymbol name="xmark" size={24} color="#FFFFFF" />
              </View>
            </Pressable>

            {/* Media Carousel */}
            <ScrollView
              ref={scrollViewRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              snapToInterval={SCREEN_WIDTH}
              decelerationRate="fast"
              style={styles.scrollView}
            >
              {resolvedMedia.map((item, index) => {
                if (item.kind === 'document') {
                  const doc = item.doc;
                  const thumbUrl = doc.local_thumbnail_uri ?? doc.thumbnail_url;
                  const ext = getFileExtension(doc.file_name);
                  const docColor = getDocumentColor(doc.content_type);
                  const sizeText = doc.file_size ? formatFileSize(doc.file_size) : '';
                  const pageText = doc.page_count ? `${doc.page_count} pages` : '';
                  const truncatedName = doc.file_name.length > 40
                    ? doc.file_name.substring(0, 37) + '...'
                    : doc.file_name;
                  const isActive = index === currentImageIndex;
                  return (
                    <View key={`fullscreen-doc-${index}`} style={styles.imageWrapper}>
                      {thumbUrl ? (
                        <Image
                          source={{ uri: thumbUrl }}
                          style={styles.image}
                          contentFit="contain"
                          transition={150}
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={[styles.docPlaceholder, { backgroundColor: docColor }]}>
                          <Text style={styles.docExtText}>{ext}</Text>
                        </View>
                      )}

                      {/* "Tap to preview" pill — centered in upper-middle area */}
                      {isActive && (
                        <View style={styles.tapToPreviewContainer}>
                          <TapToPreviewPill
                            onPress={handleOpenDocument}
                            isOpening={openingDocument}
                          />
                        </View>
                      )}

                      <View style={styles.docInfoOverlay}>
                        <IconSymbol name="doc.fill" size={20} color="#FFFFFF" />
                        <Text style={styles.docFileName}>{truncatedName}</Text>
                        {sizeText ? <Text style={styles.docMeta}>{sizeText}</Text> : null}
                        {pageText ? <Text style={styles.docMeta}>{pageText}</Text> : null}
                      </View>
                    </View>
                  );
                }
                return (
                  <ZoomableImage
                    key={`fullscreen-${index}`}
                    imageUrl={item.url}
                    index={index}
                    isLoaded={!!imageLoadStates[index]}
                    onLoad={handleImageLoad}
                    resetTrigger={currentImageIndex === index ? 0 : resetTrigger}
                  />
                );
              })}
            </ScrollView>

            {/* Share FAB — bottom left, shown for both images and documents */}
            <Pressable
              style={styles.shareButton}
              onPress={() => {
                console.log('[FullScreenImage] Share FAB pressed — isDocument:', isCurrentDocument);
                handleShareImage();
              }}
              disabled={isSharing}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <View style={styles.shareButtonContent}>
                {isSharing ? (
                  <SkeletonLoader
                    width={24}
                    height={24}
                    borderRadius={12}
                    variant="pulse"
                  />
                ) : (
                  <Share size={24} color="#FFFFFF" strokeWidth={2.2} />
                )}
              </View>
            </Pressable>

            {/* Analysis FAB — bottom right, shown for both images and documents */}
            <Pressable
              style={styles.ocrButton}
              onPress={() => {
                console.log('[FullScreenImage] Analysis FAB pressed — isDocument:', isCurrentDocument, 'index:', currentImageIndex);
                handleOCRButtonPress();
              }}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              accessibilityLabel={isCurrentDocument ? 'View document analysis' : 'View extracted text and explanation'}
              accessibilityRole="button"
            >
              <View style={styles.shareButtonContent}>
                <IconSymbol
                  name="text.alignleft"
                  size={24}
                  color="#FFFFFF"
                />
              </View>
            </Pressable>

            {/* Pagination Dots - Bottom Center */}
            {resolvedMedia.length > 1 && (
              <View style={styles.paginationContainer}>
                {resolvedMedia.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      currentImageIndex === index && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}

            {/* Counter Badge - Top Left */}
            {resolvedMedia.length > 1 && (
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>
                  {counterText}
                </Text>
              </View>
            )}

            {/* Swipe Down Hint - Top Center */}
            <View style={styles.swipeHintContainer}>
              <View style={styles.swipeHintBar} />
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Analysis Modal */}
      <Modal
        visible={showOCRModal}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseOCRModal}
      >
        <View style={styles.ocrModalContainer}>
          <View style={styles.ocrModalContent}>
            <View style={styles.ocrModalHeader}>
              <Text style={styles.ocrModalTitle}>{ocrModalTitle}</Text>
              <Pressable
                onPress={handleCloseOCRModal}
                style={styles.ocrModalCloseButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol name="xmark" size={24} color={colors.text} />
              </Pressable>
            </View>

            {hasAnalysisTarget ? (
              isCurrentDocument ? (
                <ImageOCRDisplay
                  mode="document"
                  documentId={currentDoc?.id}
                  autoLoad={true}
                  compact={false}
                />
              ) : (
                <ImageOCRDisplay
                  mode="image"
                  imageId={currentImageId!}
                  autoLoad={true}
                  compact={false}
                />
              )
            ) : (
              <View style={styles.ocrModalError}>
                <Text style={styles.ocrModalErrorText}>
                  {isCurrentDocument
                    ? 'No document ID available for analysis'
                    : 'No image ID available for analysis'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.98)',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1000,
  },
  closeButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  skeletonContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Tap-to-preview pill ──────────────────────────────────────────────────
  tapToPreviewContainer: {
    position: 'absolute',
    bottom: '35%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 200,
  },
  tapToPreviewPill: {
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: colors.primary,
    elevation: 6,
    boxShadow: '0px 4px 16px rgba(0,0,0,0.5)',
  },
  tapToPreviewPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 22,
    gap: 8,
  },
  tapToPreviewLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // ── Share / OCR FABs ─────────────────────────────────────────────────────
  shareButton: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.6)',
    elevation: 12,
    borderWidth: 3,
    borderColor: colors.primary,
    zIndex: 1000,
  },
  shareButtonContent: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ocrButton: {
    position: 'absolute',
    bottom: 40,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.6)',
    elevation: 12,
    borderWidth: 3,
    borderColor: colors.primary,
    zIndex: 1000,
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
  },
  paginationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: {
    width: 28,
    backgroundColor: '#FFFFFF',
  },
  counterBadge: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    zIndex: 100,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  swipeHintContainer: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50,
  },
  swipeHintBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  ocrModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  ocrModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  ocrModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ocrModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  ocrModalCloseButton: {
    padding: 4,
  },
  ocrModalError: {
    padding: 20,
    alignItems: 'center',
  },
  ocrModalErrorText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  docPlaceholder: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docExtText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  docInfoOverlay: {
    position: 'absolute',
    bottom: 120,
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 8,
  },
  docFileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  docMeta: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
});
