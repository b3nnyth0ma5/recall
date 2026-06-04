import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { IconSymbol } from './IconSymbol';
import { Share as ShareIcon } from 'lucide-react-native';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';
import { SharePopover } from './SharePopover';

interface RecallUtilityBarProps {
  onAskQuestion: () => void;
  onShare: (options?: { includeLocation: boolean }) => void;
  hasLocation: boolean;
}

/**
 * RecallUtilityBar Component
 * 
 * Instagram-style utility bar with action icons positioned below location and time ago component.
 * Provides quick access to common recall actions.
 * 
 * Features:
 * - Right-aligned icons for consistent UX
 * - Platform-agnostic icons (iOS SF Symbols + Android Material Icons)
 * - Good touch target areas with hitSlop
 * - Haptic feedback on interactions
 * - Non-filled icon versions for cleaner look
 * - Location-aware share popover
 */
export const RecallUtilityBar: React.FC<RecallUtilityBarProps> = ({
  onAskQuestion,
  onShare,
  hasLocation,
}) => {
  const shareButtonRef = useRef<View>(null);
  const [popoverVisible, setPopoverVisible] = useState(false);
  const [anchorRect, setAnchorRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Keep a stable ref to the latest onShare so the callback always calls
  // the latest version even if RecallUtilityBar re-renders.
  const onShareRef = useRef(onShare);
  useEffect(() => {
    onShareRef.current = onShare;
  }, [onShare]);

  const handleAskQuestion = async () => {
    console.log('User tapped Chat icon on recall');
    
    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    onAskQuestion();
  };

  const handleShare = async () => {
    console.log('User tapped Share icon on recall — hasLocation:', hasLocation);
    
    if (!hasLocation) {
      // No location — fire share immediately with existing behaviour
      if (Platform.OS !== 'web') {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }
      onShare();
      return;
    }

    // Has location — measure button and open popover
    shareButtonRef.current?.measureInWindow((x, y, width, height) => {
      console.log('Share button measured — anchor rect:', { x, y, width, height });
      setAnchorRect({ x, y, width, height });
      setPopoverVisible(true);
    });
  };

  return (
    <View style={styles.container}>
      {/* Chat Icon (formerly "Ask a Question") - Non-filled version */}
      <Pressable
        onPress={handleAskQuestion}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        style={styles.iconButton}
      >
        <IconSymbol
          name="message"
          size={24}
          color={colors.primary}
        />
      </Pressable>

      {/* Share Icon - Non-filled version */}
      <Pressable
        ref={shareButtonRef}
        onPress={handleShare}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        style={styles.iconButton}
      >
        <ShareIcon
          size={20}
          color={colors.primary}
          strokeWidth={1.7}
        />
      </Pressable>

      <SharePopover
        visible={popoverVisible}
        anchorPosition={anchorRect}
        onSelect={(includeLocation) => {
          console.log('SharePopover selection — includeLocation:', includeLocation);
          setPopoverVisible(false);
          console.log('Firing onShare immediately — includeLocation:', includeLocation);
          onShareRef.current({ includeLocation });
        }}
        onDismiss={() => {
          console.log('SharePopover dismissed');
          setPopoverVisible(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 8,
  },
  iconButton: {
    padding: 4,
  },
});
