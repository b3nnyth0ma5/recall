import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, Linking, ScrollView, NativeScrollEvent, NativeSyntheticEvent, Platform, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { Note } from '@/types/Note';
import { Document } from '@/types/Document';
import { IconSymbol } from './IconSymbol';
import UrlPreviewCard from './UrlPreviewCard';
import { extractUrls } from '@/utils/urlProcessor';
import { useNotesContext } from '@/contexts/NotesContext';
import { TimeAgo } from './TimeAgo';
import { shareRecall } from '@/utils/shareRecall';
import { getImageDataUrl } from '@/utils/supabase';
import { PeopleAvatars } from './PeopleAvatars';
import { RecallUtilityBar } from './RecallUtilityBar';
import { RecallChatModal } from './RecallChatModal';
import * as Haptics from 'expo-haptics';
import { NoteCardSkeleton } from './NoteCardSkeleton';
import { SkeletonLoader } from './SkeletonLoader';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming, 
  withSequence,
  runOnJS,
  FadeOut,
  SlideOutLeft,
} from 'react-native-reanimated';
import { DocumentTile } from './DocumentTile';
import { getDocumentColor, getFileExtension } from '@/utils/documentPicker';

type MediaItem =
  | { kind: 'image'; url: string; id?: string }
  | { kind: 'document'; doc: Document };

const FullScreenImage = React.lazy(() =>
  import('./FullScreenImage').then(m => ({ default: m.FullScreenImage }))
);

interface NoteCardProps {
  note: Note;
  onPress: (imageIndex?: number) => void;
  onImagePress?: () => void;
  onDelete?: () => void;
  loading?: boolean;
  expectedImageCount?: number;
  scrollToImageIndex?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 8;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 4.8);
const IMAGE_HEIGHT = IMAGE_WIDTH * 0.972;
const IMAGE_SPACING = 3;

// Helper function to check if text contains URLs
const hasUrl = (text: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
};

// Helper function to count newline characters
const countNewlines = (text: string): number => {
  const newlineRegex = /[\n\r\u0085\u2028\u2029]/g;
  const matches = text.match(newlineRegex);
  return matches ? matches.length : 0;
};

