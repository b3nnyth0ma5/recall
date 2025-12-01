
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol, IconSymbolName } from './IconSymbol';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

interface ZeroStateProps {
  icon: IconSymbolName;
  title: string;
  message: string;
  actionText?: string;
  onActionPress?: () => void;
  animatedIcon?: boolean;
}

export function ZeroState({ 
  icon, 
  title, 
  message, 
  actionText, 
  onActionPress,
  animatedIcon = true 
}: ZeroStateProps) {
  // Animated icon style - gentle bounce
  const animatedIconStyle = useAnimatedStyle(() => {
    if (!animatedIcon) {
      return {};
    }
    return {
      transform: [
        {
          translateY: withRepeat(
            withSequence(
              withTiming(-8, { duration: 1200 }),
              withTiming(0, { duration: 1200 })
            ),
            -1,
            false
          ),
        },
      ],
    };
  });

  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.container}>
      <Animated.View style={[styles.iconContainer, animatedIconStyle]}>
        <IconSymbol name={icon} size={80} color={colors.textTertiary} />
      </Animated.View>
      
      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </Animated.View>

      {actionText && onActionPress && (
        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.actionContainer}>
          <Pressable onPress={onActionPress} style={styles.actionButton}>
            <Text style={styles.actionText}>{actionText}</Text>
            <IconSymbol name="arrow.right" size={18} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  iconContainer: {
    marginBottom: 24,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  actionContainer: {
    width: '100%',
    maxWidth: 280,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
