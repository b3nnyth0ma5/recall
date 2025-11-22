
import { Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { View } from 'react-native';

// On web, use regular View instead of Animated.View to avoid initialization issues
export const SafeAnimatedView = Platform.OS === 'web' ? View : Animated.View;

// Export animation presets that are safe for web
export const safeAnimations = {
  fadeIn: Platform.OS === 'web' ? undefined : require('react-native-reanimated').FadeIn,
  fadeInDown: Platform.OS === 'web' ? undefined : require('react-native-reanimated').FadeInDown,
};

// Helper to conditionally apply entering animations
export const getEnteringAnimation = (animation: any) => {
  if (Platform.OS === 'web') {
    return undefined;
  }
  return animation;
};
