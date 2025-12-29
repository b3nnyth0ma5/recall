
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
  stage: 'detecting' | 'resolving' | 'filtering' | 'people' | 'keywords' | 'searching' | 'complete';
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
      detecting: 0.15,
      resolving: 0.3,
      filtering: 0.45,
      people: 0.6,
      keywords: 0.75,
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
        return 'Analyzing search intent...';
      case 'resolving':
        return locationName ? `Finding ${locationName}...` : 'Resolving location...';
      case 'filtering':
        return 'Filtering nearby recalls...';
      case 'people':
        return personNames && personNames.length > 0
          ? `Finding recalls with ${personNames.join(', ')}...`
          : 'Searching for people...';
      case 'keywords':
        return 'Extracting keywords and matching...';
      case 'searching':
        return 'Generating answer with AI...';
      case 'complete':
        return 'Complete!';
      default:
        return 'Searching...';
    }
  };

  const getStageIcon = () => {
    switch (stage) {
      case 'detecting':
        return 'magnifyingglass.circle.fill';
      case 'resolving':
        return 'map.fill';
      case 'filtering':
        return 'line.3.horizontal.decrease.circle.fill';
      case 'people':
        return 'person.2.fill';
      case 'keywords':
        return 'text.word.spacing';
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

      {locationName && (stage === 'resolving' || stage === 'filtering') && (
        <View style={styles.infoBadge}>
          <IconSymbol name="mappin.circle.fill" size={16} color={colors.primary} />
          <Text style={styles.infoText}>{locationName}</Text>
        </View>
      )}

      {personNames && personNames.length > 0 && stage === 'people' && (
        <View style={styles.infoBadge}>
          <IconSymbol name="person.circle.fill" size={16} color={colors.primary} />
          <Text style={styles.infoText}>{personNames.join(', ')}</Text>
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
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  infoText: {
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
