
import React, { useState, useRef, memo } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ScrollView, Linking, Modal, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';
import { format } from 'date-fns';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { getOptimizedImageUrl, IMAGE_SIZES } from '@/utils/imageOptimization';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onImagePress?: () => void;
  index?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 4;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 2);

function NoteCardComponent({ note, onPress, onImagePress, index = 0 }: NoteCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullText, setShowFullText] = useState(false);
  const [imageErrors, setImageErrors] = useState<{ [key: number]: boolean }>({});
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImageIndex, setModalImageIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<{ [key: number]: boolean }>({});
  const modalScrollViewRef = useRef<ScrollView>(null);
  const cardScrollViewRef = useRef<ScrollView>(null);

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
    
    return parts.map((part, idx) => {
      if (part.match(urlRegex)) {
        return (
          <Text
            key={idx}
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
      return <Text key={idx}>{part}</Text>;
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
    const idx = Math.round(contentOffsetX / IMAGE_WIDTH);
    setCurrentImageIndex(idx);
  };

  const handleModalScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const idx = Math.round(contentOffsetX / SCREEN_WIDTH);
    setModalImageIndex(idx);
  };

  const handleImageError = (idx: number) => {
    console.error(`Error loading image at index ${idx} for note ${note.id}`);
    setImageErrors(prev => ({ ...prev, [idx]: true }));
  };

  const handleImageLoad = (idx: number) => {
    setLoadedImages(prev => ({ ...prev, [idx]: true }));
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
  const validImages = allImages.filter((_, idx) => !imageErrors[idx]);
  const hasValidImages = validImages.length > 0;

  // Optimize images for card display
  const optimizedImages = allImages.map(url => getOptimizedImageUrl(url, IMAGE_SIZES.CARD));

  return (
    <>
      <Animated.View 
        entering={FadeInDown.duration(300).delay(index * 50)} 
        style={styles.container}
      >
        {hasValidImages && (
          <Pressable onPress={handleImagePress} style={styles.imageContainer}>
            <ScrollView
              ref={cardScrollViewRef}
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
              {optimizedImages.map((imageUrl, idx) => {
                if (imageErrors[idx]) {
                  return null;
                }

                return (
                  <View key={idx} style={styles.imageWrapper}>
                    {!loadedImages[idx] && (
                      <View style={styles.imagePlaceholder}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    )}
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.image}
                      resizeMode="cover"
                      onError={() => handleImageError(idx)}
                      onLoad={() => handleImageLoad(idx)}
                    />
                  </View>
                );
              })}
            </ScrollView>
            
            {validImages.length > 1 && (
              <View style={styles.indicatorContainer}>
                {validImages.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.indicator,
                      idx === currentImageIndex && styles.indicatorActive,
                    ]}
                  />
                ))}
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
            {allImages.map((imageUrl, idx) => {
              if (imageErrors[idx]) {
                return null;
              }

              const fullSizeUrl = getOptimizedImageUrl(imageUrl, IMAGE_SIZES.FULL);

              return (
                <View key={idx} style={styles.modalImageWrapper}>
                  <Image
                    source={{ uri: fullSizeUrl }}
                    style={styles.modalImage}
                    resizeMode="contain"
                  />
                </View>
              );
            })}
          </ScrollView>

          {validImages.length > 1 && (
            <View style={styles.modalIndicatorContainer}>
              {validImages.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.modalIndicator,
                    idx === modalImageIndex && styles.modalIndicatorActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

// Memoize the component to prevent unnecessary re-renders
export const NoteCard = memo(NoteCardComponent);

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
    height: 400,
    position: 'relative',
    backgroundColor: colors.cardDark,
  },
  scrollView: {
    width: IMAGE_WIDTH,
    height: 400,
  },
  scrollViewContent: {
    flexDirection: 'row',
  },
  imageWrapper: {
    width: IMAGE_WIDTH,
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  imagePlaceholder: {
    position: 'absolute',
    width: IMAGE_WIDTH,
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardDark,
    zIndex: 1,
  },
  image: {
    width: IMAGE_WIDTH,
    height: 400,
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  indicatorActive: {
    backgroundColor: colors.primary,
    width: 8,
    height: 8,
    borderRadius: 4,
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
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  modalIndicatorActive: {
    backgroundColor: colors.primary,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
