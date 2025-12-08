
import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, Linking, ScrollView, NativeScrollEvent, NativeSyntheticEvent, Alert, Platform } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { Note } from '@/types/Note';
import { IconSymbol } from './IconSymbol';
import { FullScreenImage } from './FullScreenImage';
import { TimeAgo } from './TimeAgo';
import { shareRecall } from '@/utils/shareRecall';
import { PeopleAvatars } from './PeopleAvatars';
import * as Haptics from 'expo-haptics';
import { NoteCardSkeleton } from './NoteCardSkeleton';
import { SkeletonLoader } from './SkeletonLoader';
import { getCachedImage, prefetchImages } from '@/utils/imageCache';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onImagePress?: () => void;
  loading?: boolean;
  expectedImageCount?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 8;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 5);
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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageScrollRef = useRef<ScrollView>(null);
  
  // Simplified state management with global cache
  const [loadedImages, setLoadedImages] = useState<Map<number, string>>(new Map());
  const [loadingImages, setLoadingImages] = useState<Set<number>>(new Set());
  const [errorImages, setErrorImages] = useState<Set<number>>(new Set());
  const [totalImageCount, setTotalImageCount] = useState(0);
  const loadingInProgressRef = useRef<Set<number>>(new Set());

  // OPTIMIZATION: Initialize with cached images and intelligent prefetching
  useEffect(() => {
    if (loading) {
      return;
    }

    const imageIds = note.imageIds || [];
    const images = note.images || [];
    
    // Determine total count - use expectedImageCount if provided (for pending uploads)
    const count = expectedImageCount || imageIds.length || images.length;
    setTotalImageCount(count);

    if (count === 0) {
      return;
    }

    // Load images using global cache with intelligent prefetching
    const loadInitialImages = async () => {
      const newLoadedImages = new Map<number, string>();

      // OPTIMIZATION: Load first TWO images immediately for better UX
      const immediateLoadPromises: Promise<void>[] = [];
      
      for (let i = 0; i < Math.min(2, count); i++) {
        const loadPromise = (async () => {
          if (images[i]) {
            newLoadedImages.set(i, images[i]);
          } else if (imageIds[i]) {
            const url = await getCachedImage(imageIds[i]);
            if (url) {
              newLoadedImages.set(i, url);
            }
          }
        })();
        immediateLoadPromises.push(loadPromise);
      }

      // Wait for first two images to load
      await Promise.all(immediateLoadPromises);
      setLoadedImages(newLoadedImages);
      setCurrentImageIndex(0);

      // OPTIMIZATION: Prefetch remaining images in background with priority
      if (count > 2) {
        const remainingImageIds = imageIds.slice(2);
        if (remainingImageIds.length > 0) {
          console.log(`[NoteCard] Prefetching ${remainingImageIds.length} remaining images for note ${note.id}`);
          
          // Prefetch in background (non-blocking)
          prefetchImages(remainingImageIds, 3).then(() => {
            // Update loaded images after prefetch
            const updatePromises = [];
            for (let i = 2; i < count; i++) {
              if (imageIds[i]) {
                const updatePromise = getCachedImage(imageIds[i]).then((url) => {
                  if (url) {
                    setLoadedImages((prev) => new Map(prev).set(i, url));
                  }
                });
                updatePromises.push(updatePromise);
              }
            }
            return Promise.all(updatePromises);
          }).catch((error) => {
            console.error('[NoteCard] Error during background prefetch:', error);
          });
        }
      }
    };

    loadInitialImages();
  }, [note.id, note.images, note.imageIds, loading, expectedImageCount]);

  // Show skeleton if loading
  if (loading) {
    return <NoteCardSkeleton />;
  }

  // OPTIMIZATION: Lazy load image with global cache and error handling
  const lazyLoadImage = useCallback(async (index: number) => {
    const imageIds = note.imageIds || [];
    
    if (index >= totalImageCount || !imageIds[index]) {
      return;
    }
    if (loadedImages.has(index)) {
      return;
    }
    if (loadingInProgressRef.current.has(index)) {
      return;
    }
    
    loadingInProgressRef.current.add(index);
    setLoadingImages((prev) => new Set(prev).add(index));
    
    try {
      const url = await getCachedImage(imageIds[index]);
      if (url) {
        setLoadedImages((prev) => new Map(prev).set(index, url));
        setLoadingImages((prev) => {
          const newSet = new Set(prev);
          newSet.delete(index);
          return newSet;
        });
      } else {
        setErrorImages((prev) => new Set(prev).add(index));
      }
    } catch (error) {
      console.error(`[NoteCard] Error lazy loading image at index ${index}:`, error);
      setErrorImages((prev) => new Set(prev).add(index));
    } finally {
      loadingInProgressRef.current.delete(index);
      setLoadingImages((prev) => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  }, [note.imageIds, totalImageCount, loadedImages]);

  // OPTIMIZATION: Improved scroll handler with intelligent prefetching
  const handleImageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / (IMAGE_WIDTH + IMAGE_SPACING));
    
    if (index >= 0 && index < totalImageCount) {
      setCurrentImageIndex(index);
      
      // OPTIMIZATION: Prefetch adjacent images with priority
      // Prefetch next 2 images and previous 1 image
      const imagesToPrefetch = [
        { index: index + 1, priority: 'high' },
        { index: index + 2, priority: 'medium' },
        { index: index - 1, priority: 'low' },
      ];
      
      imagesToPrefetch.forEach(({ index: prefetchIndex }) => {
        if (prefetchIndex >= 0 && prefetchIndex < totalImageCount && !loadedImages.has(prefetchIndex)) {
          lazyLoadImage(prefetchIndex);
        }
      });
    }
  }, [totalImageCount, loadedImages, lazyLoadImage]);

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

  const handleImagePress = useCallback((index: number) => {
    setFullScreenImageIndex(index);
    setShowFullScreenImage(true);
    if (onImagePress) {
      onImagePress();
    }
  }, [onImagePress]);

  const handleTextPress = useCallback(() => {
    onPress();
  }, [onPress]);

  const handleToggleExpand = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const handleLocationPress = useCallback(async () => {
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
  }, [note.latitude, note.longitude, note.location]);

  const handleSharePress = useCallback(async () => {
    try {
      await shareRecall(note, currentImageIndex);
    } catch (error) {
      console.error('Error sharing recall:', error);
      Alert.alert('Error', 'Failed to share recall. Please try again.');
    }
  }, [note, currentImageIndex]);

  // Build display array efficiently
  const displayImages = Array.from({ length: totalImageCount }, (_, index) => {
    return loadedImages.get(index) || '';
  });

  const hasPeople = note.people && note.people.length > 0;

  return (
    <View style={styles.card}>
      <Pressable onPress={onPress} style={styles.cardContent}>
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
                  {!imageUrl || loadingImages.has(index) ? (
                    <View style={styles.imageLoadingContainer}>
                      <SkeletonLoader
                        width={IMAGE_WIDTH}
                        height={IMAGE_HEIGHT}
                        borderRadius={12}
                        variant="wave"
                      />
                    </View>
                  ) : errorImages.has(index) ? (
                    <View style={styles.imageErrorContainer}>
                      <IconSymbol name="exclamationmark.triangle" size={40} color={colors.error} />
                      <Text style={styles.imageErrorText}>Failed to load image</Text>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: imageUrl }}
                      style={[styles.image, { width: IMAGE_WIDTH, height: IMAGE_HEIGHT }]}
                      resizeMode="cover"
                    />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            {totalImageCount > 1 && (
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>
                  {currentImageIndex + 1} / {totalImageCount}
                </Text>
              </View>
            )}
          </View>
        )}

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

        <View style={styles.locationTimeContainer}>
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
          
          <View style={styles.timeAgoWrapper}>
            <TimeAgo 
              date={note.created_at} 
              style={styles.date}
            />
          </View>
        </View>
      </Pressable>

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
