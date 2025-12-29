
import React, { useState, useRef, useEffect, memo, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, Linking, ScrollView, NativeScrollEvent, NativeSyntheticEvent, Platform, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { Note } from '@/types/Note';
import { IconSymbol } from './IconSymbol';
import { FullScreenImage } from './FullScreenImage';
import { TimeAgo } from './TimeAgo';
import { shareRecall } from '@/utils/shareRecall';
import { getImageDataUrl } from '@/utils/supabase';
import { PeopleAvatars } from './PeopleAvatars';
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

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onImagePress?: () => void;
  onDelete?: () => void;
  loading?: boolean;
  expectedImageCount?: number;
  isSearchResult?: boolean; // Flag to indicate if this is a search result
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 8;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 4.8);
// FIXED: Reduced image height by 10% (from 1.08 to 0.972)
const IMAGE_HEIGHT = IMAGE_WIDTH * 0.972;
const IMAGE_SPACING = 3;

// Helper function to check if text contains URLs
const hasUrl = (text: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
};

// Helper function to count newline characters
// Updated to include all NSCharacterSet.newlines characters:
// U+000A (Line Feed - \n)
// U+000D (Carriage Return - \r)
// U+0085 (Next Line)
// U+2028 (Line Separator)
// U+2029 (Paragraph Separator)
const countNewlines = (text: string): number => {
  // Match all newline characters from NSCharacterSet.newlines
  const newlineRegex = /[\n\r\u0085\u2028\u2029]/g;
  const matches = text.match(newlineRegex);
  return matches ? matches.length : 0;
};

