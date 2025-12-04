
import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { SkeletonLoader } from './SkeletonLoader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 4);
const IMAGE_HEIGHT = IMAGE_WIDTH * 1.25;

export function NoteCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        {/* People Avatars Skeleton - Top Right Corner */}
        <View style={styles.peopleAvatarsContainer}>
          <View style={styles.avatarsRow}>
            <SkeletonLoader 
              width={28} 
              height={28} 
              borderRadius={14}
              variant="wave"
            />
            <SkeletonLoader 
              width={28} 
              height={28} 
              borderRadius={14}
              variant="wave"
              style={styles.avatarOverlap}
            />
          </View>
        </View>

        {/* Text Content Skeleton - Displayed FIRST on web */}
        <View style={styles.textContainer}>
          {/* First line - 90% width */}
          <SkeletonLoader 
            width="90%" 
            height={16} 
            borderRadius={4}
            variant="wave"
            style={styles.textLine}
          />
          {/* Second line - 85% width */}
          <SkeletonLoader 
            width="85%" 
            height={16} 
            borderRadius={4}
            variant="wave"
            style={styles.textLine}
          />
          {/* Third line - 70% width */}
          <SkeletonLoader 
            width="70%" 
            height={16} 
            borderRadius={4}
            variant="wave"
            style={styles.textLine}
          />
        </View>

        {/* Image Skeleton - Displayed AFTER text on web */}
        <View style={styles.imagesContainer}>
          <SkeletonLoader 
            width={IMAGE_WIDTH} 
            height={IMAGE_HEIGHT} 
            borderRadius={12}
            variant="wave"
          />
          {/* Image counter skeleton */}
          <View style={styles.imageCounter}>
            <SkeletonLoader 
              width={40} 
              height={20} 
              borderRadius={10}
              variant="wave"
            />
          </View>
        </View>

        {/* Location and Time Container - Bottom section with border */}
        <View style={styles.locationTimeContainer}>
          {/* Location skeleton - Left side */}
          <View style={styles.locationWrapper}>
            <SkeletonLoader 
              width={14} 
              height={14} 
              borderRadius={7}
              variant="wave"
            />
            <SkeletonLoader 
              width={120} 
              height={14} 
              borderRadius={4}
              variant="wave"
            />
          </View>
          
          {/* Time skeleton - Right side */}
          <SkeletonLoader 
            width={60} 
            height={13} 
            borderRadius={4}
            variant="wave"
          />
        </View>
      </View>
    </View>
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
    position: 'relative',
  },
  peopleAvatarsContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  textContainer: {
    marginBottom: 4,
  },
  textLine: {
    marginBottom: 6,
  },
  imagesContainer: {
    marginTop: 12,
    marginHorizontal: -CARD_PADDING,
    position: 'relative',
    paddingHorizontal: CARD_PADDING,
  },
  imageCounter: {
    position: 'absolute',
    bottom: 12,
    right: CARD_PADDING + 12,
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
  },
  locationWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 0.70,
  },
});
