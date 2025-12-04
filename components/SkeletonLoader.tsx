
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { LinearGradient } from 'expo-linear-gradient';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
  variant?: 'pulse' | 'wave';
}

export function SkeletonLoader({ 
  width = '100%', 
  height = 20, 
  borderRadius = 8,
  style,
  variant = 'wave'
}: SkeletonLoaderProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (variant === 'pulse') {
      // Pulse animation (fade in/out)
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );

      animation.start();

      return () => {
        animation.stop();
      };
    } else {
      // Wave animation (shimmer effect)
      const animation = Animated.loop(
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      );

      animation.start();

      return () => {
        animation.stop();
      };
    }
  }, [animatedValue, variant]);

  if (variant === 'pulse') {
    const opacity = animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.7],
    });

    return (
      <Animated.View
        style={[
          styles.skeleton,
          {
            width,
            height,
            borderRadius,
            opacity,
          },
          style,
        ]}
      />
    );
  }

  // Wave animation with shimmer effect
  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  return (
    <View
      style={[
        styles.skeletonContainer,
        {
          width,
          height,
          borderRadius,
        },
        style,
      ]}
    >
      <View style={styles.skeletonBase} />
      <Animated.View
        style={[
          styles.shimmerContainer,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255, 255, 255, 0.1)',
            'rgba(255, 255, 255, 0.2)',
            'rgba(255, 255, 255, 0.1)',
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.shimmerGradient}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.cardDark,
  },
  skeletonContainer: {
    backgroundColor: colors.cardDark,
    overflow: 'hidden',
    position: 'relative',
  },
  skeletonBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.cardDark,
  },
  shimmerContainer: {
    ...StyleSheet.absoluteFillObject,
    width: 300,
  },
  shimmerGradient: {
    flex: 1,
    width: 300,
  },
});
