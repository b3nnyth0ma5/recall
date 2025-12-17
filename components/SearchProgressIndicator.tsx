
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface SearchProgressIndicatorProps {
  stage: 'detecting' | 'resolving' | 'filtering' | 'searching' | 'complete';
  locationName?: string;
  personNames?: string[];
}

export function SearchProgressIndicator({ stage, locationName, personNames }: SearchProgressIndicatorProps) {
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
  }, [stage, progress, pulseScale, iconRotation]);

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
        return 'Analyzing your search...';
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
        return 'sparkles';
      case 'resolving':
        return 'map.fill';
      case 'filtering':
        return 'line.3.horizontal.decrease.circle.fill';
      case 'searching':
        return 'brain.head.profile';
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

      {/* Person Detection Badge */}
      {personNames && personNames.length > 0 && (
        <Animated.View 
          entering={Animated.FadeIn.duration(400)} 
          style={styles.detectionBadge}
        >
          <IconSymbol name="person.circle.fill" size={18} color={colors.primary} />
          <View style={styles.detectionBadgeText}>
            <Text style={styles.detectionBadgeTitle}>Person Detected</Text>
            <Text style={styles.detectionBadgeSubtitle}>
              {personNames.join(', ')}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Location Badge */}
      {locationName && stage !== 'detecting' && (
        <Animated.View 
          entering={Animated.FadeIn.duration(400)} 
          style={styles.detectionBadge}
        >
          <IconSymbol name="mappin.circle.fill" size={18} color={colors.primary} />
          <View style={styles.detectionBadgeText}>
            <Text style={styles.detectionBadgeTitle}>Location Search</Text>
            <Text style={styles.detectionBadgeSubtitle}>{locationName}</Text>
          </View>
        </Animated.View>
      )}

      <View style={styles.progressBarContainer}>
        <Animated.View style={[styles.progressBar, progressBarStyle]} />
      </View>

      {/* Stage Details */}
      <View style={styles.stageDetails}>
        <View style={[styles.stageDot, stage === 'detecting' || stage === 'resolving' || stage === 'filtering' || stage === 'searching' || stage === 'complete' ? styles.stageDotActive : null]} />
        <View style={[styles.stageDot, stage === 'resolving' || stage === 'filtering' || stage === 'searching' || stage === 'complete' ? styles.stageDotActive : null]} />
        <View style={[styles.stageDot, stage === 'filtering' || stage === 'searching' || stage === 'complete' ? styles.stageDotActive : null]} />
        <View style={[styles.stageDot, stage === 'searching' || stage === 'complete' ? styles.stageDotActive : null]} />
        <View style={[styles.stageDot, stage === 'complete' ? styles.stageDotActive : null]} />
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
  detectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
    minWidth: 200,
  },
  detectionBadgeText: {
    flex: 1,
  },
  detectionBadgeTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 2,
  },
  detectionBadgeSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
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
  stageDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  stageDotActive: {
    backgroundColor: colors.primary,
  },
});
