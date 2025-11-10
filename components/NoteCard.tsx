
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ScrollView, Linking, Modal, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';
import { format } from 'date-fns';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import ImageOCRDisplay from './ImageOCRDisplay';
import { getImageOCRResults, triggerOCRProcessing } from '@/utils/supabase';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
  onImagePress?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 4; // Padding on each side of the card
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 2);

export function NoteCard({ note, onPress, onImagePress }: NoteCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullText, setShowFullText] = useState(false);
  const [imageErrors, setImageErrors] = useState<{ [key: number]: boolean }>({});
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImageIndex, setModalImageIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<{ [key: number]: boolean }>({});
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
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
    const index = Math.round(contentOffsetX / IMAGE_WIDTH);
    console.log('Card carousel scroll - offset:', contentOffsetX, 'index:', index);
    setCurrentImageIndex(index);
  };

  const handleModalScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
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
    // Scroll to the current image in the modal after a short delay to ensure modal is rendered
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

  const handleShowOCRModal = async () => {
    const currentImageId = getImageIdForIndex(modalImageIndex);
    
    if (!currentImageId) {
      console.error('No image ID available for current modal image');
      return;
    }

    // Check if the image needs processing
    setIsProcessingOCR(true);
    try {
      const ocrResults = await getImageOCRResults(currentImageId);
      
      // If processed_at is null, trigger OCR processing
      if (!ocrResults?.processedAt) {
        console.log('Image not processed yet, triggering OCR processing...');
        const result = await triggerOCRProcessing(currentImageId);
        
        if (!result.success) {
          console.error('Failed to trigger OCR processing:', result.error);
        }
      }
    } catch (error) {
      console.error('Error checking OCR status:', error);
    } finally {
      setIsProcessingOCR(false);
      setShowOCRModal(true);
    }
  };

  const handleCloseOCRModal = () => {
    setShowOCRModal(false);
  };

  const allImages = note.images || [];
  const validImages = allImages.filter((_, index) => !imageErrors[index]);
  const hasValidImages = validImages.length > 0;

  // Get image IDs for OCR display
  const getImageIdForIndex = (index: number): string | undefined => {
    if (!note.imageIds || index >= note.imageIds.length) {
      return undefined;
    }
    return note.imageIds[index];
  };

  const currentModalImageId = getImageIdForIndex(modalImageIndex);

  return (
    <>
      <Animated.View entering={FadeInDown.duration(400)} style={styles.container}>
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
              {allImages.map((imageUrl, index) => {
                if (imageErrors[index]) {
                  return null;
                }

                return (
                  <View key={index} style={styles.imageWrapper}>
                    {!loadedImages[index] && (
                      <View style={styles.imagePlaceholder}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    )}
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.image}
                      resizeMode="cover"
                      onError={() => handleImageError(index)}
                      onLoad={() => handleImageLoad(index)}
                    />
                  </View>
                );
              })}
            </ScrollView>
            
            {validImages.length > 1 && (
              <View style={styles.indicatorContainer}>
                {validImages.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.indicator,
                      index === currentImageIndex && styles.indicatorActive,
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

          {/* Floating Sparkle button for OCR - Bottom Right */}
          {currentModalImageId && (
            <Pressable 
              style={styles.floatingSparkleButton}
              onPress={handleShowOCRModal}
              disabled={isProcessingOCR}
            >
              <View style={styles.sparkleButtonCircle}>
                {isProcessingOCR ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <IconSymbol name="sparkles" size={24} color="#FFFFFF" />
                )}
              </View>
            </Pressable>
          )}

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
                <View
                  key={index}
                  style={[
                    styles.modalIndicator,
                    index === modalImageIndex && styles.modalIndicatorActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>

      {/* OCR Information Modal */}
      <Modal
        visible={showOCRModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseOCRModal}
      >
        <Pressable 
          style={styles.ocrModalOverlay}
          onPress={handleCloseOCRModal}
        >
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={styles.ocrModalContent}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.ocrModalHeader}>
                <IconSymbol name="sparkles" size={32} color={colors.primary} />
                <Text style={styles.ocrModalTitle}>Image Analysis</Text>
                <Pressable 
                  style={styles.ocrModalCloseButton}
                  onPress={handleCloseOCRModal}
                >
                  <IconSymbol name="xmark.circle.fill" size={28} color={colors.textSecondary} />
                </Pressable>
              </View>

              {currentModalImageId ? (
                <ImageOCRDisplay imageId={currentModalImageId} autoLoad={true} />
              ) : (
                <View style={styles.ocrErrorContainer}>
                  <Text style={styles.ocrErrorText}>Image ID not available</Text>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
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
  floatingSparkleButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    zIndex: 10,
  },
  sparkleButtonCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.4)',
    elevation: 8,
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
  // OCR Modal styles
  ocrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  ocrModalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.6)',
    elevation: 10,
  },
  ocrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  ocrModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  ocrModalCloseButton: {
    padding: 4,
  },
  ocrErrorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  ocrErrorText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
