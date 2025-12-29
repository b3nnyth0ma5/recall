
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface SearchProgressIndicatorProps {
  stage: 'detecting' | 'resolving' | 'filtering' | 'people' | 'keywords' | 'searching' | 'complete';
  locationName?: string;
  personNames?: string[];
  extractedKeywords?: string[];
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
    id: 'detecting',
    icon: 'magnifyingglass.circle.fill',
    title: 'Analyzing search intent',
    description: 'Understanding your search query',
    stages: ['detecting', 'resolving', 'filtering', 'people', 'keywords', 'searching', 'complete'],
  },
  {
    id: 'resolving',
    icon: 'map.fill',
    title: 'Resolving location',
    description: 'Looking up location details',
    stages: ['resolving', 'filtering', 'people', 'keywords', 'searching', 'complete'],
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
  extractedKeywords 
}: SearchProgressIndicatorProps) {
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

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.container}>
      <View style={styles.stepsContainer}>
        {STEPS.map((step, index) => {
          const status = getStepStatus(step);
          const isLast = index === STEPS.length - 1;

          return (
            <React.Fragment key={step.id}>
              <StepItem
                step={step}
                status={status}
                locationName={locationName}
                personNames={personNames}
                extractedKeywords={extractedKeywords}
                title={getStepTitle(step)}
              />
              {!isLast && <StepConnector status={status} />}
            </React.Fragment>
          );
        })}
      </View>
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
}

function StepItem({ 
  step, 
  status, 
  locationName, 
  personNames, 
  extractedKeywords,
  title 
}: StepItemProps) {
  const iconColor = status === 'complete' 
    ? colors.success 
    : status === 'active' 
    ? colors.primary 
    : colors.textTertiary;

  const textColor = status === 'pending' ? colors.textTertiary : colors.text;
  const descriptionColor = status === 'pending' ? colors.textTertiary : colors.textSecondary;

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
        
        {/* Show location badge when resolving */}
        {locationName && step.id === 'resolving' && status !== 'pending' && (
          <View style={styles.infoBadge}>
            <IconSymbol name="mappin.circle.fill" size={14} color={colors.primary} />
            <Text style={styles.infoText}>{locationName}</Text>
          </View>
        )}

        {/* Show people badge when searching for people */}
        {personNames && personNames.length > 0 && step.id === 'people' && status !== 'pending' && (
          <View style={styles.infoBadge}>
            <IconSymbol name="person.circle.fill" size={14} color={colors.primary} />
            <Text style={styles.infoText}>{personNames.join(', ')}</Text>
          </View>
        )}

        {/* Show extracted keywords badge when extracting keywords */}
        {extractedKeywords && extractedKeywords.length > 0 && step.id === 'keywords' && status !== 'pending' && (
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
}

function StepConnector({ status }: StepConnectorProps) {
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
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  stepsContainer: {
    width: '100%',
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
