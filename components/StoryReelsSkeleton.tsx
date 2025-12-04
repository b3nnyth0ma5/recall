
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { SkeletonLoader } from './SkeletonLoader';

const STORY_SIZE = 80;
const STORY_SPACING = 12;

export function StoryReelsSkeleton() {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={false}
      >
        {/* Story Items Skeleton */}
        {[1, 2, 3, 4, 5].map((index) => (
          <View 
            key={index} 
            style={[
              styles.storyItem,
              index === 1 && styles.storyItemFirst,
            ]}
          >
            {/* Story circle with gradient border effect */}
            <View style={styles.storyGradientBorder}>
              <SkeletonLoader 
                width={STORY_SIZE} 
                height={STORY_SIZE} 
                borderRadius={STORY_SIZE / 2}
                variant="wave"
              />
            </View>
            {/* Time text skeleton */}
            <SkeletonLoader 
              width={50} 
              height={11} 
              borderRadius={4} 
              style={styles.storyTimeSkeleton}
              variant="wave"
            />
          </View>
        ))}
      </ScrollView>
    </View>
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
    backgroundColor: colors.cardDark,
    padding: 3,
  },
  storyTimeSkeleton: {
    marginTop: 2,
  },
});
