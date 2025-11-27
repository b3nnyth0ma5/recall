
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface SearchProgressIndicatorProps {
  stage: 'detecting' | 'resolving' | 'filtering' | 'searching' | 'complete';
  locationName?: string;
}

export function SearchProgressIndicator({ stage, locationName }: SearchProgressIndicatorProps) {
  const progress = useSharedValue(0);
  const pulseScale = useSharedValue(1);
  const iconRotation = useSharedValue(0);

  useEffect(() => {
    // Progress animation based on stage
    const targetProgress = {
      detecting: 0.25,
      resolving: 0.5,
      filtering: 0.75,
      searching: 0.9,
      complete: 1,
    }[stage];

    progress.value = withTiming(targetProgress, {
      duration: 400,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });

    // Pulse animation
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Icon rotation
    iconRotation.value = withRepeat(
      withTiming(360, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    );
  }, [stage]);

  const progressBarStyle = useAnimatedStyle(() => {
    return {
      width: `${interpolate(progress.value, [0, 1], [0, 100])}%`,
    };
  });

  const pulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulseScale.value }],
    };
  });

  const iconRotationStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${iconRotation.value}deg` }],
    };
  });

  const getStageText = () => {
    switch (stage) {
      case 'detecting':
        return 'Detecting location intent...';
      case 'resolving':
        return locationName ? `Finding ${locationName}...` : 'Resolving location...';
      case 'filtering':
        return 'Filtering nearby recalls...';
      case 'searching':
        return 'Analyzing with AI...';
      case 'complete':
        return 'Complete!';
      default:
        return 'Searching...';
    }
  };

  const getStageIcon = () => {
    switch (stage) {
      case 'detecting':
        return 'location.magnifyingglass';
      case 'resolving':
        return 'map.fill';
      case 'filtering':
        return 'line.3.horizontal.decrease.circle.fill';
      case 'searching':
        return 'sparkles';
      case 'complete':
        return 'checkmark.circle.fill';
      default:
        return 'magnifyingglass';
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconContainer, pulseStyle]}>
        <Animated.View style={stage !== 'complete' ? iconRotationStyle : undefined}>
          <IconSymbol
            name={getStageIcon()}
            size={40}
            color={stage === 'complete' ? colors.success : colors.primary}
          />
        </Animated.View>
      </Animated.View>

      <Text style={styles.stageText}>{getStageText()}</Text>

      {locationName && stage !== 'detecting' && (
        <View style={styles.locationBadge}>
          <IconSymbol name="mappin.circle.fill" size={16} color={colors.primary} />
          <Text style={styles.locationText}>{locationName}</Text>
        </View>
      )}

      <View style={styles.progressBarContainer}>
        <Animated.View style={[styles.progressBar, progressBarStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stageText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  progressBarContainer: {
    width: '80%',
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
});
