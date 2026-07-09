
import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { 
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  withTiming,
  withRepeat,
  withSequence,
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
import { getImageDataUrl, getDocumentSignedUrl, supabase } from '@/utils/supabase';
import { SkeletonLoader } from './SkeletonLoader';
import { Document } from '@/types/Document';
import { formatFileSize, getFileExtension, getDocumentColor } from '@/utils/documentPicker';
// Lucide share icon — non-negotiable per spec
import { Share } from 'lucide-react-native';
import { FaceLinkSheet, FaceRow } from './FaceLinkSheet';
import { useNotesContext } from '@/contexts/NotesContext';

type MediaItem =
  | { kind: 'image'; url: string; id?: string }
  | { kind: 'document'; doc: Document };

interface FullScreenImageProps {
  visible: boolean;
  images?: string[];
  imageIds?: string[];
  media?: MediaItem[];
  initialIndex?: number;
  recallId?: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Threshold for dismissing the modal (swipe down distance)
const DISMISS_THRESHOLD = 100;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

// ─── Letterbox helper ────────────────────────────────────────────────────────

function computeImageRect(
  naturalWidth: number,
  naturalHeight: number,
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (naturalWidth === 0 || naturalHeight === 0) {
    return { x: 0, y: 0, width: screenWidth, height: screenHeight };
  }
  const scale = Math.min(screenWidth / naturalWidth, screenHeight / naturalHeight);
  const renderedW = naturalWidth * scale;
  const renderedH = naturalHeight * scale;
  const offsetX = (screenWidth - renderedW) / 2;
  const offsetY = (screenHeight - renderedH) / 2;
  return { x: offsetX, y: offsetY, width: renderedW, height: renderedH };
}

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
 * - Face detection overlays with tap-to-link sheet
 */

interface ZoomableImageProps {
  imageUrl: string;
  index: number;
  isLoaded: boolean;
  onLoad: (index: number) => void;
  resetTrigger: number;
  faces: FaceRow[];
  naturalDims: { width: number; height: number } | null;
  showControls: boolean;
  onFaceTap: (face: FaceRow) => void;
}

function ZoomableImage({
  imageUrl,
  index,
  isLoaded,
  onLoad,
  resetTrigger,
  faces,
  naturalDims,
  showControls,
  onFaceTap,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Pulse animation for suggested (unconfirmed) face boxes
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.5, { duration: 900 }),
        withTiming(1, { duration: 900 }),
      ),
      -1,
      false,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Compute letterbox rect for face overlays
  const imageRect = naturalDims
    ? computeImageRect(naturalDims.width, naturalDims.height, SCREEN_WIDTH, SCREEN_HEIGHT)
    : null;

  const pulseAnimStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
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

        {/* Face overlays — only when controls are visible and we have letterbox data */}
        {showControls && imageRect && faces.length > 0 && faces.map((face) => {
          const faceX = imageRect.x + face.bbox_x * imageRect.width;
          const faceY = imageRect.y + face.bbox_y * imageRect.height;
          const faceW = face.bbox_w * imageRect.width;
          const faceH = face.bbox_h * imageRect.height;

          // Determine visual state
          const isConfirmed = face.confirmed_by_user === true;
          const isSuggested = !isConfirmed && face.suggested_person_id !== null;
          const isUnknown = !isConfirmed && !isSuggested;

          const borderColor = isConfirmed
            ? colors.primary
            : isSuggested
              ? '#F59E0B'
              : 'rgba(255,255,255,0.7)';
          const borderWidth = isConfirmed ? 2 : isSuggested ? 2 : 1.5;
          const borderStyle = isConfirmed ? 'solid' : 'dashed';

          const labelText = isConfirmed
            ? (face.person_name ?? '?')
            : isSuggested
              ? `${face.suggested_person_name ?? '?'} · ${Math.round((face.match_confidence ?? 0) * 100)}%`
              : '?';

          const labelBgColor = isConfirmed
            ? 'rgba(0,0,0,0.6)'
            : isSuggested
              ? 'rgba(245,158,11,0.85)'
              : 'rgba(0,0,0,0.6)';

          const labelTextColor = '#FFFFFF';

          const boxContent = (
            <Pressable
              style={[
                styles.faceBox,
                {
                  left: faceX,
                  top: faceY,
                  width: faceW,
                  height: faceH,
                  borderColor,
                  borderWidth,
                  borderStyle,
                },
              ]}
              onPress={() => {
                console.log('[FullScreenImage] Face box tapped:', face.face_uuid, 'state:', isConfirmed ? 'confirmed' : isSuggested ? 'suggested' : 'unknown');
                onFaceTap(face);
              }}
            >
              <View style={styles.faceLabelContainer}>
                <Text
                  style={[styles.faceLabelText, { backgroundColor: labelBgColor, color: labelTextColor }]}
                  numberOfLines={1}
                >
                  {labelText}
                </Text>
              </View>
            </Pressable>
          );

          if (isSuggested) {
            return (
              <Animated.View key={face.face_uuid} style={pulseAnimStyle}>
                {boxContent}
              </Animated.View>
            );
          }

          return (
            <View key={face.face_uuid}>
              {boxContent}
            </View>
          );
        })}
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
  recallId,
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
  // Controls visibility of overlay UI (close, FABs, counter, dots, hint)
  const [showControls, setShowControls] = useState(true);
  const overlayOpacity = useSharedValue(1);
  const scrollViewRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  const { refreshPeopleForNote } = useNotesContext();

  // Face detection state
  const [facesPerImage, setFacesPerImage] = useState<Map<string, FaceRow[]>>(new Map());
  const [naturalDimsPerIndex, setNaturalDimsPerIndex] = useState<Map<number, { width: number; height: number }>>(new Map());
  const [selectedFace, setSelectedFace] = useState<FaceRow | null>(null);

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
      // Always show controls when modal opens
      setShowControls(true);
      overlayOpacity.value = 1;
      
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
  }, [visible, initialIndex, images, imageIds, translateY, contextY, overlayOpacity]);

  // Reset zoom on all slides when the active index changes
  useEffect(() => {
    setResetTrigger(prev => prev + 1);
  }, [currentImageIndex]);

  // Fetch faces for the current image when index changes or modal opens
  useEffect(() => {
    if (!visible) return;
    const item = effectiveMedia[currentImageIndex];
    if (!item || item.kind !== 'image') return;
    const imageId = item.id ?? imageIds?.[currentImageIndex];
    if (!imageId) return;

    // Already cached
    if (facesPerImage.has(imageId)) return;

    console.log('[FullScreenImage] Fetching faces for imageId:', imageId);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('recall_images_people')
          .select('id, face_uuid, bbox_x, bbox_y, bbox_w, bbox_h, person_id, confirmed_by_user, match_confidence, suggested_person_id, persons(person_name, photo_url)')
          .eq('recall_image_id', imageId);

        if (error) {
          console.warn('[FullScreenImage] Face fetch error (non-fatal):', error);
          return;
        }

        // Build initial rows (suggested_person_name/photo_url filled in next step)
        const partialRows: FaceRow[] = (data ?? []).map((row: any) => ({
          id: row.id,
          face_uuid: row.face_uuid,
          bbox_x: row.bbox_x,
          bbox_y: row.bbox_y,
          bbox_w: row.bbox_w,
          bbox_h: row.bbox_h,
          person_id: row.person_id ?? null,
          person_name: row.persons?.person_name ?? null,
          photo_url: row.persons?.photo_url ?? null,
          confirmed_by_user: row.confirmed_by_user ?? false,
          match_confidence: row.match_confidence ?? null,
          suggested_person_id: row.suggested_person_id ?? null,
          suggested_person_name: null,
          suggested_person_photo_url: null,
        }));

        // Batch-fetch suggested person names for rows that have suggested_person_id but no person_id
        const suggestedIds = partialRows
          .filter(r => r.suggested_person_id !== null && r.person_id === null)
          .map(r => r.suggested_person_id as string);

        let suggestedPersonMap: Record<string, { person_name: string; photo_url: string | null }> = {};
        if (suggestedIds.length > 0) {
          const { data: suggestedPersons, error: spError } = await supabase
            .from('persons')
            .select('id, person_name, photo_url')
            .in('id', suggestedIds);
          if (spError) {
            console.warn('[FullScreenImage] Suggested persons fetch error (non-fatal):', spError);
          } else {
            for (const sp of (suggestedPersons ?? [])) {
              suggestedPersonMap[sp.id] = { person_name: sp.person_name, photo_url: sp.photo_url ?? null };
            }
          }
        }

        const rows: FaceRow[] = partialRows.map(r => {
          if (r.suggested_person_id && suggestedPersonMap[r.suggested_person_id]) {
            return {
              ...r,
              suggested_person_name: suggestedPersonMap[r.suggested_person_id].person_name,
              suggested_person_photo_url: suggestedPersonMap[r.suggested_person_id].photo_url,
            };
          }
          return r;
        });

        console.log('[FullScreenImage] Fetched', rows.length, 'face(s) for imageId:', imageId);
        setFacesPerImage(prev => {
          const next = new Map(prev);
          next.set(imageId, rows);
          return next;
        });
      } catch (e) {
        console.warn('[FullScreenImage] Face fetch exception (non-fatal):', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, currentImageIndex]);

  // Fetch natural dimensions for the current image URL
  useEffect(() => {
    if (!visible) return;
    const item = effectiveMedia[currentImageIndex];
    if (!item || item.kind !== 'image') return;
    if (naturalDimsPerIndex.has(currentImageIndex)) return;

    const resolvedUrl = loadedImages[currentImageIndex] ?? (item.kind === 'image' ? item.url : '');
    if (!resolvedUrl) return;

    RNImage.getSize(
      resolvedUrl,
      (width, height) => {
        console.log('[FullScreenImage] Natural dims for index', currentImageIndex, ':', width, 'x', height);
        setNaturalDimsPerIndex(prev => {
          const next = new Map(prev);
          next.set(currentImageIndex, { width, height });
          return next;
        });
      },
      (err) => {
        console.warn('[FullScreenImage] getSize error (non-fatal):', err);
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, currentImageIndex, loadedImages]);

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

  // Toggle overlay controls on single tap
  const toggleControls = () => {
    const next = !showControls;
    console.log('[FullScreenImage] Single tap — toggling controls:', next ? 'show' : 'hide');
    setShowControls(next);
    overlayOpacity.value = withTiming(next ? 1 : 0, { duration: 200 });
  };

  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      runOnJS(toggleControls)();
    });

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

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

  // Current faces for the active image
  const currentFaces: FaceRow[] = (() => {
    const item = effectiveMedia[currentImageIndex];
    if (!item || item.kind !== 'image') return [];
    const imageId = item.id ?? imageIds?.[currentImageIndex];
    if (!imageId) return [];
    return facesPerImage.get(imageId) ?? [];
  })();

  const currentNaturalDims = naturalDimsPerIndex.get(currentImageIndex) ?? null;

  // Current image URL for FaceLinkSheet crop
  const currentImageUrl = (() => {
    const item = resolvedMedia[currentImageIndex];
    if (item?.kind === 'image') return item.url;
    return '';
  })();

  const handleFaceTap = useCallback((face: FaceRow) => {
    console.log('[FullScreenImage] Face tapped, opening FaceLinkSheet for face:', face.face_uuid);
    setSelectedFace(face);
  }, []);

  const handleFaceLinked = useCallback((
    faceId: string,
    personId: string,
    personName: string,
    photoUrl: string | null,
  ) => {
    console.log('[FullScreenImage] Face linked:', faceId, '->', personId, personName);
    // Update the facesPerImage map entry
    const item = effectiveMedia[currentImageIndex];
    if (!item || item.kind !== 'image') return;
    const imageId = item.id ?? imageIds?.[currentImageIndex];
    if (!imageId) return;

    setFacesPerImage(prev => {
      const next = new Map(prev);
      const existing = next.get(imageId) ?? [];
      const updated = existing.map(f =>
        f.id === faceId
          ? { ...f, person_id: personId, person_name: personName, photo_url: photoUrl, confirmed_by_user: true }
          : f
      );
      next.set(imageId, updated);
      return next;
    });
    setSelectedFace(null);

    if (recallId) {
      console.log('[FullScreenImage] Refreshing people for recall after face link:', recallId);
      refreshPeopleForNote(recallId);
    }
  }, [effectiveMedia, currentImageIndex, imageIds, recallId, refreshPeopleForNote]);

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
            {/* Media Carousel — wrapped in single-tap detector to toggle controls */}
            <GestureDetector gesture={singleTapGesture}>
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
                      faces={index === currentImageIndex ? currentFaces : []}
                      naturalDims={index === currentImageIndex ? currentNaturalDims : null}
                      showControls={showControls}
                      onFaceTap={handleFaceTap}
                    />
                  );
                })}
              </ScrollView>
            </GestureDetector>

            {/* Overlay controls — fade in/out on tap */}
            <Animated.View
              style={[styles.overlayContainer, overlayAnimatedStyle]}
              pointerEvents={showControls ? 'box-none' : 'none'}
            >
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

      {/* Face Link Sheet */}
      <FaceLinkSheet
        visible={!!selectedFace}
        faceRow={selectedFace}
        imageUrl={currentImageUrl}
        recallId={recallId}
        naturalWidth={currentNaturalDims?.width ?? 0}
        naturalHeight={currentNaturalDims?.height ?? 0}
        onClose={() => {
          console.log('[FullScreenImage] FaceLinkSheet closed');
          setSelectedFace(null);
        }}
        onLinked={handleFaceLinked}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
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
  // ── Face overlays ────────────────────────────────────────────────────────
  faceBox: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  faceLabelContainer: {
    position: 'absolute',
    bottom: -22,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  faceLabelLinked: {},
  faceLabelText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
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
