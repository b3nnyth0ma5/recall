
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
    // Progress animation based on stage with more granular steps
    const targetProgress = {
      detecting: 0.14,
      resolving: 0.28,
      filtering: 0.42,
      people: 0.56,
      keywords: 0.70,
      searching: 0.85,
      complete: 1,
    }[stage];

    progress.value = withTiming(targetProgress, {
      duration: 500,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });

    // Pulse animation
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    // Icon rotation - only when not complete
    if (stage !== 'complete') {
      iconRotation.value = withRepeat(
        withTiming(360, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      iconRotation.value = withTiming(0, { duration: 300 });
    }
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

  const getStageDescription = () => {
    switch (stage) {
      case 'detecting':
        return 'Understanding your search query';
      case 'resolving':
        return 'Looking up location details';
      case 'filtering':
        return 'Finding recalls in the area';
      case 'people':
        return 'Matching people in your recalls';
      case 'keywords':
        return 'Analyzing content and images';
      case 'searching':
        return 'Crafting your personalized answer';
      case 'complete':
        return 'Search completed successfully';
      default:
        return '';
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconContainer, pulseStyle]}>
        <Animated.View style={stage !== 'complete' ? iconRotationStyle : undefined}>
          <IconSymbol
            name={getStageIcon()}
            size={48}
            color={stage === 'complete' ? colors.success : colors.primary}
          />
        </Animated.View>
      </Animated.View>

      <Text style={styles.stageText}>{getStageText()}</Text>
      <Text style={styles.stageDescription}>{getStageDescription()}</Text>

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

      {/* Stage indicators */}
      <View style={styles.stageIndicators}>
        <View style={[
          styles.stageIndicator,
          (stage === 'detecting' || stage === 'resolving' || stage === 'filtering' || 
           stage === 'people' || stage === 'keywords' || stage === 'searching' || 
           stage === 'complete') && styles.stageIndicatorActive
        ]} />
        <View style={[
          styles.stageIndicator,
          (stage === 'resolving' || stage === 'filtering' || stage === 'people' || 
           stage === 'keywords' || stage === 'searching' || stage === 'complete') && 
           styles.stageIndicatorActive
        ]} />
        <View style={[
          styles.stageIndicator,
          (stage === 'filtering' || stage === 'people' || stage === 'keywords' || 
           stage === 'searching' || stage === 'complete') && styles.stageIndicatorActive
        ]} />
        <View style={[
          styles.stageIndicator,
          (stage === 'people' || stage === 'keywords' || stage === 'searching' || 
           stage === 'complete') && styles.stageIndicatorActive
        ]} />
        <View style={[
          styles.stageIndicator,
          (stage === 'keywords' || stage === 'searching' || stage === 'complete') && 
           styles.stageIndicatorActive
        ]} />
        <View style={[
          styles.stageIndicator,
          (stage === 'searching' || stage === 'complete') && styles.stageIndicatorActive
        ]} />
        <View style={[
          styles.stageIndicator,
          stage === 'complete' && styles.stageIndicatorActive
        ]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stageText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  stageDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginTop: 4,
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  progressBarContainer: {
    width: '85%',
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  stageIndicators: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  stageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  stageIndicatorActive: {
    backgroundColor: colors.primary,
  },
});
