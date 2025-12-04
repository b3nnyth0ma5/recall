
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { SkeletonLoader } from './SkeletonLoader';

const CATEGORY_SIZE = 82;
const CATEGORY_SPACING = 10;

export function CategoryCarouselSkeleton() {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={false}
      >
        {/* Create Category Skeleton */}
        <View style={[styles.categoryItem, styles.categoryItemFirst]}>
          <SkeletonLoader 
            width={CATEGORY_SIZE} 
            height={CATEGORY_SIZE} 
            borderRadius={CATEGORY_SIZE / 2}
            variant="wave"
          />
          <SkeletonLoader 
            width={60} 
            height={12} 
            borderRadius={4} 
            style={styles.categoryNameSkeleton}
            variant="wave"
          />
        </View>

        {/* Category Items Skeleton */}
        {[1, 2, 3, 4].map((index) => (
          <View key={index} style={styles.categoryItem}>
            <SkeletonLoader 
              width={CATEGORY_SIZE} 
              height={CATEGORY_SIZE} 
              borderRadius={CATEGORY_SIZE / 2}
              variant="wave"
            />
            <SkeletonLoader 
              width={60} 
              height={12} 
              borderRadius={4} 
              style={styles.categoryNameSkeleton}
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
    marginBottom: 8,
    paddingTop: 8,
  },
  scrollContent: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: CATEGORY_SPACING,
    width: CATEGORY_SIZE,
  },
  categoryItemFirst: {
    marginLeft: 8,
  },
  categoryNameSkeleton: {
    marginTop: 6,
  },
});
