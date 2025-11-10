
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ScrollView, Modal } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';
import { format } from 'date-fns';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface StoryReelsProps {
  notes: Note[];
  onNotePress: (noteId: string) => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_SIZE = 80;
const STORY_SPACING = 12;

// Unsplash stock images for variety
const STOCK_IMAGES = [
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400',
  'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400',
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400',
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400',
  'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=400',
  'https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?w=400',
  'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=400',
  'https://images.unsplash.com/photo-1518173946687-a4c8892bbd9f?w=400',
];

export function StoryReels({ notes, onNotePress }: StoryReelsProps) {
  const [selectedStory, setSelectedStory] = useState<Note | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Create exactly 10 reels with randomized images
  const reelNotes = useMemo(() => {
    const reels: Note[] = [];
    
    // If we have notes with images, use them
    if (notes.length > 0) {
      for (let i = 0; i < Math.min(10, notes.length); i++) {
        const note = notes[i];
        
        // Randomize the images in each note
        if (note.images && note.images.length > 0) {
          const shuffledImages = [...note.images].sort(() => Math.random() - 0.5);
          reels.push({
            ...note,
            images: shuffledImages,
          });
        } else {
          reels.push(note);
        }
      }
    }
    
    // If we have less than 10 notes, fill with stock images
    while (reels.length < 10) {
      const randomStockImage = STOCK_IMAGES[Math.floor(Math.random() * STOCK_IMAGES.length)];
      const daysAgo = Math.floor(Math.random() * 7) + 1;
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      
      reels.push({
        id: `stock-${reels.length}`,
        text: 'Explore your memories',
        images: [randomStockImage],
        created_at: date.toISOString(),
        updated_at: date.toISOString(),
        user_id: '',
      });
    }
    
    return reels;
  }, [notes]);

  const handleStoryPress = (note: Note) => {
    // Don't open stock image stories
    if (note.id.startsWith('stock-')) {
      return;
    }
    setSelectedStory(note);
    setCurrentImageIndex(0);
  };

  const handleCloseStory = () => {
    setSelectedStory(null);
    setCurrentImageIndex(0);
  };

  const handleNextImage = () => {
    if (selectedStory && selectedStory.images) {
      if (currentImageIndex < selectedStory.images.length - 1) {
        setCurrentImageIndex(currentImageIndex + 1);
      } else {
        // Move to next story or close
        const currentIndex = reelNotes.findIndex(n => n.id === selectedStory.id);
        if (currentIndex < reelNotes.length - 1) {
          const nextNote = reelNotes[currentIndex + 1];
          // Skip stock images
          if (!nextNote.id.startsWith('stock-')) {
            setSelectedStory(nextNote);
            setCurrentImageIndex(0);
          } else {
            handleCloseStory();
          }
        } else {
          handleCloseStory();
        }
      }
    }
  };

  const handlePreviousImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    } else {
      // Move to previous story
      if (selectedStory) {
        const currentIndex = reelNotes.findIndex(n => n.id === selectedStory.id);
        if (currentIndex > 0) {
          const prevNote = reelNotes[currentIndex - 1];
          // Skip stock images
          if (!prevNote.id.startsWith('stock-')) {
            setSelectedStory(prevNote);
            setCurrentImageIndex((prevNote.images?.length || 1) - 1);
          }
        }
      }
    }
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (diffInSeconds < 60) return 'Just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
      if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
      return format(date, 'MMM d');
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  return (
    <>
      <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {reelNotes.map((note, index) => {
            const firstImage = note.images?.[0];
            if (!firstImage) return null;

            return (
              <Pressable
                key={note.id}
                onPress={() => handleStoryPress(note)}
                style={[
                  styles.storyItem,
                  index === 0 && styles.storyItemFirst,
                ]}
              >
                <LinearGradient
                  colors={['#FF6B35', '#F7931E', '#FDC830']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.storyGradientBorder}
                >
                  <View style={styles.storyImageContainer}>
                    <Image
                      source={{ uri: firstImage }}
                      style={styles.storyImage}
                      resizeMode="cover"
                    />
                  </View>
                </LinearGradient>
                <Text style={styles.storyTime} numberOfLines={1}>
                  {formatTimeAgo(note.created_at)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* Story Viewer Modal */}
      {selectedStory && (
        <Modal
          visible={true}
          transparent={false}
          animationType="fade"
          onRequestClose={handleCloseStory}
        >
          <View style={styles.storyViewerContainer}>
            {/* Progress bars */}
            <View style={styles.progressContainer}>
              {selectedStory.images?.map((_, index) => (
                <View key={index} style={styles.progressBarBackground}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: index < currentImageIndex ? '100%' : index === currentImageIndex ? '50%' : '0%',
                      },
                    ]}
                  />
                </View>
              ))}
            </View>

            {/* Header */}
            <View style={styles.storyHeader}>
              <View style={styles.storyHeaderLeft}>
                <View style={styles.storyHeaderIcon}>
                  <IconSymbol name="note.text" size={20} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.storyHeaderTitle}>Recall</Text>
                  <Text style={styles.storyHeaderTime}>
                    {formatTimeAgo(selectedStory.created_at)}
                  </Text>
                </View>
              </View>
              <Pressable onPress={handleCloseStory} style={styles.storyCloseButton}>
                <IconSymbol name="xmark" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Image */}
            <View style={styles.storyImageViewer}>
              <Pressable
                style={styles.storyTapLeft}
                onPress={handlePreviousImage}
              />
              <Pressable
                style={styles.storyTapRight}
                onPress={handleNextImage}
              />
              {selectedStory.images && selectedStory.images[currentImageIndex] && (
                <Image
                  source={{ uri: selectedStory.images[currentImageIndex] }}
                  style={styles.storyFullImage}
                  resizeMode="contain"
                />
              )}
            </View>

            {/* Footer with text */}
            {selectedStory.text && (
              <View style={styles.storyFooter}>
                <LinearGradient
                  colors={['transparent', 'rgba(0, 0, 0, 0.8)']}
                  style={styles.storyFooterGradient}
                >
                  <Text style={styles.storyText} numberOfLines={3}>
                    {selectedStory.text}
                  </Text>
                  <Pressable
                    onPress={() => {
                      handleCloseStory();
                      onNotePress(selectedStory.id);
                    }}
                    style={styles.viewMoreButton}
                  >
                    <Text style={styles.viewMoreText}>View Full Recall</Text>
                    <IconSymbol name="chevron.right" size={16} color="#FFFFFF" />
                  </Pressable>
                </LinearGradient>
              </View>
            )}
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  storyItem: {
    alignItems: 'center',
    marginRight: STORY_SPACING,
  },
  storyItemFirst: {
    marginLeft: 8,
  },
  storyGradientBorder: {
    width: STORY_SIZE + 6,
    height: STORY_SIZE + 6,
    borderRadius: (STORY_SIZE + 6) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  storyImageContainer: {
    width: STORY_SIZE,
    height: STORY_SIZE,
    borderRadius: STORY_SIZE / 2,
    backgroundColor: colors.background,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyImage: {
    width: STORY_SIZE - 6,
    height: STORY_SIZE - 6,
    borderRadius: (STORY_SIZE - 6) / 2,
  },
  storyTime: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    maxWidth: STORY_SIZE + 6,
    textAlign: 'center',
  },
  // Story Viewer Styles
  storyViewerContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 50,
    gap: 4,
    zIndex: 10,
  },
  progressBarBackground: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 1.5,
  },
  storyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 10,
  },
  storyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  storyHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyHeaderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  storyHeaderTime: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  storyCloseButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyImageViewer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyTapLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.3,
    zIndex: 5,
  },
  storyTapRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.7,
    zIndex: 5,
  },
  storyFullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  storyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  storyFooterGradient: {
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 40,
  },
  storyText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 12,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  viewMoreText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
