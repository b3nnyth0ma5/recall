import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, useColorScheme } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/styles/commonStyles';

export type PillItem = {
  id: string;
  label: string;
  count?: number;
};

type PillsRowProps = {
  items: PillItem[];
  /** Currently selected pill id */
  selected?: string | null;
  /** Alias for selected — accepted for backwards compat */
  selectedId?: string | null;
  onSelect: (id: string | null) => void;
  testID?: string;
};

export function PillsRow({ items, selected, selectedId, onSelect, testID }: PillsRowProps) {
  const activeId = selected !== undefined ? selected : selectedId;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handlePress = (id: string) => {
    console.log('[PillsRow] Pill pressed:', id, '| currently selected:', activeId);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSelect(id);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
      testID={testID}
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        const showCount = item.count !== undefined && item.count > 0;
        const countBadgeBg = isActive
          ? colors.primary
          : isDark
            ? 'rgba(255,255,255,0.15)'
            : 'rgba(0,0,0,0.10)';
        const countTextColor = isActive ? '#FFFFFF' : colors.textSecondary;
        const countText = String(item.count);
        return (
          <Pressable
            key={item.id}
            onPress={() => handlePress(item.id)}
            style={[styles.pill, isActive && styles.pillActive]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {item.label}
            </Text>
            {showCount ? (
              <View style={[styles.countBadge, { backgroundColor: countBadgeBg }]}>
                <Text style={[styles.countBadgeText, { color: countTextColor }]}>{countText}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default PillsRow;

const styles = StyleSheet.create({
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    paddingVertical: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  pillActive: {
    backgroundColor: '#FF6B7A1A',
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  pillTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  countBadge: {
    minWidth: 18,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
  },
});
