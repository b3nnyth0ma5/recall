
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ScrollView, Linking, Modal, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';
import { format } from 'date-fns';
import Animated, { 
  FadeIn, 
  FadeInDown, 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onImagePress?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 4;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 2);
const IMAGE_HEIGHT = 400;

export function NoteCard({ note, onPress, onImagePress }: NoteCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullText, setShowFullText] = useState(false);
  const [imageErrors, setImageErrors] = useState<{ [key: number]: boolean }>({});
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImageIndex, setModalImageIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<{ [key: number]: boolean }>({});
  const modalScrollViewRef = useRef<ScrollView>(null);
  const scrollX = useSharedValue(0);
  const modalScrollX = useSharedValue(0);

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM d, yyyy \'at\' HH:mm');
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const hasUrl = (text: string): boolean => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return urlRegex.test(text);
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
            onPress={() => {
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
      return <Text key={index}>{part}</Text>;
    });
  };

  const getPreviewText = () => {
    if (!note.text) return '';
    const lines = note.text.split('\n');
    const maxLines = hasUrl(note.text) ? 4 : 3;
    const maxChars = hasUrl(note.text) ? 200 : 125;
    
    if (lines.length <= maxLines && note.text.length <= maxChars) {
      return note.text;
    }
    
    if (showFullText) {
      return note.text;
    }
    
    const preview = lines.slice(0, maxLines).join('\n');
    return preview.length > maxChars ? preview.substring(0, maxChars) + '...' : preview;
  };

  const shouldShowToggle = () => {
    if (!note.text) return false;
    const lines = note.text.split('\n');
    const maxLines = hasUrl(note.text) ? 4 : 3;
    const maxChars = hasUrl(note.text) ? 200 : 125;
    return lines.length > maxLines || note.text.length > maxChars;
  };

  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    scrollX.value = contentOffsetX;
    const index = Math.round(contentOffsetX / IMAGE_WIDTH);
    console.log('Card carousel scroll - offset:', contentOffsetX, 'index:', index);
    setCurrentImageIndex(index);
  };

  const handleModalScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    modalScrollX.value = contentOffsetX;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    console.log('Modal carousel scroll - offset:', contentOffsetX, 'index:', index);
    setModalImageIndex(index);
  };

  const handleImageError = (index: number) => {
    console.error(`Error loading image at index ${index} for note ${note.id}`);
    console.error('Image URL:', note.images?.[index]);
    setImageErrors(prev => ({ ...prev, [index]: true }));
  };

  const handleImageLoad = (index: number) => {
    console.log(`Image ${index} loaded successfully for note ${note.id}`);
    setLoadedImages(prev => ({ ...prev, [index]: true }));
  };

  const handleImagePress = () => {
    setModalImageIndex(currentImageIndex);
    setShowImageModal(true);
    setTimeout(() => {
      if (modalScrollViewRef.current) {
        modalScrollViewRef.current.scrollTo({ x: currentImageIndex * SCREEN_WIDTH, animated: false });
      }
    }, 100);
    if (onImagePress) {
      onImagePress();
    }
  };

  const handleTextPress = () => {
    onPress();
  };

  const allImages = note.images || [];
  const validImages = allImages.filter((_, index) => !imageErrors[index]);
  const hasValidImages = validImages.length > 0;

  return (
    <>
      <Animated.View entering={FadeInDown.duration(400)} style={styles.container}>
        {hasValidImages && (
          <Pressable onPress={handleImagePress} style={styles.imageContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              snapToInterval={IMAGE_WIDTH}
              decelerationRate="fast"
              contentContainerStyle={styles.scrollViewContent}
              style={styles.scrollView}
            >
              {allImages.map((imageUrl, index) => {
                if (imageErrors[index]) {
                  return null;
                }

                return (
                  <AnimatedImageItem
                    key={index}
                    imageUrl={imageUrl}
                    index={index}
                    scrollX={scrollX}
                    imageWidth={IMAGE_WIDTH}
                    isLoaded={loadedImages[index]}
                    onError={() => handleImageError(index)}
                    onLoad={() => handleImageLoad(index)}
                  />
                );
              })}
            </ScrollView>
            
            {validImages.length > 1 && (
              <View style={styles.indicatorContainer}>
                {validImages.map((_, index) => (
                  <AnimatedDot
                    key={index}
                    index={index}
                    scrollX={scrollX}
                    imageWidth={IMAGE_WIDTH}
                  />
                ))}
              </View>
            )}

            {/* Image counter badge */}
            {validImages.length > 1 && (
              <View style={styles.counterBadge}>
                <Text style={styles.counterText}>
                  {currentImageIndex + 1} / {validImages.length}
                </Text>
              </View>
            )}
          </Pressable>
        )}

        <Pressable onPress={handleTextPress} style={styles.pressable}>
          {note.text && (
            <View style={styles.textContainer}>
              <Text style={styles.noteText}>
                {renderTextWithLinks(getPreviewText())}
              </Text>
              {shouldShowToggle() && (
                <View style={styles.showMoreContainer}>
                  <Pressable onPress={(e) => {
                    e.stopPropagation();
                    setShowFullText(!showFullText);
                  }}>
                    <Text style={styles.showMoreText}>
                      {showFullText ? 'Show Less' : 'Show More'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}

          <View style={styles.metadataContainer}>
            <View style={styles.locationContainer}>
              {note.location && (
                <>
                  <IconSymbol name="location.fill" size={14} color={colors.textSecondary} />
                  <Text style={styles.locationText}>{note.location}</Text>
                </>
              )}
            </View>
            <Text style={styles.dateText}>{formatDateTime(note.created_at)}</Text>
          </View>
        </Pressable>
      </Animated.View>

      {/* Full-screen image preview modal */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable 
            style={styles.modalCloseButton}
            onPress={() => setShowImageModal(false)}
          >
            <View style={styles.closeButtonCircle}>
              <IconSymbol name="xmark" size={24} color="#FFFFFF" />
            </View>
          </Pressable>

          <ScrollView
            ref={modalScrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleModalScroll}
            scrollEventThrottle={16}
            snapToInterval={SCREEN_WIDTH}
            decelerationRate="fast"
            contentContainerStyle={styles.modalScrollViewContent}
            style={styles.modalScrollView}
          >
            {allImages.map((imageUrl, index) => {
              if (imageErrors[index]) {
                return null;
              }

              return (
                <View key={index} style={styles.modalImageWrapper}>
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.modalImage}
                    resizeMode="contain"
                  />
                </View>
              );
            })}
          </ScrollView>

          {validImages.length > 1 && (
            <View style={styles.modalIndicatorContainer}>
              {validImages.map((_, index) => (
                <AnimatedModalDot
                  key={index}
                  index={index}
                  scrollX={modalScrollX}
                  imageWidth={SCREEN_WIDTH}
                />
              ))}
            </View>
          )}

          {/* Modal counter badge */}
          {validImages.length > 1 && (
            <View style={styles.modalCounterBadge}>
              <Text style={styles.modalCounterText}>
                {modalImageIndex + 1} / {validImages.length}
              </Text>
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

// Animated Image Item Component
interface AnimatedImageItemProps {
  imageUrl: string;
  index: number;
  scrollX: Animated.SharedValue<number>;
  imageWidth: number;
  isLoaded?: boolean;
  onError: () => void;
  onLoad: () => void;
}

function AnimatedImageItem({ 
  imageUrl, 
  index, 
  scrollX, 
  imageWidth, 
  isLoaded,
  onError, 
  onLoad 
}: AnimatedImageItemProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * imageWidth,
      index * imageWidth,
      (index + 1) * imageWidth,
    ];

    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.9, 1, 0.9],
      Extrapolate.CLAMP
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.6, 1, 0.6],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ scale }],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.imageWrapper, animatedStyle]}>
      {!isLoaded && (
        <View style={styles.imagePlaceholder}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <Image
        source={{ uri: imageUrl }}
        style={styles.image}
        resizeMode="cover"
        onError={onError}
        onLoad={onLoad}
      />
    </Animated.View>
  );
}

// Animated Dot Indicator Component
interface AnimatedDotProps {
  index: number;
  scrollX: Animated.SharedValue<number>;
  imageWidth: number;
}

function AnimatedDot({ index, scrollX, imageWidth }: AnimatedDotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * imageWidth,
      index * imageWidth,
      (index + 1) * imageWidth,
    ];

    const width = interpolate(
      scrollX.value,
      inputRange,
      [6, 24, 6],
      Extrapolate.CLAMP
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.5, 1, 0.5],
      Extrapolate.CLAMP
    );

    return {
      width: withSpring(width, { damping: 15, stiffness: 150 }),
      opacity: withSpring(opacity, { damping: 15, stiffness: 150 }),
    };
  });

  return <Animated.View style={[styles.indicator, animatedStyle]} />;
}

