import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
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
const BAR_HEIGHT = 72;
const TAB_COUNT = 4;

// ─── Sliding chip ─────────────────────────────────────────────────────────────
// The chip translates horizontally to sit under the active tab.
// Each tab zone is (barWidth / TAB_COUNT) wide; the chip is centred inside it.
// We use a shared value that holds the tab index (0-3) and derive translateX
// via withSpring so it animates smoothly between tabs.

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
  label: string;
  isActive: boolean;
  onPress: () => void;
  testID: string;
};

function TabButton({ icon, label, isActive, onPress, testID }: TabButtonProps) {
  const handlePress = () => {
    console.log(`[FloatingNavBar] Tapped: ${label}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      style={({ pressed }) => [styles.tabZone, { opacity: pressed ? 0.75 : 1 }]}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityLabel={label}
    >
      <View style={styles.tabIconWrapper}>
        {icon}
      </View>
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
        {label}
      </Text>
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
        <Plus size={22} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <Text style={styles.tabLabel}>
        New
      </Text>
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

  // The chip translateX is computed as a percentage of the bar width.
  // We use a fixed pixel approach: each tab zone is barWidth/4 wide.
  // Since we can't read barWidth at style-time, we use onLayout on the inner row
  // and store it in a shared value.
  const barWidth = useSharedValue(0);

  const chipAnimStyle = useAnimatedStyle(() => {
    const tabWidth = barWidth.value / TAB_COUNT;
    const chipWidth = 52;
    const chipLeft = chipIndex.value * tabWidth + (tabWidth - chipWidth) / 2;
    return {
      transform: [{ translateX: chipLeft }],
      opacity: barWidth.value > 0 && routeToIndex(activeRoute) >= 0 ? 1 : 0,
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
          <Home
            size={22}
            color={INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'home' ? 2.4 : 1.8}
          />
        }
        label="Home"
        isActive={activeRoute === 'home'}
        onPress={onHomePress}
      />

      <CreateButton onPress={onCreateRecallPress} />

      <TabButton
        testID="navbar-search"
        icon={
          <Search
            size={22}
            color={INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'search' ? 2.4 : 1.8}
          />
        }
        label="Search"
        isActive={activeRoute === 'search'}
        onPress={onSearchPress}
      />

      <TabButton
        testID="navbar-profile"
        icon={
          <User
            size={22}
            color={INACTIVE_ICON_COLOR}
            strokeWidth={activeRoute === 'profile' ? 2.4 : 1.8}
          />
        }
        label="Profile"
        isActive={activeRoute === 'profile'}
        onPress={onProfilePress}
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
    paddingVertical: 8,
    position: 'relative',
  },
  // Sliding chip — absolutely positioned at left:0, translateX moves it
  slidingChip: {
    position: 'absolute',
    top: 8,
    left: 0,
    width: 52,
    height: BAR_HEIGHT - 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 107, 122, 0.22)',
    zIndex: 0,
  },
  // Each tab zone: flex:1, tall touch target
  tabZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 3,
    zIndex: 1,
  },
  tabIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#FFFFFF',
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
