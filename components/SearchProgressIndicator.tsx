
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  withTiming,
  Easing,
  useSharedValue,
} from 'react-native-reanimated';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface SearchProgressIndicatorProps {
  stage: 'resolving' | 'people' | 'keywords' | 'searching' | 'complete' | 'idle';
  locationName?: string;
  personNames?: string[];
  extractedKeywords?: string[];
  isExpanded: boolean;
  onToggle: () => void;
  locationInfo?: {
    proximity?: number;
    resolvedPlace?: string;
    multipleLocations?: boolean;
    locationCount?: number;
  };
  searchTimings?: {
    locationSearchMs?: number;
    peopleSearchMs?: number;
    keywordSearchMs?: number;
    aiAnswerMs?: number;
    totalMs?: number;
  };
  shouldShowTimings?: boolean;
}

interface StepConfig {
  id: string;
  icon: string;
  title: string;
  description: string;
  stages: string[];
  timingKey?: 'locationSearchMs' | 'peopleSearchMs' | 'keywordSearchMs' | 'aiAnswerMs' | 'totalMs';
}

// TEMPORARILY DISABLED: Location and People search steps
// These can be re-enabled later by uncommenting the steps below
const STEPS: StepConfig[] = [
  // {
  //   id: 'resolving',
  //   icon: 'map.fill',
  //   title: 'Analysing for location(s)',
  //   description: 'Looking up location details',
  //   stages: ['resolving', 'people', 'keywords', 'searching', 'complete'],
  //   timingKey: 'locationSearchMs',
  // },
  // {
  //   id: 'people',
  //   icon: 'person.2.fill',
  //   title: 'Analysing for people',
  //   description: 'Matching people in your recalls',
  //   stages: ['people', 'keywords', 'searching', 'complete'],
  //   timingKey: 'peopleSearchMs',
  // },
  {
    id: 'keywords',
    icon: 'text.word.spacing',
    title: 'Extracting keywords',
    description: 'Analyzing content and images',
    stages: ['keywords', 'searching', 'complete'],
    timingKey: 'keywordSearchMs',
  },
  {
    id: 'searching',
    icon: 'sparkles',
    title: 'Generating answer with AI',
    description: 'Crafting your personalized answer',
    stages: ['searching', 'complete'],
    timingKey: 'aiAnswerMs',
  },
  {
    id: 'complete',
    icon: 'checkmark.circle.fill',
    title: 'Complete',
    description: 'Search completed successfully',
    stages: ['complete'],
    timingKey: 'totalMs',
  },
];

