
import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { SkeletonLoader } from './SkeletonLoader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 8;
const IMAGE_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 5);
const IMAGE_HEIGHT = IMAGE_WIDTH * 1.25;

interface NoteCardSkeletonProps {
  showImage?: boolean;
  showPeople?: boolean;
}

export function NoteCardSkeleton({ showImage = true, showPeople = true }: NoteCardSkeletonProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        {/* People Avatars Skeleton - Top Right */}
        {showPeople && (
          <View style={styles.peopleAvatarsContainer}>
            <View style={styles.avatarsRow}>
              <SkeletonLoader width={36} height={36} borderRadius={18} />
              <SkeletonLoader width={36} height={36} borderRadius={18} style={styles.avatarOverlap} />
              <SkeletonLoader width={36} height={36} borderRadius={18} style={styles.avatarOverlap} />
            </View>
          </View>
        )}

        {/* Image Skeleton - First */}
        {showImage && (
          <View style={styles.imagesContainer}>
            <SkeletonLoader 
              width={IMAGE_WIDTH} 
              height={IMAGE_HEIGHT} 
              borderRadius={12} 
            />
          </View>
        )}

        {/* Text Content Skeleton - After images */}
        <View style={styles.textContainer}>
          <SkeletonLoader width="100%" height={20} borderRadius={4} />
          <SkeletonLoader width="90%" height={20} borderRadius={4} style={styles.textLine} />
          <SkeletonLoader width="75%" height={20} borderRadius={4} style={styles.textLine} />
        </View>

        {/* Location and Time Skeleton */}
        <View style={styles.locationTimeContainer}>
          <View style={styles.locationWrapper}>
            <SkeletonLoader width={14} height={14} borderRadius={7} />
            <SkeletonLoader width={120} height={16} borderRadius={4} style={styles.locationText} />
          </View>
          <SkeletonLoader width={60} height={16} borderRadius={4} />
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
    overflow: 'visible',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 2,
  },
  cardContent: {
    padding: CARD_PADDING,
    position: 'relative',
    overflow: 'visible',
    borderRadius: 16,
  },
  peopleAvatarsContainer: {
    position: 'absolute',
    top: -10,
    right: 8,
    zIndex: 1000,
    elevation: 10,
  },
  avatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOverlap: {
    marginLeft: -8,
  },
  imagesContainer: {
    marginBottom: 12,
    marginHorizontal: -CARD_PADDING,
    paddingHorizontal: CARD_PADDING,
  },
  textContainer: {
    marginBottom: 12,
  },
  textLine: {
    marginTop: 8,
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
  locationText: {
    marginLeft: 6,
  },
});