// Memoized component for better performance
export const NoteCard = memo(function NoteCard({ 
  note, 
  onPress, 
  onImagePress, 
  onDelete, 
  loading = false, 
  expectedImageCount,
  isSearchResult = false 
}: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [imageLoadingStates, setImageLoadingStates] = useState<{ [key: number]: boolean }>({});
  const [imageErrorStates, setImageErrorStates] = useState<{ [key: number]: boolean }>({});
  const [imageLoadedStates, setImageLoadedStates] = useState<{ [key: number]: boolean }>({});
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
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

  // Sort images by match percentage if this is a search result
  const sortedImageData = useMemo(() => {
    if (!isSearchResult || !note.imageMatchData || note.imageMatchData.length === 0) {
      // Return original order with indices
      return (note.imageIds || []).map((id, index) => ({
        imageId: id,
        originalIndex: index,
        similarity: 0,
      }));
    }

    // Create a map of imageId to match data
    const matchDataMap = new Map(
      note.imageMatchData.map(data => [data.imageId, data])
    );

    // Map imageIds with their match data and original indices
    const imageDataWithIndices = (note.imageIds || []).map((id, index) => {
      const matchData = matchDataMap.get(id);
      return {
        imageId: id,
        originalIndex: index,
        similarity: matchData?.similarity || 0,
      };
    });

    // Sort by similarity (highest first) for search results
    return imageDataWithIndices.sort((a, b) => b.similarity - a.similarity);
  }, [isSearchResult, note.imageMatchData, note.imageIds]);

  // Initialize with first TWO images for better performance
  useEffect(() => {
    if (!loading && note.images && note.images.length > 0) {
      // Set total count immediately
      setTotalImageCount(note.images.length);
      
      // For search results, load images in sorted order
      if (isSearchResult && sortedImageData.length > 0) {
        // Load first two images in sorted order
        const firstTwoSortedIndices = sortedImageData.slice(0, 2).map(d => d.originalIndex);
        const imagesToLoad = firstTwoSortedIndices.map(idx => note.images[idx]).filter(Boolean);
        setLazyLoadedImages(imagesToLoad);
        console.log(`[NoteCard] Initialized search result with first ${imagesToLoad.length} sorted image(s) for note ${note.id}`);
      } else {
        // Load first two images in original order
        const imagesToLoad = note.images.length > 1 ? note.images.slice(0, 2) : [note.images[0]];
        setLazyLoadedImages(imagesToLoad);
        console.log(`[NoteCard] Initialized with first ${imagesToLoad.length} image(s) for note ${note.id}`);
      }
      
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
      console.log(`[NoteCard] Set total image count to ${note.imageIds.length} from imageIds for note ${note.id}`);
      
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
      console.log(`[NoteCard] Set total image count to ${expectedImageCount} from expectedImageCount for note ${note.id}`);
    } else {
      setIsUploadingImages(false);
    }
  }, [note.id, note.images, note.imageIds, loading, expectedImageCount, isSearchResult, sortedImageData]);

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

  // Show skeleton if loading
  if (loading) {
    return <NoteCardSkeleton />;
  }

  // Optimized lazy load with queue management
  const lazyLoadImage = async (sortedIndex: number) => {
    if (!note.imageIds || sortedIndex >= sortedImageData.length) {
      return;
    }
    
    // Get the original index from sorted data
    const originalIndex = sortedImageData[sortedIndex].originalIndex;
    
    if (lazyLoadedImages[sortedIndex]) {
      return;
    }
    if (loadingQueueRef.current.has(sortedIndex)) {
      return;
    }
    
    loadingQueueRef.current.add(sortedIndex);
    setIsLazyLoading(true);
    
    try {
      const imageIdToLoad = note.imageIds[originalIndex];
      if (imageIdToLoad) {
        const imageUrl = await getImageDataUrl(imageIdToLoad);
        if (imageUrl) {
          setLazyLoadedImages(prev => {
            const newImages = [...prev];
            newImages[sortedIndex] = imageUrl;
            return newImages;
          });
          console.log(`[NoteCard] Successfully lazy loaded image at sorted index ${sortedIndex} (original index ${originalIndex})`);
        }
      }
    } catch (error) {
      console.error(`[NoteCard] Error lazy loading image at sorted index ${sortedIndex}:`, error);
    } finally {
      loadingQueueRef.current.delete(sortedIndex);
      setIsLazyLoading(false);
    }
  };

  // Optimized image scroll handler with prefetching
  const handleImageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / (IMAGE_WIDTH + IMAGE_SPACING));
    
    if (index >= 0 && index < totalImageCount) {
      setCurrentImageIndex(index);
      
      // Prefetch next image
      if (totalImageCount > 2) {
        const nextIndex = index + 1;
        if (nextIndex < totalImageCount && !lazyLoadedImages[nextIndex]) {
          lazyLoadImage(nextIndex);
        }
      }
    }
  };

  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <Text
            key={index}
            style={styles.linkText}
            onPress={(e) => {
              e.stopPropagation();
              console.log('Opening URL:', part);
              Linking.openURL(part).catch(err => {
                console.error('Failed to open URL:', err);
              });
            }}
          >
            {part}
          </Text>
        );
      }
      return <Text key={index} style={styles.normalText}>{part}</Text>;
    });
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

  // Updated: Check for text length > 125 OR more than 6 newlines
  const shouldShowToggle = () => {
    if (!note.text) {
      return false;
    }
    const newlineCount = countNewlines(note.text);
    return note.text.length > 125 || newlineCount > 6;
  };

  const handleImageError = (index: number) => {
    console.error('Error loading image at index:', index);
    setImageErrorStates(prev => ({ ...prev, [index]: true }));
    setImageLoadingStates(prev => ({ ...prev, [index]: false }));
    setImageLoadedStates(prev => ({ ...prev, [index]: false }));
  };

  const handleImageLoadStart = (index: number) => {
    // Only set loading state if the image hasn't been loaded before
    if (!imageLoadedStates[index]) {
      setImageLoadingStates(prev => ({ ...prev, [index]: true }));
    }
  };

  const handleImageLoad = (index: number) => {
    // Mark as loaded and stop showing loading indicator
    setImageLoadingStates(prev => ({ ...prev, [index]: false }));
    setImageLoadedStates(prev => ({ ...prev, [index]: true }));
  };

  const handleImagePress = (sortedIndex: number) => {
    // Convert sorted index back to original index for full screen view
    const originalIndex = sortedImageData[sortedIndex].originalIndex;
    setFullScreenImageIndex(originalIndex);
    setShowFullScreenImage(true);
    if (onImagePress) {
      onImagePress();
    }
  };

  const handleTextPress = () => {
    // Open note editor when text is clicked
    onPress();
  };

  const handleToggleExpand = (e: any) => {
    // Stop propagation to prevent opening the note editor
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleLocationPress = async () => {
    if (!note.latitude || !note.longitude) {
      console.log('No location coordinates available');
      return;
    }

    // Trigger heavy haptic feedback
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
      // Use universal URL format with location name for better context
      let universalUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      
      // If we have a location name, include it in the query for better context
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

  const handleSharePress = async () => {
    try {
      await shareRecall(note, currentImageIndex);
    } catch (error) {
      console.error('Error sharing recall:', error);
    }
  };

  const handleDelete = async () => {
    console.log('[NoteCard] Delete action triggered - starting deletion animation');
    
    // Close the swipeable immediately
    swipeableRef.current?.close();
    
    // Trigger success haptic feedback FIRST
    if (Platform.OS !== 'web') {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log('[NoteCard] Success haptic feedback triggered');
      } catch (error) {
        console.error('[NoteCard] Error triggering haptic feedback:', error);
      }
    }
    
    // Animate deletion: fade out and scale down smoothly
    opacity.value = withTiming(0, { duration: 300 });
    scale.value = withTiming(0.9, { duration: 300 });
    height.value = withTiming(0, { duration: 300 }, (finished) => {
      if (finished) {
        // Call onDelete callback after animation completes
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

  // Create display array with sorted images for search results
  const displayImages = useMemo(() => {
    if (totalImageCount === 0) {
      return [];
    }

    return Array.from({ length: totalImageCount }, (_, sortedIndex) => {
      const originalIndex = sortedImageData[sortedIndex]?.originalIndex;
      
      // First check if we have a lazy loaded image at this sorted position
      if (lazyLoadedImages[sortedIndex]) {
        return lazyLoadedImages[sortedIndex];
      }
      
      // Then check if we have the image in the note.images array at the original index
      if (originalIndex !== undefined && note.images && note.images[originalIndex]) {
        return note.images[originalIndex];
      }
      
      // Otherwise return empty string for placeholder
      return '';
    });
  }, [totalImageCount, sortedImageData, lazyLoadedImages, note.images]);

  // Check if note has people mentioned
  const hasPeople = note.people && note.people.length > 0;
  const hasImages = displayImages && displayImages.length > 0;

  return (
    <Animated.View style={[styles.card, animatedCardStyle]}>
      {/* Images - Displayed FIRST if available */}
      {hasImages && (
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
            {displayImages.map((imageUrl, sortedIndex) => {
              const matchData = isSearchResult && sortedImageData[sortedIndex] 
                ? sortedImageData[sortedIndex] 
                : null;
              
              return (
                <Pressable 
                  key={`${note.id}-image-${sortedIndex}`}
                  onPress={() => handleImagePress(sortedIndex)}
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
                      {imageLoadingStates[sortedIndex] && !imageErrorStates[sortedIndex] && !imageLoadedStates[sortedIndex] && (
                        <View style={styles.imageLoadingContainer}>
                          <SkeletonLoader
                            width={IMAGE_WIDTH}
                            height={IMAGE_HEIGHT}
                            borderRadius={12}
                            variant="wave"
                          />
                        </View>
                      )}
                      {imageErrorStates[sortedIndex] ? (
                        <View style={styles.imageErrorContainer}>
                          <IconSymbol name="exclamationmark.triangle" size={40} color={colors.error} />
                          <Text style={styles.imageErrorText}>Failed to load image</Text>
                        </View>
                      ) : (
                        <>
                          <Image
                            source={{ uri: imageUrl }}
                            style={[styles.image, { width: IMAGE_WIDTH, height: IMAGE_HEIGHT }]}
                            resizeMode="cover"
                            onLoadStart={() => handleImageLoadStart(sortedIndex)}
                            onLoad={() => handleImageLoad(sortedIndex)}
                            onError={() => handleImageError(sortedIndex)}
                          />
                          {/* Show match percentage badge for search results */}
                          {isSearchResult && matchData && matchData.similarity > 0 && (
                            <View style={styles.matchBadge}>
                              <Text style={styles.matchBadgeText}>
                                {Math.round(matchData.similarity * 100)}% match
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          {/* Image counter with busy spinner - visible immediately */}
          {totalImageCount > 0 && (
            <View style={styles.imageCounter}>
              {isUploadingImages && (
                <ActivityIndicator 
                  size="small" 
                  color="#FFFFFF" 
                  style={styles.imageCounterSpinner}
                />
              )}
              <Text style={styles.imageCounterText}>
                {totalImageCount > 1 ? `${currentImageIndex + 1} / ${totalImageCount}` : `1 / ${totalImageCount}`}
              </Text>
            </View>
          )}
          
          {/* People Avatars - Positioned absolutely at top right OVER the image */}
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

      {/* Swipeable Content - Text, Location, Time - FULL WIDTH DELETE UI */}
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
        containerStyle={styles.swipeableContainer}
      >
        <Pressable onPress={onPress} style={styles.cardContent}>
          {/* People Avatars - For text-only notes, show at top of card content */}
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

          {/* Text Content */}
          {note.text && (
            <Pressable onPress={handleTextPress}>
              <Text style={styles.text}>
                {hasUrl(note.text) ? (
                  renderTextWithLinks(isExpanded ? note.text : getPreviewText())
                ) : (
                  isExpanded ? note.text : getPreviewText()
                )}
              </Text>
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
          )}

          {/* Location and Time on the same line */}
          <View style={styles.locationTimeContainer}>
            {/* Location - Left-aligned, occupies 75% of space */}
            {note.location && (
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
            )}
            
            {/* Time Ago - Right-aligned, occupies remaining space */}
            <View style={styles.timeAgoWrapper}>
              <TimeAgo 
                date={note.created_at} 
                style={styles.date}
              />
            </View>
          </View>
        </Pressable>
      </Swipeable>

      {/* Full Screen Image Component - Pass original images array, not lazy loaded */}
      {note.images && note.images.length > 0 && (
        <FullScreenImage
          visible={showFullScreenImage}
          images={note.images}
          imageIds={note.imageIds}
          initialIndex={fullScreenImageIndex}
          onClose={() => setShowFullScreenImage(false)}
        />
      )}
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if note data actually changed or loading state changed
  return (
    prevProps.note.id === nextProps.note.id &&
    prevProps.note.updated_at === nextProps.note.updated_at &&
    prevProps.note.images?.length === nextProps.note.images?.length &&
    prevProps.note.imageIds?.length === nextProps.note.imageIds?.length &&
    prevProps.note.people?.length === nextProps.note.people?.length &&
    prevProps.loading === nextProps.loading &&
    prevProps.expectedImageCount === nextProps.expectedImageCount &&
    prevProps.isSearchResult === nextProps.isSearchResult &&
    JSON.stringify(prevProps.note.imageMatchData) === JSON.stringify(nextProps.note.imageMatchData)
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
    marginBottom: 12,
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
    position: 'relative',
  },
  image: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },
  matchBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255, 107, 122, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 100,
  },
  matchBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
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
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginBottom: 2,
    marginTop: 4,
    marginLeft: 6,
    marginRight: 48,
    zIndex: 1,
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
