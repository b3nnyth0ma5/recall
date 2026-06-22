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

const ICON_COLOR = '#FFFFFF';
const BAR_HEIGHT = 60;
const ACTIVE_BG_SIZE = 40;

// ─── Individual tab button ────────────────────────────────────────────────────
type TabButtonProps = {
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconSize?: number;
  isActive: boolean;
  alwaysShowBg?: boolean;
  onPress: () => void;
  testID: string;
  accessibilityLabel: string;
};

function TabButton({
  iconName,
  iconSize = 22,
  isActive,
  alwaysShowBg = false,
  onPress,
  testID,
  accessibilityLabel,
}: TabButtonProps) {
  const bgScale = useSharedValue(isActive || alwaysShowBg ? 1 : 0.8);

  useEffect(() => {
    bgScale.value = withSpring(isActive || alwaysShowBg ? 1 : 0.8, {
      damping: 18,
      stiffness: 220,
    });
  }, [isActive, alwaysShowBg, bgScale]);

  const bgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bgScale.value }],
    opacity: bgScale.value,
  }));

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
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.tabIconWrapper}>
        <Animated.View style={[styles.activeBg, bgStyle]} />
        <Ionicons name={iconName} size={iconSize} color={ICON_COLOR} />
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

  const bottomOffset = Math.max(insets.bottom - 20, 4);

  const barContent = (
    <View style={[styles.innerRow, { pointerEvents: 'box-none' }]}>
      <TabButton
        testID="navbar-home"
        iconName="home"
        isActive={activeRoute === 'home'}
        onPress={onHomePress}
        accessibilityLabel="Home"
      />

      <TabButton
        testID="navbar-create"
        iconName="add"
        iconSize={26}
        isActive={false}
        alwaysShowBg
        onPress={onCreateRecallPress}
        accessibilityLabel="Create Recall"
      />

      <TabButton
        testID="navbar-search"
        iconName="search"
        isActive={activeRoute === 'search'}
        onPress={onSearchPress}
        accessibilityLabel="Search"
      />

      <TabButton
        testID="navbar-profile"
        iconName="person"
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
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
          </View>
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
    borderRadius: 28,
    overflow: 'visible',
    zIndex: 1000,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0px 6px 20px rgba(0,0,0,0.35)',
  } as any,
  blurWrapper: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    overflow: 'hidden',
  },
  androidFallback: {
    flex: 1,
    backgroundColor: 'rgba(30, 30, 30, 0.95)',
    borderRadius: 28,
    overflow: 'hidden',
  },
  innerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabZone: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapper: {
    width: ACTIVE_BG_SIZE,
    height: ACTIVE_BG_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBg: {
    position: 'absolute',
    width: ACTIVE_BG_SIZE,
    height: ACTIVE_BG_SIZE,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
});
