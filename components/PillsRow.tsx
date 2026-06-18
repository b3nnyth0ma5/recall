import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors } from '@/styles/commonStyles';

export type PillItem = {
  id: string;
  label: string;
  iconUrl?: string | null;
};

type PillsRowProps = {
  items: PillItem[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  testID?: string;
};

export function PillsRow({ items, selected, onSelect, testID }: PillsRowProps) {
  const handlePress = (id: string) => {
    console.log('[PillsRow] Pill pressed:', id, '| currently selected:', selected);
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
        const isActive = selected === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => handlePress(item.id)}
            style={[styles.pill, isActive && styles.pillActive]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            {item.iconUrl ? (
              <Image
                source={{ uri: item.iconUrl }}
                style={styles.pillIcon}
                resizeMode="cover"
              />
            ) : null}
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {item.label}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