// Memoized component for better performance
export const NoteCard = memo(function NoteCard({ note, onPress, onImagePress, onDelete, loading = false, expectedImageCount, scrollToImageIndex }: NoteCardProps) {
  const { getUrlMetadataForRecall } = useNotesContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [imageLoadingStates, setImageLoadingStates] = useState<{ [key: number]: boolean }>({});
  const [imageErrorStates, setImageErrorStates] = useState<{ [key: number]: boolean }>({});
  const [imageLoadedStates, setImageLoadedStates] = useState<{ [key: number]: boolean }>({});
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showChatModal, setShowChatModal] = useState(false);
  const imageScrollRef = useRef<ScrollView>(null);
  const swipeableRef = useRef<Swipeable>(null);
  
  // Optimized lazy loading state for images
  const [lazyLoadedImages, setLazyLoadedImages] = useState<string[]>([]);
  const [isLazyLoading, setIsLazyLoading] = useState(false);
  const loadingQueueRef = useRef<Set<number>>(new Set());
  
  // Track total image count separately from loaded images
  const [totalImageCount, setTotalImageCount] = useState(0);
  
  // Track if images are currently being uploaded
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  // Animation values for deletion
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);
  const height = useSharedValue(1);

  // Animated style for deletion - MUST be called before any conditional returns
  const animatedCardStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
      height: height.value === 0 ? 0 : undefined,
      marginBottom: height.value === 0 ? 0 : 16,
      overflow: 'hidden',
    };
  });

  // Callbacks - MUST be defined at top level before any conditional returns
  const handleSharePress = useCallback(async (options?: { includeLocation: boolean }) => {
    console.log('User tapped Share button on recall:', note.id, '— options:', options);
    try {
      await shareRecall(note, currentImageIndex, options);
    } catch (error) {
      console.error('Error sharing recall:', error);
    }
  }, [note, currentImageIndex]);

  const handleAskQuestion = useCallback(() => {
    console.log('User tapped Chat icon on recall:', note.id);
    setShowChatModal(true);
  }, [note.id]);

  const handleCloseChatModal = useCallback(() => {
    console.log('User closed chat modal for recall:', note.id);
    setShowChatModal(false);
  }, [note.id]);

  // Initialize with first TWO images for better performance
  useEffect(() => {
    if (!loading && note.images && note.images.length > 0) {
      // Set total count immediately
      setTotalImageCount(note.images.length);
      
      // Load first two images immediately if available
      const imagesToLoad = note.images.length > 1 ? note.images.slice(0, 2) : [note.images[0]];
      setLazyLoadedImages(imagesToLoad);
      // Initialize currentImageIndex to 0 to show counter immediately
      setCurrentImageIndex(0);
      
      // Check if we're still uploading images
      if (expectedImageCount && note.images.length < expectedImageCount) {
        setIsUploadingImages(true);
      } else {
        setIsUploadingImages(false);
      }
    } else if (!loading && note.imageIds && note.imageIds.length > 0) {
      // If we have imageIds but no images yet (placeholder records), set the count
      setTotalImageCount(note.imageIds.length);
      
      // Check if we're still uploading images
      if (expectedImageCount && note.imageIds.length < expectedImageCount) {
        setIsUploadingImages(true);
      } else {
        setIsUploadingImages(false);
      }
    } else if (!loading && expectedImageCount && expectedImageCount > 0) {
      // Use expectedImageCount if provided (for newly created notes with pending uploads)
      setTotalImageCount(expectedImageCount);
      setIsUploadingImages(true);
    } else {
      setIsUploadingImages(false);
    }
  }, [note.id, note.imageIds, note.images, loading, expectedImageCount]);

  // Scroll to specific image if scrollToImageIndex is provided - MUST be before conditional returns
  useEffect(() => {
    if (scrollToImageIndex !== undefined && note.images && note.images.length > 0 && scrollToImageIndex < note.images.length && imageScrollRef.current) {
      // Wait for images to render before scrolling
      setTimeout(() => {
        const scrollX = scrollToImageIndex * (IMAGE_WIDTH + IMAGE_SPACING);
        imageScrollRef.current?.scrollTo({
          x: scrollX,
          y: 0,
          animated: true,
        });
        
        // Update current image index
        setCurrentImageIndex(scrollToImageIndex);
      }, 300);
    }
  }, [scrollToImageIndex, note.images]);

  // Show skeleton if loading
  if (loading) {
    return <NoteCardSkeleton />;
  }

  // Optimized lazy load with queue management
  const lazyLoadImage = async (index: number) => {
    if (!note.imageIds || index >= note.imageIds.length) {
      return;
    }
    if (lazyLoadedImages[index]) {
      return;
    }
    if (loadingQueueRef.current.has(index)) {
      return;
    }
    
    loadingQueueRef.current.add(index);
    setIsLazyLoading(true);
    
    try {
      const imageIdToLoad = note.imageIds[index];
      if (imageIdToLoad) {
        const imageUrl = await getImageDataUrl(imageIdToLoad);
        if (imageUrl) {
          setLazyLoadedImages(prev => {
            const newImages = [...prev];
            newImages[index] = imageUrl;
            return newImages;
          });
        }
      }
    } catch (error) {
      console.error(`[NoteCard] Error lazy loading image at index ${index}:`, error);
    } finally {
      loadingQueueRef.current.delete(index);
      setIsLazyLoading(false);
    }
  };

  // Optimized image scroll handler with prefetching
  const handleImageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / (IMAGE_WIDTH + IMAGE_SPACING));
    
    if (index >= 0 && index < displayMedia.length) {
      setCurrentImageIndex(index);
      
      // Prefetch next item only if it's an image (not a document)
      const nextIndex = index + 1;
      if (nextIndex < displayMedia.length && displayMedia[nextIndex].kind === 'image' && !lazyLoadedImages[nextIndex]) {
        lazyLoadImage(nextIndex);
      }
    }
  };

  // Strip URLs from text for display in the card.
  // The URL is still surfaced via UrlPreviewCard, and the raw note.text
  // (with URLs intact) is what the editor reads — so editing is unaffected.
  const stripUrlsForDisplay = (text: string): string => {
    return text.replace(/\s*https?:\/\/\S+\s*/g, ' ').trim();
  };

  const renderTextWithLinks = (text: string) => {
    const stripped = stripUrlsForDisplay(text);
    if (!stripped) {
      return null;
    }
    return <Text style={styles.normalText}>{stripped}</Text>;
  };

  const getPreviewText = () => {
    if (!note.text) {
      return '';
    }
    const maxLength = 150;
    if (note.text.length <= maxLength) {
      return note.text;
    }
    return note.text.substring(0, maxLength) + '...';
  };

  const shouldShowToggle = () => {
    if (!note.text) {
      return false;
    }
    const newlineCount = countNewlines(note.text);
    return note.text.length > 200 || newlineCount > 5;
  };

  const handleImageError = (index: number) => {
    console.error('Error loading image at index:', index);
    setImageErrorStates(prev => ({ ...prev, [index]: true }));
    setImageLoadingStates(prev => ({ ...prev, [index]: false }));
    setImageLoadedStates(prev => ({ ...prev, [index]: false }));
  };

  const handleImageLoadStart = (index: number) => {
    if (!imageLoadedStates[index]) {
      setImageLoadingStates(prev => ({ ...prev, [index]: true }));
    }
  };

  const handleImageLoad = (index: number) => {
    setImageLoadingStates(prev => ({ ...prev, [index]: false }));
    setImageLoadedStates(prev => ({ ...prev, [index]: true }));
  };

  const handleImagePress = (index: number) => {
    setFullScreenImageIndex(index);
    setShowFullScreenImage(true);
    if (onImagePress) {
      onImagePress();
    }
  };

  const handleTextPress = () => {
    onPress();
  };
  
  const handleCardPress = () => {
    onPress(scrollToImageIndex);
  };

  const handleToggleExpand = (e: any) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleLocationPress = async () => {
    if (!note.latitude || !note.longitude) {
      console.log('No location coordinates available');
      return;
    }

    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }

    const { latitude, longitude } = note;
    const locationName = note.location || '';
    
    try {
      let universalUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      
      if (locationName) {
        const encodedLocationName = encodeURIComponent(locationName);
        universalUrl = `https://www.google.com/maps/search/?api=1&query=${encodedLocationName}+${latitude},${longitude}`;
      }
      
      const canOpen = await Linking.canOpenURL(universalUrl);
      
      if (canOpen) {
        await Linking.openURL(universalUrl);
      } else {
        console.error('Cannot open maps URL');
      }
    } catch (error) {
      console.error('Error opening maps:', error);
    }
  };

  const handleDelete = async () => {
    swipeableRef.current?.close();
    
    if (Platform.OS !== 'web') {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.error('[NoteCard] Error triggering haptic feedback:', error);
      }
    }
    
    opacity.value = withTiming(0, { duration: 300 });
    scale.value = withTiming(0.9, { duration: 300 });
    height.value = withTiming(0, { duration: 300 }, (finished) => {
      if (finished) {
        if (onDelete) {
          runOnJS(onDelete)();
        }
      }
    });
  };

  const renderRightActions = () => {
    return (
      <View style={styles.deleteActionContainer}>
        <Pressable
          style={styles.deleteAction}
          onPress={handleDelete}
        >
          <IconSymbol name="trash.fill" size={24} color="#FFFFFF" />
          <Text style={styles.deleteActionText}>Delete</Text>
        </Pressable>
      </View>
    );
  };

  const displayImages = totalImageCount > 0 
    ? Array.from({ length: totalImageCount }, (_, index) => {
        if (lazyLoadedImages[index]) {
          return lazyLoadedImages[index];
        }
        if (note.images && note.images[index]) {
          return note.images[index];
        }
        return '';
      }) 
    : [];

  const displayMedia: MediaItem[] = [
    ...displayImages.map((url, i) => ({
      kind: 'image' as const,
      url,
      id: note.imageIds?.[i],
    })),
    ...(note.documents ?? []).map(doc => ({
      kind: 'document' as const,
      doc,
    })),
  ];

  const hasPeople = note.people && note.people.length > 0;
  const hasImages = displayImages && displayImages.length > 0;
  const hasMedia = displayMedia.length > 0;

  return (
    <Animated.View style={[styles.card, animatedCardStyle]}>
      <Pressable 
        onPress={handleCardPress}
        style={styles.entireCardTouchArea}
      >
        {hasMedia && (
          <View style={styles.imagesContainer}>
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imagesScrollContent}
              onScroll={handleImageScroll}
              scrollEventThrottle={16}
              decelerationRate={0.9}
              snapToInterval={IMAGE_WIDTH + IMAGE_SPACING}
              snapToAlignment="start"
            >
              {displayMedia.map((item, index) => {
                if (item.kind === 'document') {
                  return (
                    <View key={`${note.id}-doc-${index}`} style={[styles.imageWrapper, { marginRight: IMAGE_SPACING }]}>
                      <DocumentTile
                        document={item.doc}
                        width={IMAGE_WIDTH}
                        height={IMAGE_HEIGHT}
                        onPress={() => {
                          console.log('[NoteCard] User tapped document tile:', item.doc.file_name);
                          handleImagePress(index);
                        }}
                      />
                    </View>
                  );
                }
                const imageUrl = item.url;
                return (
                  <Pressable 
                    key={`${note.id}-image-${index}`}
                    onPress={() => handleImagePress(index)}
                    style={styles.imageWrapper}
                  >
                    {!imageUrl ? (
                      <View style={styles.imageLoadingContainer}>
                        <SkeletonLoader
                          width={IMAGE_WIDTH}
                          height={IMAGE_HEIGHT}
                          borderRadius={12}
                          variant="wave"
                        />
                      </View>
                    ) : (
                      <>
                        {imageLoadingStates[index] && !imageErrorStates[index] && !imageLoadedStates[index] && (
                          <View style={styles.imageLoadingContainer}>
                            <SkeletonLoader
                              width={IMAGE_WIDTH}
                              height={IMAGE_HEIGHT}
                              borderRadius={12}
                              variant="wave"
                            />
                          </View>
                        )}
                        {imageErrorStates[index] ? (
                          <View style={styles.imageErrorContainer}>
                            <IconSymbol name="exclamationmark.triangle" size={40} color={colors.error} />
                            <Text style={styles.imageErrorText}>Failed to load image</Text>
                          </View>
                        ) : (
                          <Image
                            source={{ uri: imageUrl }}
                            style={[styles.image, { width: IMAGE_WIDTH, height: IMAGE_HEIGHT }]}
                            resizeMode="cover"
                            onLoadStart={() => handleImageLoadStart(index)}
                            onLoad={() => handleImageLoad(index)}
                            onError={() => handleImageError(index)}
                          />
                        )}
                      </>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            {displayMedia.length > 0 && (
              <View style={styles.imageCounter}>
                {isUploadingImages && (
                  <ActivityIndicator 
                    size="small" 
                    color="#FFFFFF" 
                    style={styles.imageCounterSpinner}
                  />
                )}
                <Text style={styles.imageCounterText}>
                  {displayMedia.length > 1 ? `${currentImageIndex + 1} / ${displayMedia.length}` : `1 / ${displayMedia.length}`}
                </Text>
              </View>
            )}
            
            {hasPeople && (
              <View style={styles.peopleAvatarsContainerWithImages}>
                <PeopleAvatars 
                  people={note.people || []} 
                  maxVisible={5}
                  avatarSize={32}
                  overlapOffset={8}
                />
              </View>
            )}
          </View>
        )}

        <Swipeable
          ref={swipeableRef}
          renderRightActions={renderRightActions}
          overshootRight={false}
          friction={2}
          rightThreshold={40}
          containerStyle={styles.swipeableContainer}
        >
          <View style={styles.cardContent}>
            {!hasImages && hasPeople && (
              <View style={styles.peopleAvatarsContainerNoImages}>
                <PeopleAvatars 
                  people={note.people || []} 
                  maxVisible={5}
                  avatarSize={32}
                  overlapOffset={8}
                />
              </View>
            )}
						
						{(() => {
              const urlMeta = getUrlMetadataForRecall(note.id);
              const noteHasUrl = note.text ? extractUrls(note.text).length > 0 : false;
              if (urlMeta !== null && noteHasUrl) {
                return (
                  <UrlPreviewCard
                    url={urlMeta.url}
                    ogTitle={urlMeta.og_title}
                    ogDescription={urlMeta.og_description}
                    ogSiteName={urlMeta.og_site_name}
                    ogImageUrl={urlMeta.og_image_url}
                    scrapedAt={urlMeta.scraped_at}
                  />
                );
              }
              return null;
            })()}

            {note.text ? (
              <Pressable onPress={handleTextPress}>
                <View style={styles.text}>
                  <Text
                    style={styles.noteText}
                    numberOfLines={isExpanded ? undefined : 7}
                  >
                    {isExpanded ? note.text : getPreviewText()}
                  </Text>
                </View>
                {shouldShowToggle() && (
                  <Pressable 
                    onPress={handleToggleExpand}
                    style={styles.toggleContainer}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.toggleText}>
                      {isExpanded ? 'Show less' : 'Show more'}
                    </Text>
                  </Pressable>
                )}
              </Pressable>
            ) : null}

            <View style={styles.locationTimeContainer}>
              <View style={styles.timeAgoWrapper}>
                <TimeAgo 
                  date={note.created_at} 
                  style={styles.date}
                />
              </View>
            </View>

            <View style={styles.actionsRowWithLocation}>
              {note.location ? (
                <Pressable 
                  onPress={handleLocationPress}
                  style={styles.locationWrapper}
                >
                  <IconSymbol name="location.fill" size={14} color={colors.primary} />
                  <View style={styles.locationTextChevronWrapper}>
                    <Text style={styles.location} numberOfLines={1} ellipsizeMode="tail">
                      {note.location}
                    </Text>
                    <IconSymbol name="chevron.right" size={12} color={colors.primary} />
                  </View>
                </Pressable>
              ) : (
                <View style={styles.locationWrapper} />
              )}

              <RecallUtilityBar
                onAskQuestion={handleAskQuestion}
                onShare={handleSharePress}
                hasLocation={Boolean(note.location)}
              />
            </View>
          </View>
        </Swipeable>
      </Pressable>

      {hasMedia && (
        <React.Suspense fallback={null}>
          <FullScreenImage
            visible={showFullScreenImage}
            images={displayImages}
            imageIds={note.imageIds}
            media={displayMedia}
            initialIndex={fullScreenImageIndex}
            onClose={() => setShowFullScreenImage(false)}
          />
        </React.Suspense>
      )}

      <RecallChatModal
        visible={showChatModal}
        recall={note}
        onClose={handleCloseChatModal}
      />
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.note.id === nextProps.note.id &&
    prevProps.note.updated_at === nextProps.note.updated_at &&
    prevProps.note.images?.length === nextProps.note.images?.length &&
    prevProps.note.imageIds?.length === nextProps.note.imageIds?.length &&
    prevProps.note.people?.length === nextProps.note.people?.length &&
    prevProps.note.documents?.length === nextProps.note.documents?.length &&
    prevProps.loading === nextProps.loading &&
    prevProps.expectedImageCount === nextProps.expectedImageCount &&
    prevProps.scrollToImageIndex === nextProps.scrollToImageIndex
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'visible',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
    position: 'relative',
  },
  entireCardTouchArea: {
    flex: 1,
    width: '100%',
  },
  swipeableContainer: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardContent: {
    padding: 4,
    backgroundColor: colors.card,
    borderRadius: 16,
  },
  imagesContainer: {
    marginBottom: 0,
    marginHorizontal: -CARD_PADDING,
    position: 'relative',
    zIndex: 10,
    marginTop: 8,
    overflow: 'visible',
  },
  imagesScrollContent: {
    paddingHorizontal: CARD_PADDING,
  },
  imageWrapper: {
    marginRight: IMAGE_SPACING,
    marginLeft: IMAGE_SPACING - 3,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.cardDark,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },
  image: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },
  imageLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardDark,
    zIndex: 1,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  imageErrorContainer: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardDark,
  },
  imageErrorText: {
    fontSize: 14,
    color: colors.error,
    marginTop: 8,
  },
  imageCounter: {
    position: 'absolute',
    bottom: 12,
    right: CARD_PADDING + IMAGE_SPACING,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  imageCounterSpinner: {
    marginRight: 4,
  },
  imageCounterText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  peopleAvatarsContainerWithImages: {
    position: 'absolute',
    top: -8,
    right: 8,
    zIndex: 1000,
    elevation: 1000,
    pointerEvents: 'box-none',
    backgroundColor: 'transparent',
  },
  peopleAvatarsContainerNoImages: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1000,
    elevation: 1000,
    pointerEvents: 'box-none',
    backgroundColor: 'transparent',
  },
  text: {
    marginBottom: 2,
    marginTop: 4,
    marginLeft: 6,
    marginRight: 48,
    zIndex: 1,
  },
  noteText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  normalText: {
    color: colors.text,
  },
  linkText: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  toggleContainer: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginTop: 4,
    zIndex: 1,
  },
  toggleText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  locationTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginTop: 8,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 8,
    zIndex: 1,
  },
  locationWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 0.70,
    minWidth: 0,
  },
  locationTextChevronWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  location: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
    flexShrink: 1,
  },
  actionsRowWithLocation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 8,
  },
  timeAgoWrapper: {
    flex: 0.30,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  date: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'right',
  },
  deleteActionContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 0,
    width: '25%',
  },
  deleteAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: '100%',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 16,
  },
  deleteActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
});
