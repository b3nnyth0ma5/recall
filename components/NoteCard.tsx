
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, Linking, Modal, ActivityIndicator, ScrollView, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';
import { format } from 'date-fns';
import Animated, { 
  FadeIn, 
  FadeInDown, 
} from 'react-native-reanimated';
import { getImageOCRResults } from '@/utils/supabase';

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
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const [analysisData, setAnalysisData] = useState<{ ocrText?: string; explanation?: string } | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const modalScrollViewRef = useRef<ScrollView>(null);

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
    if (onImagePress) {
      onImagePress();
    }
  };

  const handleTextPress = () => {
    onPress();
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / IMAGE_WIDTH);
    if (index !== currentImageIndex && index >= 0 && index < validImages.length) {
      console.log('Image carousel changed to index:', index);
      setCurrentImageIndex(index);
    }
  };

  const handleModalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    if (index !== modalImageIndex && index >= 0 && index < validImages.length) {
      console.log('Modal carousel changed to index:', index);
      setModalImageIndex(index);
    }
  };

  const handleBrainIconPress = async () => {
    // Get the image ID from the imageIds array
    const imageId = note.imageIds?.[modalImageIndex];
    
    if (!imageId) {
      console.error('Could not extract image ID for index:', modalImageIndex);
      console.log('Available imageIds:', note.imageIds);
      return;
    }

    console.log('Loading analysis for image ID:', imageId);
    setLoadingAnalysis(true);
    setShowAnalysisModal(true);

    try {
      const ocrData = await getImageOCRResults(imageId);
      if (ocrData) {
        setAnalysisData({
          ocrText: ocrData.ocrText,
          explanation: ocrData.explanation,
        });
      } else {
        setAnalysisData({
          ocrText: 'No analysis available',
          explanation: 'This image has not been analyzed yet.',
        });
      }
    } catch (error) {
      console.error('Error loading analysis:', error);
      setAnalysisData({
        ocrText: 'Error loading analysis',
        explanation: 'Failed to load image analysis data.',
      });
    } finally {
      setLoadingAnalysis(false);
    }
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
              ref={scrollViewRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              snapToInterval={IMAGE_WIDTH}
              decelerationRate="fast"
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
                        <ActivityIndicator size="large" color={colors.primary} />
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

            {/* Pagination dots */}
            {validImages.length > 1 && (
              <View style={styles.paginationContainer}>
                {validImages.map((_, index) => (
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

          {/* Floating Brain Icon - Bottom Right, styled like plus/search */}
          <Pressable 
            style={styles.brainButton}
            onPress={handleBrainIconPress}
          >
            <Text style={styles.brainEmoji}>🧠</Text>
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
            style={styles.modalScrollView}
            contentOffset={{ x: modalImageIndex * SCREEN_WIDTH, y: 0 }}
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

          {/* Modal pagination dots */}
          {validImages.length > 1 && (
            <View style={styles.modalPaginationContainer}>
              {validImages.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.modalPaginationDot,
                    modalImageIndex === index && styles.modalPaginationDotActive,
                  ]}
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

      {/* Image Analysis Modal - Same as note-editor */}
      <Modal
        visible={showAnalysisModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowAnalysisModal(false)}
      >
        <Pressable 
          style={styles.analysisModalOverlay}
          onPress={() => setShowAnalysisModal(false)}
        >
          <Animated.View 
            entering={FadeIn.duration(300)}
            style={styles.analysisModalContent}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.analysisModalHeader}>
                <Text style={styles.analysisHeaderEmoji}>🧠</Text>
                <Text style={styles.analysisModalTitle}>Image Analysis</Text>
                <Pressable 
                  onPress={() => setShowAnalysisModal(false)}
                  style={styles.analysisCloseButton}
                >
                  <IconSymbol name="xmark" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              {loadingAnalysis ? (
                <View style={styles.analysisLoadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.analysisLoadingText}>Loading analysis...</Text>
                </View>
              ) : (
                <ScrollView style={styles.analysisScrollView}>
                  {analysisData?.ocrText && (
                    <View style={styles.analysisSection}>
                      <View style={styles.analysisSectionHeader}>
                        <IconSymbol name="doc.text" size={18} color={colors.primary} />
                        <Text style={styles.analysisSectionTitle}>Extracted Text</Text>
                      </View>
                      <Text style={styles.analysisText}>{analysisData.ocrText}</Text>
                    </View>
                  )}

                  {analysisData?.explanation && (
                    <View style={styles.analysisSection}>
                      <View style={styles.analysisSectionHeader}>
                        <IconSymbol name="sparkles" size={18} color={colors.primary} />
                        <Text style={styles.analysisSectionTitle}>AI Explanation</Text>
                      </View>
                      <Text style={styles.analysisText}>{analysisData.explanation}</Text>
                    </View>
                  )}
                </ScrollView>
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
    height: IMAGE_HEIGHT,
    position: 'relative',
    backgroundColor: colors.cardDark,
  },
  scrollView: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
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
  paginationContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: {
    width: 24,
    backgroundColor: '#FFFFFF',
  },
  counterBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    zIndex: 10,
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
  brainButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 10,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 16px rgba(255, 107, 122, 0.4)',
    elevation: 8,
  },
  brainEmoji: {
    fontSize: 28,
  },
  modalScrollView: {
    width: SCREEN_WIDTH,
    height: '100%',
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
  modalPaginationContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  modalPaginationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  modalPaginationDotActive: {
    width: 28,
    backgroundColor: '#FFFFFF',
  },
  modalCounterBadge: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    zIndex: 10,
  },
  modalCounterText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Analysis Modal styles
  analysisModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  analysisModalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.6)',
    elevation: 10,
  },
  analysisModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  analysisHeaderEmoji: {
    fontSize: 32,
  },
  analysisModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  analysisCloseButton: {
    padding: 4,
  },
  analysisLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  analysisLoadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  analysisScrollView: {
    maxHeight: 400,
  },
  analysisSection: {
    marginBottom: 20,
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
  },
  analysisSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  analysisSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  analysisText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
  },
});
