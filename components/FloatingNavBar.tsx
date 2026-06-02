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

const ACTIVE_PILL_BG = 'rgba(255, 107, 122, 0.13)';
const INACTIVE_ICON_COLOR = colors.textSecondary;
const ACTIVE_ICON_COLOR = colors.primary;
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
    pillOpacity.value = withTiming(isActive ? 1 : 0, { duration: 180 });
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
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
            size={26}
            color={activeRoute === 'home' ? ACTIVE_ICON_COLOR : INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'home' ? 2.2 : 1.8}
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
            size={26}
            color={activeRoute === 'search' ? ACTIVE_ICON_COLOR : INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'search' ? 2.2 : 1.8}
          />
        }
        isActive={activeRoute === 'search'}
        onPress={onSearchPress}
        label="Search"
      />
      <NavButton
        icon={
          <User
            size={26}
            color={activeRoute === 'profile' ? ACTIVE_ICON_COLOR : INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'profile' ? 2.2 : 1.8}
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
    left: 16,
    right: 16,
    height: BAR_HEIGHT,
    borderRadius: 30,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  blurView: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
  },
  androidFallback: {
    flex: 1,
    backgroundColor: 'rgba(30, 30, 30, 0.92)',
    borderRadius: 30,
  },
  innerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACTIVE_PILL_BG,
  },
});
