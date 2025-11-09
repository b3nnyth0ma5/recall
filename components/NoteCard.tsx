
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ScrollView, Linking } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';
import { format } from 'date-fns';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_WIDTH = SCREEN_WIDTH - 32;

// URL regex pattern
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function NoteCard({ note, onPress }: NoteCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullText, setShowFullText] = useState(false);
  const [imageErrors, setImageErrors] = useState<{ [key: number]: boolean }>({});

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM d, yyyy \'at\' HH:mm');
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const getPreviewText = () => {
    if (!note.text) return '';
    const lines = note.text.split('\n');
    if (lines.length <= 4 && note.text.length <= 200) {
      return note.text;
    }
    
    if (showFullText) {
      return note.text;
    }
    
    // Show first 4 lines or 200 characters
    const preview = lines.slice(0, 4).join('\n');
    return preview.length > 200 ? preview.substring(0, 200) + '...' : preview;
  };

  const shouldShowToggle = () => {
    if (!note.text) return false;
    const lines = note.text.split('\n');
    return lines.length > 4 || note.text.length > 200;
  };

  const renderTextWithLinks = (text: string) => {
    const parts = text.split(URL_REGEX);
    
    return (
      <Text style={styles.noteText}>
        {parts.map((part, index) => {
          if (part.match(URL_REGEX)) {
            return (
              <Text
                key={index}
                style={styles.linkText}
                onPress={(e) => {
                  e.stopPropagation();
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
        })}
      </Text>
    );
  };

  const handleScroll = (event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / IMAGE_WIDTH);
    setCurrentImageIndex(index);
  };

  const handleImageError = (index: number) => {
    console.error(`Error loading image at index ${index} for note ${note.id}`);
    console.error('Image URL:', note.images?.[index]);
    setImageErrors(prev => ({ ...prev, [index]: true }));
  };

  const handleImageLoad = (index: number) => {
    console.log(`Image ${index} loaded successfully for note ${note.id}`);
  };

  const allImages = note.images || [];
  const validImages = allImages.filter((_, index) => !imageErrors[index]);
  const hasValidImages = validImages.length > 0;

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.container}>
      <Pressable onPress={onPress} style={styles.pressable}>
        {/* Image Carousel */}
        {hasValidImages && (
          <View style={styles.imageContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              {allImages.map((imageUrl, index) => {
                if (imageErrors[index]) {
                  return null;
                }

                return (
                  <View key={index} style={styles.imageWrapper}>
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
            
            {/* Image indicators */}
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
          </View>
        )}

        {/* Note Text with clickable URLs */}
        {note.text && (
          <View style={styles.textContainer}>
            {renderTextWithLinks(getPreviewText())}
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

        {/* Location and Date */}
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
    height: 300,
    position: 'relative',
    backgroundColor: colors.cardDark,
  },
  imageWrapper: {
    width: IMAGE_WIDTH,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: IMAGE_WIDTH,
    height: 300,
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
});
