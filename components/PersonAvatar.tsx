
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';

interface PersonAvatarProps {
  personName: string;
  size?: number;
  style?: any;
}

// Helper function to get initials from a person's name
const getInitials = (name: string): string => {
  if (!name || name.trim() === '') {
    return '?';
  }

  const nameParts = name.trim().split(/\s+/);
  
  if (nameParts.length === 1) {
    // Single name - use first letter
    return nameParts[0].charAt(0).toUpperCase();
  }
  
  // Multiple names - use first letter of first name and first letter of last name
  const firstInitial = nameParts[0].charAt(0).toUpperCase();
  const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
  
  return `${firstInitial}${lastInitial}`;
};

// Generate a consistent color based on the name
const getAvatarColor = (name: string): string => {
  const colors = [
    '#FF6B7A', // Primary coral
    '#4A90E2', // Blue
    '#50C878', // Emerald
    '#FFA726', // Orange
    '#9C27B0', // Purple
    '#26A69A', // Teal
    '#EF5350', // Red
    '#66BB6A', // Green
  ];
  
  // Simple hash function to get consistent color for same name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export function PersonAvatar({ personName, size = 40, style }: PersonAvatarProps) {
  const initials = getInitials(personName);
  const backgroundColor = getAvatarColor(personName);
  const fontSize = size * 0.4; // Font size is 40% of avatar size

  return (
    <View 
      style={[
        styles.avatar, 
        { 
          width: size, 
          height: size, 
          borderRadius: size / 2,
          backgroundColor,
        },
        style
      ]}
    >
      <Text style={[styles.initials, { fontSize }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.25,
    borderColor: '#FFFFFF',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.2)',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
});
