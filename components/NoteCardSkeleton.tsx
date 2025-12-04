
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { SkeletonLoader } from './SkeletonLoader';

export function NoteCardSkeleton() {
  return (
    <View style={styles.card}>
      {/* Image skeleton */}
      <SkeletonLoader 
        width="100%" 
        height={200} 
        borderRadius={12}
        variant="wave"
        style={styles.imageSkeleton}
      />
      
      {/* Text content skeleton */}
      <View style={styles.contentContainer}>
        {/* Title line */}
        <SkeletonLoader 
          width="80%" 
          height={16} 
          borderRadius={4}
          variant="wave"
          style={styles.textSkeleton}
        />
        
        {/* Description lines */}
        <SkeletonLoader 
          width="100%" 
          height={14} 
          borderRadius={4}
          variant="wave"
          style={styles.textSkeleton}
        />
        <SkeletonLoader 
          width="90%" 
          height={14} 
          borderRadius={4}
          variant="wave"
          style={styles.textSkeleton}
        />
        
        {/* Footer with metadata */}
        <View style={styles.footerContainer}>
          <SkeletonLoader 
            width={60} 
            height={12} 
            borderRadius={4}
            variant="wave"
          />
          <SkeletonLoader 
            width={80} 
            height={12} 
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageSkeleton: {
    marginBottom: 0,
  },
  contentContainer: {
    padding: 16,
  },
  textSkeleton: {
    marginBottom: 8,
  },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
});
