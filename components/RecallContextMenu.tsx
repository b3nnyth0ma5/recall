
import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Platform } from 'react-native';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';

interface RecallContextMenuProps {
  visible: boolean;
  onClose: () => void;
  recallId: string | null;
  position: { x: number; y: number };
}

export function RecallContextMenu({ visible, onClose, recallId, position }: RecallContextMenuProps) {
  if (!visible || !recallId) {
    return null;
  }

  const handleSharePress = () => {
    console.log('User tapped Share Recall for:', recallId);
    
    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    // TODO: Implement share functionality
    onClose();
  };

  const handleAskQuestionPress = () => {
    console.log('User tapped Ask a Question for:', recallId);
    
    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    // TODO: Implement ask question functionality
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable 
        style={styles.overlay} 
        onPress={onClose}
        activeOpacity={1}
      >
        <View 
          style={[
            styles.menuContainer,
            { top: position.y, left: position.x }
          ]}
        >
          <Pressable 
            style={styles.menuOption}
            onPress={handleSharePress}
            android_ripple={{ color: colors.borderLight }}
          >
            <View style={styles.iconContainer}>
              <IconSymbol 
                ios_icon_name="square.and.arrow.up" 
                android_material_icon_name="share" 
                size={24} 
                color={colors.text} 
              />
            </View>
            <Text style={styles.menuOptionText}>Share Recall</Text>
          </Pressable>
          
          <View style={styles.divider} />
          
          <Pressable 
            style={styles.menuOption}
            onPress={handleAskQuestionPress}
            android_ripple={{ color: colors.borderLight }}
          >
            <View style={styles.iconContainer}>
              <IconSymbol 
                ios_icon_name="questionmark.circle" 
                android_material_icon_name="help" 
                size={24} 
                color={colors.text} 
              />
            </View>
            <Text style={styles.menuOptionText}>Ask a Question</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    position: 'absolute',
    backgroundColor: colors.card,
    borderRadius: 16,
    minWidth: 200,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: `${colors.primary}20`,
    borderRadius: 8,
  },
  menuOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
});
