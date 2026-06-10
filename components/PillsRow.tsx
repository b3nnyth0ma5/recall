import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/styles/commonStyles';

type PillsRowProps = {
  items: string[];
  selected: string | null;
  onSelect: (label: string | null) => void;
  testID?: string;
};

export function PillsRow({ items, selected, onSelect, testID }: PillsRowProps) {
  const handlePress = (label: string) => {
    console.log('[PillsRow] Pill pressed:', label, '| currently selected:', selected);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSelect(label);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
      testID={testID}
    >
      {items.map((label) => {
        const isActive = selected === label;
        return (
          <Pressable
            key={label}
            onPress={() => handlePress(label)}
            style={[styles.pill, isActive && styles.pillActive]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 2,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
});
