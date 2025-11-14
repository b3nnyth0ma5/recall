
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, Linking, Modal, ActivityIndicator, ScrollView, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import Animated, { 
  FadeIn, 
  FadeInDown, 
} from 'react-native-reanimated';
import { format } from 'date-fns';
import { colors } from '@/styles/commonStyles';
import { Note } from '@/types/Note';
import { IconSymbol } from './IconSymbol';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onImagePress?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 4);
const IMAGE_HEIGHT = IMAGE_WIDTH * 0.75;

// Helper function to check if text contains URLs
const hasUrl = (text: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
};

export function NoteCard({ note, onPress, onImagePress }: NoteCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullScreenImage, setShowFullScreenImage] = useState(false);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(0);
  const [imageLoadingStates, setImageLoadingStates] = useState<{ [key: number]: boolean }>({});
  const [imageErrorStates, setImageErrorStates] = useState<{ [key: number]: boolean }>({});
  const imageScrollRef = useRef<ScrollView>(null);
  const fullScreenScrollRef = useRef<ScrollView>(null);

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM d, yyyy • h:mm a');
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
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
  };

  const handleImageLoad = (index: number) => {
    setImageLoadingStates(prev => ({ ...prev, [index]: false }));
  };

  const handleImagePress = () => {
    setShowFullScreenImage(true);
    if (onImagePress) {
      onImagePress();
    }
  };

  const handleTextPress = () => {
    if (shouldShowToggle()) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleImageScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / (IMAGE_WIDTH + 12));
    if (index >= 0 && index < (note.images?.length || 0)) {
      // Update current image index if needed
    }
  };

  const handleModalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    if (index !== fullScreenImageIndex && index >= 0 && index < (note.images?.length || 0)) {
      setFullScreenImageIndex(index);
    }
  };

  const handleLocationPress = async () => {
    if (!note.latitude || !note.longitude) {
      console.log('No location coordinates available');
      return;
    }

    const { latitude, longitude } = note;
    const locationName = note.location || '';
    
    try {
      // Use universal URL format with location name for better context
      let universalUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      
      // If we have a location name, include it in the query for better context
      if (locationName) {
        const encodedLocationName = encodeURIComponent(locationName);
        universalUrl = `https://www.google.com/maps/search/?api=1&query=${encodedLocationName}&query_place_id=${latitude},${longitude}`;
      }
      
      console.log('Opening maps with URL:', universalUrl);
      console.log('Location name:', locationName);
      console.log('Coordinates:', { latitude, longitude });
      
      const canOpen = await Linking.canOpenURL(universalUrl);
      
      if (canOpen) {
        await Linking.openURL(universalUrl);
        console.log('Successfully opened maps with location:', locationName);
      } else {
        console.error('Cannot open maps URL');
      }
    } catch (error) {
      console.error('Error opening maps:', error);
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.card}>
      <Pressable onPress={onPress} style={styles.cardContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.date}>{formatDateTime(note.created_at)}</Text>
        </View>

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
              <Text style={styles.toggleText}>
                {isExpanded ? 'Show less' : 'Show more'}
              </Text>
            )}
          </Pressable>
        )}

        {/* Images */}
        {note.images && note.images.length > 0 && (
          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.imagesContainer}>
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imagesScrollContent}
              onScroll={handleImageScroll}
              scrollEventThrottle={16}
              decelerationRate={0.9}
              snapToInterval={IMAGE_WIDTH + 12}
              snapToAlignment="start"
            >
              {note.images.map((imageUrl, index) => (
                <Pressable 
                  key={`${note.id}-image-${index}`}
                  onPress={handleImagePress}
                  style={styles.imageWrapper}
                >
                  {imageLoadingStates[index] && (
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
                      style={styles.image}
                      resizeMode="cover"
                      onLoadStart={() => setImageLoadingStates(prev => ({ ...prev, [index]: true }))}
                      onLoad={() => handleImageLoad(index)}
                      onError={() => handleImageError(index)}
                    />
                  )}
                </Pressable>
              ))}
            </ScrollView>
            {note.images.length > 1 && (
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>
                  {note.images.length} {note.images.length === 1 ? 'image' : 'images'}
                </Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* Location - Now Clickable */}
        {note.location && (
          <Pressable 
            onPress={handleLocationPress}
            style={styles.locationContainer}
          >
            <IconSymbol name="location.fill" size={14} color={colors.primary} />
            <Text style={styles.location}>{note.location}</Text>
            <IconSymbol name="chevron.right" size={12} color={colors.primary} />
          </Pressable>
        )}
      </Pressable>

      {/* Full Screen Image Modal */}
      <Modal
        visible={showFullScreenImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFullScreenImage(false)}
      >
        <View style={styles.fullScreenContainer}>
          <Pressable 
            style={styles.fullScreenCloseButton}
            onPress={() => setShowFullScreenImage(false)}
          >
            <View style={styles.closeButtonCircle}>
              <IconSymbol name="xmark" size={24} color="#FFFFFF" />
            </View>
          </Pressable>

          <ScrollView
            ref={fullScreenScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleModalScroll}
            scrollEventThrottle={16}
            snapToInterval={SCREEN_WIDTH}
            decelerationRate="fast"
            style={styles.fullScreenScrollView}
            contentOffset={{ x: fullScreenImageIndex * SCREEN_WIDTH, y: 0 }}
          >
            {note.images?.map((imageUrl, index) => (
              <View key={`fullscreen-${note.id}-${index}`} style={styles.fullScreenImageWrapper}>
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
              </View>
            ))}
          </ScrollView>

          {note.images && note.images.length > 1 && (
            <>
              <View style={styles.fullScreenPaginationContainer}>
                {note.images.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.fullScreenPaginationDot,
                      fullScreenImageIndex === index && styles.fullScreenPaginationDotActive,
                    ]}
                  />
                ))}
              </View>
              <View style={styles.fullScreenCounterBadge}>
                <Text style={styles.fullScreenCounterText}>
                  {fullScreenImageIndex + 1} / {note.images.length}
                </Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  cardContent: {
    padding: CARD_PADDING,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  date: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 4,
  },
  normalText: {
    color: colors.text,
  },
  linkText: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  toggleText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  imagesContainer: {
    marginTop: 12,
    marginHorizontal: -CARD_PADDING,
    position: 'relative',
  },
  imagesScrollContent: {
    paddingHorizontal: CARD_PADDING,
  },
  imageWrapper: {
    marginRight: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardDark,
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardDark,
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
    right: CARD_PADDING + 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  imageCounterText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  location: {
    fontSize: 14,
    color: colors.primary,
    flex: 1,
    fontWeight: '500',
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  closeButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenScrollView: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  fullScreenImageWrapper: {
    width: SCREEN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  fullScreenPaginationContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  fullScreenPaginationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  fullScreenPaginationDotActive: {
    width: 28,
    backgroundColor: '#FFFFFF',
  },
  fullScreenCounterBadge: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    zIndex: 10,
  },
  fullScreenCounterText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
