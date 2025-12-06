
import React, { useState, useRef, useEffect, memo } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, Linking, ActivityIndicator, ScrollView, NativeScrollEvent, NativeSyntheticEvent, Alert, Platform } from 'react-native';
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

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onImagePress?: () => void;
  loading?: boolean;
  expectedImageCount?: number; // NEW: Expected total image count for newly created notes
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 8;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 5);
// Reduced by 10%: (IMAGE_WIDTH * 1.25) * 0.9 = IMAGE_WIDTH * 1.125
const IMAGE_HEIGHT = IMAGE_WIDTH * 1.1;
const IMAGE_SPACING = 12;

// Helper function to check if text contains URLs
const hasUrl = (text: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
};

// Memoized component for better performance
export const NoteCard = memo(function NoteCard({ note, onPress, onImagePress, loading = false, expectedImageCount }: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [imageLoadingStates, setImageLoadingStates] = useState<{ [key: number]: boolean }>({});
  const [imageErrorStates, setImageErrorStates] = useState<{ [key: number]: boolean }>({});
  const [imageLoadedStates, setImageLoadedStates] = useState<{ [key: number]: boolean }>({});
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageScrollRef = useRef<ScrollView>(null);
  
  // Optimized lazy loading state for images
  const [lazyLoadedImages, setLazyLoadedImages] = useState<string[]>([]);
  const [isLazyLoading, setIsLazyLoading] = useState(false);
  const loadingQueueRef = useRef<Set<number>>(new Set());
  
  // FIXED: Track total image count separately from loaded images
  // This ensures we always show the correct count even if images haven't loaded yet
  const [totalImageCount, setTotalImageCount] = useState(0);

  // Initialize with first TWO images for better performance
  // MOVED BEFORE THE CONDITIONAL RETURN TO FIX HOOKS RULE
  useEffect(() => {
    if (!loading && note.images && note.images.length > 0) {
      // Set total count immediately
      setTotalImageCount(note.images.length);
      
      // Load first two images immediately if available
      const imagesToLoad = note.images.length > 1 ? note.images.slice(0, 2) : [note.images[0]];
      setLazyLoadedImages(imagesToLoad);
      // Initialize currentImageIndex to 0 to show counter immediately
      setCurrentImageIndex(0);
      console.log(`[NoteCard] Initialized with first ${imagesToLoad.length} image(s) for note ${note.id}, total count: ${note.images.length}`);
    } else if (!loading && note.imageIds && note.imageIds.length > 0) {
      // FIXED: If we have imageIds but no images yet (placeholder records), set the count
      setTotalImageCount(note.imageIds.length);
      console.log(`[NoteCard] Set total image count to ${note.imageIds.length} from imageIds for note ${note.id}`);
    } else if (!loading && expectedImageCount && expectedImageCount > 0) {
      // FIXED: Use expectedImageCount if provided (for newly created notes with pending uploads)
      setTotalImageCount(expectedImageCount);
      console.log(`[NoteCard] Set total image count to ${expectedImageCount} from expectedImageCount for note ${note.id}`);
    }
  }, [note.id, note.images, note.imageIds, loading, expectedImageCount]);

  // Show skeleton if loading
  if (loading) {
    return <NoteCardSkeleton />;
  }

  // Optimized lazy load with queue management
  const lazyLoadImage = async (index: number) => {
    if (!note.images || index >= note.images.length) return;
    if (lazyLoadedImages[index]) return; // Already loaded
    if (loadingQueueRef.current.has(index)) return; // Already in queue
    
    loadingQueueRef.current.add(index);
    setIsLazyLoading(true);
    
    try {
      const imageIdToLoad = note.imageIds?.[index];
      if (imageIdToLoad) {
        const imageUrl = await getImageDataUrl(imageIdToLoad);
        if (imageUrl) {
          setLazyLoadedImages(prev => {
            const newImages = [...prev];
            newImages[index] = imageUrl;
            return newImages;
          });
          console.log(`[NoteCard] Successfully lazy loaded image at index ${index}`);
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

  const shouldShowToggle = () => {
    return note.text && note.text.length > 150;
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

  const handleImagePress = (index: number) => {
    setFullScreenImageIndex(index);
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
      Alert.alert('Error', 'Failed to share recall. Please try again.');
    }
  };

  // FIXED: Create display array with placeholders based on totalImageCount
  // This ensures the carousel shows all image slots with placeholders
  const displayImages = totalImageCount > 0 
    ? Array.from({ length: totalImageCount }, (_, index) => lazyLoadedImages[index] || '') 
    : [];

  // Check if note has people mentioned
  const hasPeople = note.people && note.people.length > 0;

  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={styles.cardContent}>
        {/* People Avatars - Top Right Edge (Superscript Position) */}
        {hasPeople && (
          <View style={styles.peopleAvatarsContainer}>
            <PeopleAvatars 
              people={note.people || []} 
              maxVisible={5}
              avatarSize={36}
              overlapOffset={8}
            />
          </View>
        )}

        {/* Images - Now displayed FIRST */}
        {displayImages && displayImages.length > 0 && (
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
              {displayImages.map((imageUrl, index) => (
                <Pressable 
                  key={`${note.id}-image-${index}`}
                  onPress={() => handleImagePress(index)}
                  style={styles.imageWrapper}
                >
                  {!imageUrl ? (
                    <View style={styles.imageLoadingContainer}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={styles.loadingText}>Loading...</Text>
                    </View>
                  ) : (
                    <>
                      {imageLoadingStates[index] && !imageErrorStates[index] && !imageLoadedStates[index] && (
                        <View style={styles.imageLoadingContainer}>
                          <ActivityIndicator size="large" color={colors.primary} />
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
              ))}
            </ScrollView>
            {/* FIXED: Use totalImageCount for accurate count display */}
            {totalImageCount > 1 && (
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>
                  {currentImageIndex + 1} / {totalImageCount}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Text Content - Now displayed AFTER images */}
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
                <IconSymbol name="chevron.right" size={14} color={colors.primary} />
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
    </View>
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
    prevProps.expectedImageCount === nextProps.expectedImageCount
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
  },
  cardContent: {
    padding: 4,
    position: 'relative',
    overflow: 'visible',
    borderRadius: 16,
  },
  peopleAvatarsContainer: {
    position: 'absolute',
    top: -10,
    right: 8,
    zIndex: 1000,
    elevation: 10,
  },
  imagesContainer: {
    marginBottom: 12,
    marginHorizontal: -CARD_PADDING,
    position: 'relative',
    zIndex: 1,
  },
  imagesScrollContent: {
    paddingHorizontal: CARD_PADDING,
  },
  imageWrapper: {
    marginRight: IMAGE_SPACING,
    borderRadius: 12,
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
    zIndex: 2,
  },
  imageCounterText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 4,
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
    paddingHorizontal: 8,
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
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    fontSize: 14,
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
});
