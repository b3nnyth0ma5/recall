
import React, { useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useColorScheme,
  Dimensions,
  BackHandler,
  Platform,
} from 'react-native';
import { Portal } from '@gorhom/portal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from './IconSymbol';
import { colors, fontFamily } from '@/styles/commonStyles';

interface AnchorPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SharePopoverProps {
  visible: boolean;
  anchorPosition: AnchorPosition | null;
  onSelect: (includeLocation: boolean) => void;
  onDismiss: () => void;
}

const POPOVER_WIDTH = 220;
const TAIL_SIZE = 10;
const POPOVER_GAP = 8;
const SCREEN_EDGE_MARGIN = 12;

export function SharePopover({ visible, anchorPosition, onSelect, onDismiss }: SharePopoverProps) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (visible) {
      console.log('SharePopover opened — firing light haptic');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [visible]);

  // Wire Android hardware back button to dismiss while visible
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onDismiss]);

  const handleSelect = (includeLocation: boolean) => {
    console.log('User selected share option — includeLocation:', includeLocation);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSelect(includeLocation);
  };

  const cardBackground = isDark ? '#2A2A2A' : '#FFFFFF';
  const dividerColor = isDark ? colors.divider : '#E5E5E5';
  const textColor = isDark ? colors.text : colors.textOnLight;

  // Compute popover position using screen-absolute anchor coordinates
  // (measureInWindow returns window-absolute coords; the Portal host is window-rooted,
  //  so these values map directly with no coordinate-space adjustment needed)
  let popoverLeft = 0;
  let popoverTop = 0;
  let tailLeft = POPOVER_WIDTH / 2 - TAIL_SIZE / 2;

  if (anchorPosition) {
    const anchorCenterX = anchorPosition.x + anchorPosition.width / 2;

    // Centre popover on anchor, then clamp to screen edges
    const rawLeft = anchorCenterX - POPOVER_WIDTH / 2;
    const minLeft = SCREEN_EDGE_MARGIN + insets.left;
    const maxLeft = screenWidth - POPOVER_WIDTH - SCREEN_EDGE_MARGIN - insets.right;
    popoverLeft = Math.max(minLeft, Math.min(rawLeft, maxLeft));

    // Tail tracks the anchor centre relative to the (possibly clamped) card
    tailLeft = anchorCenterX - popoverLeft - TAIL_SIZE / 2;
    tailLeft = Math.max(8, Math.min(tailLeft, POPOVER_WIDTH - 8 - TAIL_SIZE));

    // Position card bottom = anchor top - gap - tail - card height estimate (~100px for two rows)
    popoverTop = anchorPosition.y - POPOVER_GAP - TAIL_SIZE - 84;
  }

  const cardStyle = {
    backgroundColor: cardBackground,
    borderRadius: 14,
    width: POPOVER_WIDTH,
    position: 'absolute' as const,
    left: popoverLeft,
    top: popoverTop,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.5 : 0.18,
    shadowRadius: 8,
    elevation: 10000,
    zIndex: 10000,
  };

  const tailStyle = {
    position: 'absolute' as const,
    left: popoverLeft + tailLeft,
    top: popoverTop + 100, // sits just below the card bottom estimate
    width: TAIL_SIZE,
    height: TAIL_SIZE,
    backgroundColor: cardBackground,
    transform: [{ rotate: '45deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 2,
    elevation: 9999,
    zIndex: 9999,
  };

  return (
    <Portal>
      {visible && (
        <View style={styles.overlay} pointerEvents="box-none">
          {/* Backdrop — full-screen tap-to-dismiss (sibling of card, not parent) */}
          <Pressable style={styles.backdrop} onPress={onDismiss} />

          {/* Popover card */}
          <Pressable style={cardStyle} onPress={() => {}}>
            {/* Option 1: Share with location */}
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => handleSelect(true)}
            >
              <IconSymbol name="mappin.and.ellipse" size={18} color={colors.primary} />
              <Text style={[styles.rowText, { color: textColor }]}>
                Share with location
              </Text>
            </Pressable>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: dividerColor }]} />

            {/* Option 2: Share without location */}
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => handleSelect(false)}
            >
              <IconSymbol name="mappin.slash" size={18} color={colors.textSecondary} />
              <Text style={[styles.rowText, { color: textColor }]}>
                Share without location
              </Text>
            </Pressable>
          </Pressable>

          {/* Downward-pointing tail */}
          <View style={tailStyle} />
        </View>
      )}
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    gap: 10,
  },
  rowPressed: {
    opacity: 0.6,
  },
  rowText: {
    fontSize: 15,
    fontFamily: fontFamily.regular,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
  },
});
