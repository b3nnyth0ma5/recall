import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '@/styles/commonStyles';

interface RecallHeaderProps {
  style?: ViewStyle;
}

export default function RecallHeader({ style }: RecallHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Image
        source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
        style={styles.icon}
        contentFit="contain"
      />
      <Text style={styles.title}>Recall</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
});
