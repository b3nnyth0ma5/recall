
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { PersonAvatar } from './PersonAvatar';
import { colors } from '@/styles/commonStyles';

interface PersonAvatarWithTooltipProps {
  personName: string;
  size?: number;
  style?: any;
}

export function PersonAvatarWithTooltip({ 
  personName, 
  size = 40, 
  style 
}: PersonAvatarWithTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setShowTooltip(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <PersonAvatar personName={personName} size={size} style={style} />
      </Pressable>

      <Modal
        visible={showTooltip}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTooltip(false)}
      >
        <Pressable 
          style={styles.tooltipOverlay}
          onPress={() => setShowTooltip(false)}
        >
          <View style={styles.tooltipContainer}>
            <View style={styles.tooltipContent}>
              <Text style={styles.tooltipText}>{personName}</Text>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tooltipContainer: {
    maxWidth: '80%',
  },
  tooltipContent: {
    backgroundColor: colors.card,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3)',
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tooltipText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
});
