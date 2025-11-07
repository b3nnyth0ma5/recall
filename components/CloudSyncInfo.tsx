
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

export function CloudSyncInfo() {
  return (
    <View style={styles.container}>
      <IconSymbol name="cloud.fill" size={20} color={colors.primary} />
      <Text style={styles.text}>Synced with Supabase</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
});
