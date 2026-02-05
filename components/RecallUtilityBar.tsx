
import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

interface RecallUtilityBarProps {
  onAskQuestion: () => void;
  onShare: () => void;
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
 */
export const RecallUtilityBar: React.FC<RecallUtilityBarProps> = ({
  onAskQuestion,
  onShare,
}) => {
  const handleAskQuestion = async () => {
    console.log('User tapped Chat icon on recall');
    
    // Provide haptic feedback
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
    console.log('User tapped Share icon on recall');
    
    // Provide haptic feedback
    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    onShare();
  };

  return (
    <View style={styles.container}>
      {/* Chat Icon (formerly "Ask a Question") - Non-filled version */}
      <Pressable
        onPress={handleAskQuestion}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
        onPress={handleShare}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.iconButton}
      >
        <IconSymbol
          name="paperplane"
          size={24}
          color={colors.primary}
        />
      </Pressable>
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
