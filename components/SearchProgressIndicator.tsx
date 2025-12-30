
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
}

interface StepConfig {
  id: string;
  icon: string;
  title: string;
  description: string;
  stages: string[];
}

const STEPS: StepConfig[] = [
  {
    id: 'resolving',
    icon: 'map.fill',
    title: 'Resolving location',
    description: 'Looking up location details',
    stages: ['resolving', 'people', 'keywords', 'searching', 'complete'],
  },
  {
    id: 'people',
    icon: 'person.2.fill',
    title: 'Searching for people',
    description: 'Matching people in your recalls',
    stages: ['people', 'keywords', 'searching', 'complete'],
  },
  {
    id: 'keywords',
    icon: 'text.word.spacing',
    title: 'Extracting keywords',
    description: 'Analyzing content and images',
    stages: ['keywords', 'searching', 'complete'],
  },
  {
    id: 'searching',
    icon: 'sparkles',
    title: 'Generating answer with AI',
    description: 'Crafting your personalized answer',
    stages: ['searching', 'complete'],
  },
  {
    id: 'complete',
    icon: 'checkmark.circle.fill',
    title: 'Complete',
    description: 'Search completed successfully',
    stages: ['complete'],
  },
];

export function SearchProgressIndicator({ 
  stage, 
  locationName, 
  personNames,
  extractedKeywords,
  isExpanded,
  onToggle,
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
    return step.stages.includes(stage) && stage !== step.id;
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

  // Determine if step should be visible (has data or is active/complete)
  const shouldShowStep = (step: StepConfig): boolean => {
    const status = getStepStatus(step);
    
    // Always show if active or complete
    if (status === 'active' || status === 'complete') {
      return true;
    }
    
    // For pending steps, only show if we have data
    if (step.id === 'resolving' && locationName) {
      return true;
    }
    if (step.id === 'people' && personNames && personNames.length > 0) {
      return true;
    }
    if (step.id === 'keywords' && extractedKeywords && extractedKeywords.length > 0) {
      return true;
    }
    
    // Show searching and complete steps if they're in the current stage path
    if (step.id === 'searching' || step.id === 'complete') {
      return status !== 'pending';
    }
    
    return false;
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
            {stage === 'complete' ? 'Search Completed' : 'Searching...'}
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
          {STEPS.filter(shouldShowStep).map((step, index, visibleSteps) => {
            const status = getStepStatus(step);
            const isLast = index === visibleSteps.length - 1;

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
}

function StepItem({ 
  step, 
  status, 
  locationName, 
  personNames, 
  extractedKeywords,
  title,
  isSearchComplete,
}: StepItemProps) {
  // Keep colors active even after search completes
  const iconColor = status === 'complete' 
    ? colors.success 
    : status === 'active' 
    ? colors.primary 
    : colors.textTertiary;

  // Keep text colors active (don't grey out after completion)
  const textColor = colors.text;
  const descriptionColor = colors.textSecondary;

  const iconContainerStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: status === 'complete'
        ? withTiming(`${colors.success}20`, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
        : status === 'active'
        ? withTiming(`${colors.primary}20`, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) })
        : withTiming(`${colors.textTertiary}10`, { duration: 300, easing: Easing.bezier(0.25, 0.1, 0.25, 1) }),
    };
  });

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
        <Text style={[styles.stepTitle, { color: textColor }]}>
          {title}
        </Text>
        <Text style={[styles.stepDescription, { color: descriptionColor }]}>
          {step.description}
        </Text>
        
        {/* Show location badge - keep visible after search completes */}
        {locationName && step.id === 'resolving' && (
          <View style={styles.infoBadge}>
            <IconSymbol name="mappin.circle.fill" size={14} color={colors.primary} />
            <Text style={styles.infoText}>{locationName}</Text>
          </View>
        )}

        {/* Show people badge - keep visible after search completes */}
        {personNames && personNames.length > 0 && step.id === 'people' && (
          <View style={styles.infoBadge}>
            <IconSymbol name="person.circle.fill" size={14} color={colors.primary} />
            <Text style={styles.infoText}>{personNames.join(', ')}</Text>
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
    marginBottom: 8,
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
    alignItems: 'flex-start',
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
    paddingTop: 4,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
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
