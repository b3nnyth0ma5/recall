import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Image, useColorScheme } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/styles/commonStyles';

export type PillItem = {
  id: string;
  label: string;
  iconUrl?: string | null;
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
        const countBadgeBg = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
        const countText = String(item.count);
        return (
          <Pressable
            key={item.id}
            onPress={() => handlePress(item.id)}
            style={[styles.pill, isActive && styles.pillActive]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            {item.iconUrl ? (
              <Image
                testID={`pill-icon-${item.id}`}
                source={{ uri: item.iconUrl }}
                style={styles.pillIcon}
                resizeMode="cover"
                accessibilityRole="image"
                role="image"
                alt={item.label}
              />
            ) : null}
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {item.label}
            </Text>
            {showCount ? (
              <View style={[styles.countBadge, { backgroundColor: countBadgeBg }]}>
                <Text style={styles.countBadgeText}>{countText}</Text>
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
    paddingVertical: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 3,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillIcon: {
    width: 18,
    height: 18,
    borderRadius: 4,
    marginRight: 2,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: '#FFFFFF',
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
    color: colors.textSecondary,
  },
});
