
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
 * Instagram-style utility bar with action icons positioned below image carousel
 * and above text content. Provides quick access to common recall actions.
 * 
 * Features:
 * - Left-aligned icons for consistent UX
 * - Platform-agnostic icons (iOS SF Symbols + Android Material Icons)
 * - Good touch target areas with hitSlop
 * - Haptic feedback on interactions
 */
export const RecallUtilityBar: React.FC<RecallUtilityBarProps> = ({
  onAskQuestion,
  onShare,
}) => {
  const handleAskQuestion = async () => {
    console.log('Ask a Question icon pressed');
    
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
    console.log('Share icon pressed');
    
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
      {/* Ask a Question Icon */}
      <Pressable
        onPress={handleAskQuestion}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.iconButton}
      >
        <IconSymbol
          ios_icon_name="questionmark.circle"
          android_material_icon_name="help"
          size={24}
          color={colors.text}
        />
      </Pressable>

      {/* Share Icon */}
      <Pressable
        onPress={handleShare}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.iconButton}
      >
        <IconSymbol
          ios_icon_name="square.and.arrow.up"
          android_material_icon_name="share"
          size={24}
          color={colors.text}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 16,
  },
  iconButton: {
    padding: 4,
  },
});
