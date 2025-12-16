
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { colors } from '@/styles/commonStyles';

interface PersonAvatarProps {
  personName: string;
  photoUrl?: string | null;
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
    '#FFAFAF',
    '#9E9093',
    '#FFD0D0',
    '#D4C7C8',
    '#FF8D92',
    '#FFF2F2',
    '#E86B77',
    '#FEC8C8',
    '#C7B7B9',
    '#9F9194',
    '#EFE8E8',
  ];
  
  // Simple hash function to get consistent color for same name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export function PersonAvatar({ personName, photoUrl, size = 40, style }: PersonAvatarProps) {
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
          backgroundColor: photoUrl ? 'transparent' : backgroundColor,
        },
        style
      ]}
    >
      {photoUrl ? (
        <Image 
          source={{ uri: photoUrl }} 
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
          }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.initials, { fontSize }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    boxShadow: '0px 3px 8px rgba(0, 0, 0, 0.3)',
    elevation: 8,
    overflow: 'hidden',
  },
  initials: {
    color: '#4E4749',
    fontWeight: '700',
    textAlign: 'center',
  },
});