export function SearchProgressIndicator({ 
  stage, 
  locationName, 
  personNames,
  extractedKeywords,
  isExpanded,
  onToggle,
  locationInfo,
  searchTimings,
  shouldShowTimings = false,
}: SearchProgressIndicatorProps) {
  const heightValue = useSharedValue(isExpanded ? 1 : 0);

  useEffect(() => {
    heightValue.value = withTiming(isExpanded ? 1 : 0, { duration: 300 });
  }, [isExpanded, heightValue]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      maxHeight: heightValue.value === 0 ? 0 : 1000,
      opacity: heightValue.value === 0 ? 0 : 1,
      overflow: 'hidden',
    };
  });

  const isStepComplete = (step: StepConfig): boolean => {
    // Check if we've passed this stage
    const stageOrder = ['resolving', 'people', 'keywords', 'searching', 'complete'];
    const currentStageIndex = stageOrder.indexOf(stage);
    const stepStageIndex = stageOrder.indexOf(step.id);
    
    return currentStageIndex > stepStageIndex || (stage === 'complete' && step.id !== 'complete');
  };

  const isStepActive = (step: StepConfig): boolean => {
    return stage === step.id;
  };

  const getStepStatus = (step: StepConfig): 'pending' | 'active' | 'complete' => {
    if (isStepComplete(step)) {
      return 'complete';
    }
    if (isStepActive(step)) {
      return 'active';
    }
    return 'pending';
  };

  const getStepTitle = (step: StepConfig): string => {
    if (step.id === 'resolving' && locationName) {
      return `Finding ${locationName}`;
    }
    if (step.id === 'people' && personNames && personNames.length > 0) {
      return `Finding recalls with ${personNames.join(', ')}`;
    }
    return step.title;
  };

  // Determine the header title based on stage
  const getHeaderTitle = (): string => {
    if (stage === 'complete') {
      return 'Search Completed';
    }
    return 'Search Steps';
  };

  // Format timing for display
  const formatTiming = (ms?: number): string => {
    if (ms === undefined) return '';
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <Pressable 
        onPress={onToggle}
        style={styles.header}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.headerLeft}>
          <IconSymbol 
            name={stage === 'complete' ? 'checkmark.circle.fill' : 'arrow.clockwise.circle.fill'} 
            size={20} 
            color={stage === 'complete' ? colors.success : colors.primary} 
          />
          <Text style={styles.headerTitle}>
            {getHeaderTitle()}
          </Text>
        </View>
        <IconSymbol 
          name={isExpanded ? "chevron.up" : "chevron.down"} 
          size={20} 
          color={colors.textSecondary} 
        />
      </Pressable>

      <Animated.View style={animatedStyle}>
        <View style={styles.stepsContainer}>
          {STEPS.map((step, index) => {
            const status = getStepStatus(step);
            const isLast = index === STEPS.length - 1;
            const timing = step.timingKey && searchTimings ? searchTimings[step.timingKey] : undefined;

            return (
              <React.Fragment key={step.id}>
                <StepItem
                  step={step}
                  status={status}
                  locationName={locationName}
                  personNames={personNames}
                  extractedKeywords={extractedKeywords}
                  title={getStepTitle(step)}
                  isSearchComplete={stage === 'complete'}
                  locationInfo={locationInfo}
                  timing={timing}
                  shouldShowTimings={shouldShowTimings}
                  formatTiming={formatTiming}
                />
                {!isLast && <StepConnector status={status} isSearchComplete={stage === 'complete'} />}
              </React.Fragment>
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

interface StepItemProps {
  step: StepConfig;
  status: 'pending' | 'active' | 'complete';
  locationName?: string;
  personNames?: string[];
  extractedKeywords?: string[];
  title: string;
  isSearchComplete: boolean;
  locationInfo?: {
    proximity?: number;
    resolvedPlace?: string;
    multipleLocations?: boolean;
    locationCount?: number;
  };
  timing?: number;
  shouldShowTimings?: boolean;
  formatTiming: (ms?: number) => string;
}

function StepItem({ 
  step, 
  status, 
  locationName, 
  personNames, 
  extractedKeywords,
  title,
  isSearchComplete,
  locationInfo,
  timing,
  shouldShowTimings,
  formatTiming,
}: StepItemProps) {
  // Keep colors active even after search completes
  const iconColor = status === 'complete' 
    ? colors.success 
    : status === 'active' 
    ? colors.primary 
    : colors.textTertiary;

  // Keep text colors active (don't grey out after completion)
  const textColor = colors.text;

  const iconContainerStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: status === 'complete'
        ? withTiming(`${colors.success}20`, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
        : status === 'active'
        ? withTiming(`${colors.primary}20`, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
        : withTiming(`${colors.textTertiary}10`, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
    };
  });

  // Determine what to show for location step
  const getLocationDisplay = () => {
    if (step.id === 'resolving') {
      if (!locationName) {
        return 'No location(s) detected';
      }
      
      // Show location with search radius/area
      if (locationInfo) {
        const radiusText = locationInfo.proximity 
          ? ` (${locationInfo.proximity}km radius)` 
          : '';
        return `${locationName}${radiusText}`;
      }
      
      return locationName;
    }
    return null;
  };

  // Determine what to show for people step
  const getPeopleDisplay = () => {
    if (step.id === 'people') {
      if (!personNames || personNames.length === 0) {
        return 'No people detected';
      }
      return personNames.join(', ');
    }
    return null;
  };

  const locationDisplay = getLocationDisplay();
  const peopleDisplay = getPeopleDisplay();

  return (
    <View style={styles.stepItem}>
      <Animated.View style={[styles.iconContainer, iconContainerStyle]}>
        <IconSymbol
          name={status === 'complete' ? 'checkmark.circle.fill' : step.icon}
          size={28}
          color={iconColor}
        />
      </Animated.View>
      <View style={styles.stepContent}>
        <View style={styles.stepTitleRow}>
          <Text style={[styles.stepTitle, { color: textColor }]}>
            {title}
          </Text>
          {shouldShowTimings && timing !== undefined && (
            <Text style={styles.timingText}>
              {formatTiming(timing)}
            </Text>
          )}
        </View>
        {/* Step description commented out for now */}
        {/* <Text style={[styles.stepDescription, { color: descriptionColor }]}>
          {step.description}
        </Text> */}
        
        {/* Show location badge - keep visible after search completes */}
        {locationDisplay && step.id === 'resolving' && (
          <View style={styles.infoBadge}>
            <IconSymbol name="mappin.circle.fill" size={14} color={colors.primary} />
            <Text style={styles.infoText}>{locationDisplay}</Text>
          </View>
        )}

        {/* Show people badge - keep visible after search completes */}
        {peopleDisplay && step.id === 'people' && (
          <View style={styles.infoBadge}>
            <IconSymbol name="person.circle.fill" size={14} color={colors.primary} />
            <Text style={styles.infoText}>{peopleDisplay}</Text>
          </View>
        )}

        {/* Show extracted keywords badge - keep visible after search completes */}
        {extractedKeywords && extractedKeywords.length > 0 && step.id === 'keywords' && (
          <View style={styles.infoBadge}>
            <IconSymbol name="text.word.spacing" size={14} color={colors.primary} />
            <Text style={styles.infoText}>{extractedKeywords.join(', ')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

interface StepConnectorProps {
  status: 'pending' | 'active' | 'complete';
  isSearchComplete: boolean;
}

function StepConnector({ status, isSearchComplete }: StepConnectorProps) {
  const connectorStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: status === 'complete'
        ? withTiming(colors.success, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
        : withTiming(colors.border, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
    };
  });

  return <Animated.View style={[styles.connector, connectorStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  stepsContainer: {
    width: '100%',
    marginTop: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepContent: {
    flex: 1,
    justifyContent: 'center',
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  timingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  infoText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  connector: {
    width: 2,
    height: 24,
    marginLeft: 23,
    marginVertical: 4,
  },
});
