import React, { useEffect } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Home, Plus, Search, User } from 'lucide-react-native';
import { colors } from '@/styles/commonStyles';

type ActiveRoute = 'home' | 'search' | 'profile' | null;

type Props = {
  visible: boolean;
  activeRoute: ActiveRoute;
  onHomePress: () => void;
  onCreateRecallPress: () => void;
  onSearchPress: () => void;
  onProfilePress: () => void;
};

const INACTIVE_ICON_COLOR = '#FFFFFF';
const ACTIVE_ICON_COLOR = '#FFFFFF';
const BAR_HEIGHT = 68;

// Pressable dimensions — must exceed Apple HIG 44pt minimum
const BUTTON_WIDTH = 56;
const BUTTON_HEIGHT = 52;
const BUTTON_BORDER_RADIUS = 18;

// Active pill dimensions — centred inside the Pressable
// left = (BUTTON_WIDTH - PILL_SIZE) / 2 = (56 - 44) / 2 = 6
// top  = (BUTTON_HEIGHT - PILL_SIZE) / 2 = (52 - 44) / 2 = 4
const PILL_SIZE = 44;
const PILL_LEFT = (BUTTON_WIDTH - PILL_SIZE) / 2;   // 6
const PILL_TOP  = (BUTTON_HEIGHT - PILL_SIZE) / 2;  // 4

function NavButton({
  icon,
  isActive,
  onPress,
  label,
}: {
  icon: React.ReactNode;
  isActive: boolean;
  onPress: () => void;
  label: string;
}) {
  const pillOpacity = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    pillOpacity.value = withTiming(isActive ? 1 : 0, { duration: 150 });
  }, [isActive, pillOpacity]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.value,
  }));

  const handlePress = () => {
    console.log(`[FloatingNavBar] Tapped: ${label}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    // Outer column: flex layout spacer — does NOT absorb taps
    <View style={styles.navColumn} pointerEvents="box-none">
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [styles.navButton, { opacity: pressed ? 0.7 : 1 }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={label}
      >
        {/* Active pill — absolute, behind the icon */}
        <Animated.View style={[styles.activePill, pillStyle]} />
        {/* Icon — explicitly above the pill */}
        <View style={styles.iconWrapper}>
          {icon}
        </View>
      </Pressable>
    </View>
  );
}

export function FloatingNavBar({
  visible,
  activeRoute,
  onHomePress,
  onCreateRecallPress,
  onSearchPress,
  onProfilePress,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 220 });
    } else {
      translateY.value = withTiming(100 + insets.bottom, { duration: 200 });
    }
  }, [visible, insets.bottom, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const bottomOffset = insets.bottom - 20;

  const barContent = (
    // innerRow passes taps through to the Pressables inside each navColumn
    <View style={styles.innerRow} pointerEvents="box-none">
      <NavButton
        icon={
          <Home
            size={24}
            color={INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'home' ? 2.4 : 1.8}
          />
        }
        isActive={activeRoute === 'home'}
        onPress={onHomePress}
        label="Home"
      />
      <NavButton
        icon={
          <Plus
            size={26}
            color={INACTIVE_ICON_COLOR}
            strokeWidth={1.8}
          />
        }
        isActive={false}
        onPress={onCreateRecallPress}
        label="Create Recall"
      />
      <NavButton
        icon={
          <Search
            size={24}
            color={INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'search' ? 2.4 : 1.8}
          />
        }
        isActive={activeRoute === 'search'}
        onPress={onSearchPress}
        label="Search"
      />
      <NavButton
        icon={
          <User
            size={24}
            color={INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'profile' ? 2.4 : 1.8}
          />
        }
        isActive={activeRoute === 'profile'}
        onPress={onProfilePress}
        label="Profile"
      />
    </View>
  );

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={[
        styles.container,
        { bottom: bottomOffset },
        animatedStyle,
      ]}
    >
      {/* Halo glow ring behind the bar */}
      {Platform.OS === 'ios' && (
        <View style={styles.haloRing} pointerEvents="none" />
      )}
      {Platform.OS === 'ios' ? (
        // pointerEvents="box-none" so the BlurView background never swallows taps
        <BlurView intensity={100} tint="dark" style={styles.blurView} pointerEvents="box-none">
          {barContent}
        </BlurView>
      ) : (
        <View style={styles.androidFallback} pointerEvents="box-none">
          {barContent}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    width: '75%',
    maxWidth: 360,
    height: BAR_HEIGHT,
    borderRadius: 30,
    overflow: 'visible',
    zIndex: 1000,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  haloRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
  },
  blurView: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
  },
  androidFallback: {
    flex: 1,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 30,
    overflow: 'hidden',
  },
  innerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  // Outer flex column — layout spacer only, never absorbs taps
  navColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The actual tap surface — explicit size, centred in the column
  navButton: {
    width: BUTTON_WIDTH,
    height: BUTTON_HEIGHT,
    borderRadius: BUTTON_BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  // Active pill — absolutely positioned and precisely centred inside navButton
  activePill: {
    position: 'absolute',
    top: PILL_TOP,
    left: PILL_LEFT,
    width: PILL_SIZE,
    height: PILL_SIZE,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  // Icon wrapper — sits above the pill in the stacking order
  iconWrapper: {
    zIndex: 1,
  },
});