// Animated Modal Dot Indicator Component
function AnimatedModalDot({ index, scrollX, imageWidth }: AnimatedDotProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * imageWidth,
      index * imageWidth,
      (index + 1) * imageWidth,
    ];

    const width = interpolate(
      scrollX.value,
      inputRange,
      [8, 28, 8],
      Extrapolate.CLAMP
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.5, 1, 0.5],
      Extrapolate.CLAMP
    );

    return {
      width: withSpring(width, { damping: 15, stiffness: 150 }),
      opacity: withSpring(opacity, { damping: 15, stiffness: 150 }),
    };
  });

  return <Animated.View style={[styles.modalIndicator, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: colors.card,
    overflow: 'hidden',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.5)',
    elevation: 4,
  },
  pressable: {
    width: '100%',
  },
  imageContainer: {
    width: '100%',
    height: IMAGE_HEIGHT,
    position: 'relative',
    backgroundColor: colors.cardDark,
  },
  scrollView: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },
  scrollViewContent: {
    flexDirection: 'row',
  },
  imageWrapper: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imagePlaceholder: {
    position: 'absolute',
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardDark,
    zIndex: 1,
  },
  image: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  indicator: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  counterBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  counterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  textContainer: {
    padding: 16,
  },
  noteText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginBottom: 8,
  },
  linkText: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  showMoreContainer: {
    alignItems: 'flex-end',
  },
  showMoreText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  metadataContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  locationText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  dateText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
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
  modalScrollView: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  modalScrollViewContent: {
    flexDirection: 'row',
  },
  modalImageWrapper: {
    width: SCREEN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  modalIndicatorContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  modalIndicator: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  modalCounterBadge: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  modalCounterText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
