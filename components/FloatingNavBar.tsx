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
const BAR_HEIGHT = 60;

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
    <Pressable
      onPress={handlePress}
      style={styles.navButton}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      accessibilityLabel={label}
    >
      {({ pressed }) => (
        <View style={[styles.navButtonInner, { opacity: pressed ? 0.7 : 1 }]}>
          <Animated.View style={[styles.activePill, pillStyle]} />
          {icon}
        </View>
      )}
    </Pressable>
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
    <View style={styles.innerRow}>
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
        <BlurView intensity={100} tint="dark" style={styles.blurView}>
          {barContent}
        </BlurView>
      ) : (
        <View style={styles.androidFallback}>
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
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonInner: {
    width: 52,
    height: 36,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    position: 'absolute',
    width: 44,
    height: 38,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
});
