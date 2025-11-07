
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { format } from 'date-fns';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';

interface NoteCardProps {
  note: Note;
  onPress: () => void;
}

const IMAGE_WIDTH = Dimensions.get('window').width - 64;

export function NoteCard({ note, onPress }: NoteCardProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy \'at\' HH:mm');
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };

  const getPreviewText = () => {
    if (!note.text) return '';
    const lines = note.text.split('\n');
    if (expanded) return note.text;
    return lines.slice(0, 3).join('\n');
  };

  const shouldShowToggle = () => {
    if (!note.text) return false;
    const lines = note.text.split('\n');
    return lines.length > 3 || note.text.length > 150;
  };

  const handleScroll = (event: any) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / IMAGE_WIDTH);
    setCurrentImageIndex(index);
  };

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <Pressable onPress={onPress} style={styles.card}>
        {note.images && note.images.length > 0 && (
          <View style={styles.imageContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              {note.images.map((imageUri, index) => (
                <Image
                  key={index}
                  source={{ uri: imageUri }}
                  style={styles.image}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
            {note.images.length > 1 && (
              <View style={styles.pagination}>
                {note.images.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.paginationDot,
                      index === currentImageIndex && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {note.text && (
          <View style={styles.textContainer}>
            <Text style={styles.text}>{getPreviewText()}</Text>
            {shouldShowToggle() && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                style={styles.toggleButton}
              >
                <Text style={styles.toggleText}>
                  {expanded ? 'Show Less' : 'Show More'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.footer}>
          <View style={styles.locationContainer}>
            {note.location && (
              <>
                <IconSymbol name="location.fill" size={14} color={colors.textSecondary} />
                <Text style={styles.location}>{note.location}</Text>
              </>
            )}
          </View>
          <Text style={styles.date}>{formatDateTime(note.created_at)}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: `0px 2px 8px ${colors.shadow}`,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    height: IMAGE_WIDTH,
    position: 'relative',
  },
  image: {
    width: IMAGE_WIDTH,
    height: IMAGE_WIDTH,
    backgroundColor: colors.backgroundSecondary,
  },
  pagination: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  paginationDotActive: {
    backgroundColor: colors.primary,
    width: 20,
  },
  textContainer: {
    padding: 16,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 8,
  },
  toggleButton: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  toggleText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: note.text ? 0 : 16,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  location: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  date: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
