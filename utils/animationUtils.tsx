
import { Platform, View } from 'react-native';

// On web and all platforms, use regular View to avoid Reanimated initialization issues
export const SafeAnimatedView = View;

// Export animation presets that are safe for all platforms (no animations)
export const safeAnimations = {
  fadeIn: undefined,
  fadeInDown: undefined,
};

// Helper to conditionally apply entering animations (always returns undefined)
export const getEnteringAnimation = (animation: any) => {
  return undefined;
};
