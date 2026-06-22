import React, { useEffect } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
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
const BAR_HEIGHT = 56;
const TAB_COUNT = 4;
const CHIP_SIZE = 44;

// ─── Sliding chip ─────────────────────────────────────────────────────────────
function routeToIndex(route: ActiveRoute): number {
  switch (route) {
    case 'home': return 0;
    case 'search': return 2;
    case 'profile': return 3;
    default: return -1; // create button — no chip
  }
}

// ─── Individual tab button ────────────────────────────────────────────────────
type TabButtonProps = {
  icon: React.ReactNode;
  isActive: boolean;
  onPress: () => void;
  testID: string;
  accessibilityLabel: string;
};

function TabButton({ icon, isActive: _isActive, onPress, testID, accessibilityLabel }: TabButtonProps) {
  const handlePress = () => {
    console.log(`[FloatingNavBar] Tapped: ${accessibilityLabel}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      style={({ pressed }) => [styles.tabZone, { opacity: pressed ? 0.75 : 1 }]}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.tabIconWrapper}>
        {icon}
      </View>
    </Pressable>
  );
}

// ─── Create button ────────────────────────────────────────────────────────────
type CreateButtonProps = {
  onPress: () => void;
};

function CreateButton({ onPress }: CreateButtonProps) {
  const handlePress = () => {
    console.log('[FloatingNavBar] Tapped: Create Recall');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      testID="navbar-create"
      onPress={handlePress}
      style={({ pressed }) => [styles.tabZone, { opacity: pressed ? 0.75 : 1 }]}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityLabel="Create Recall"
    >
      <View style={styles.createPill}>
        <Ionicons name="add" size={22} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function FloatingNavBar({
  visible,
  activeRoute,
  onHomePress,
  onCreateRecallPress,
  onSearchPress,
  onProfilePress,
}: Props) {
  const insets = useSafeAreaInsets();

  // Visibility: slide in/out
  const translateY = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 220 });
    } else {
      translateY.value = withTiming(100 + insets.bottom, { duration: 200 });
    }
  }, [visible, insets.bottom, translateY]);

  const containerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Mirror activeRoute index into a shared value so worklets can read it safely
  const activeRouteIndexSV = useSharedValue(routeToIndex(activeRoute));
  useEffect(() => {
    activeRouteIndexSV.value = routeToIndex(activeRoute);
  }, [activeRoute, activeRouteIndexSV]);

  // Sliding chip: tracks active tab index
  const chipIndex = useSharedValue(routeToIndex(activeRoute));
  useEffect(() => {
    const idx = routeToIndex(activeRoute);
    if (idx >= 0) {
      chipIndex.value = withSpring(idx, {
        damping: 20,
        stiffness: 200,
        mass: 0.8,
      });
    }
  }, [activeRoute, chipIndex]);

  const barWidth = useSharedValue(0);

  const chipAnimStyle = useAnimatedStyle(() => {
    const tabWidth = barWidth.value / TAB_COUNT;
    const chipLeft = chipIndex.value * tabWidth + (tabWidth - CHIP_SIZE) / 2;
    return {
      transform: [{ translateX: chipLeft }],
      opacity: barWidth.value > 0 && activeRouteIndexSV.value >= 0 ? 1 : 0,
    };
  });

  const bottomOffset = Math.max(insets.bottom - 20, 4);

  const barContent = (
    <View
      style={[styles.innerRow, { pointerEvents: 'box-none' }]}
      onLayout={(e) => {
        barWidth.value = e.nativeEvent.layout.width;
      }}
    >
      {/* Sliding chip — absolutely positioned, behind all buttons */}
      <Animated.View style={[styles.slidingChip, chipAnimStyle]} pointerEvents="none" />

      <TabButton
        testID="navbar-home"
        icon={
          <Ionicons
            name="home"
            size={22}
            color={INACTIVE_ICON_COLOR}
          />
        }
        isActive={activeRoute === 'home'}
        onPress={onHomePress}
        accessibilityLabel="Home"
      />

      <CreateButton onPress={onCreateRecallPress} />

      <TabButton
        testID="navbar-search"
        icon={
          <Ionicons
            name="search"
            size={22}
            color={INACTIVE_ICON_COLOR}
          />
        }
        isActive={activeRoute === 'search'}
        onPress={onSearchPress}
        accessibilityLabel="Search"
      />

      <TabButton
        testID="navbar-profile"
        icon={
          <Ionicons
            name="person"
            size={22}
            color={INACTIVE_ICON_COLOR}
          />
        }
        isActive={activeRoute === 'profile'}
        onPress={onProfilePress}
        accessibilityLabel="Profile"
      />
    </View>
  );

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={[
        styles.container,
        { bottom: bottomOffset },
        containerAnimStyle,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <>
          {/* Blur background — decorative, never receives touches */}
          <View style={styles.blurWrapper} pointerEvents="none">
            <BlurView
              intensity={100}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          </View>
          {/* Halo ring — decorative only */}
          <View style={[styles.haloRing, { pointerEvents: 'none' }]} />
          {barContent}
        </>
      ) : (
        <View style={[styles.androidFallback, { pointerEvents: 'box-none' }]}>
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
    width: '80%',
    maxWidth: 380,
    height: BAR_HEIGHT,
    borderRadius: 30,
    overflow: 'visible',
    zIndex: 1000,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    boxShadow: '0px 6px 20px rgba(0,0,0,0.35)',
  } as any,
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
  blurWrapper: {
    ...StyleSheet.absoluteFillObject,
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
    paddingHorizontal: 4,
    paddingVertical: 0,
    position: 'relative',
  },
  // Sliding chip — absolutely positioned at left:0, translateX moves it
  slidingChip: {
    position: 'absolute',
    top: (BAR_HEIGHT - CHIP_SIZE) / 2,
    left: 0,
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    backgroundColor: colors.primary,
    zIndex: 0,
  },
  // Each tab zone: flex:1, tall touch target
  tabZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    zIndex: 1,
  },
  tabIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Create button pill — slightly larger, accent background
  createPill: {
    width: 40,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
