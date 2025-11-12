
import React, { useState } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface CategoryIconProps {
  iconUrl: string | null;
  size?: number;
  style?: any;
}

/**
 * Component to display a category icon from Cloudflare CDN
 * 
 * @param iconUrl - The CDN URL of the icon
 * @param size - The size of the icon (default: 48)
 * @param style - Additional styles to apply
 */
export function CategoryIcon({ iconUrl, size = 48, style }: CategoryIconProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!iconUrl || error) {
    // Return a placeholder if no icon URL is provided or if loading failed
    return (
      <View style={[styles.placeholder, { width: size, height: size }, style]}>
        <IconSymbol 
          name="folder.fill" 
          size={size * 0.6} 
          color={colors.primary} 
        />
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size }, style]}>
      {loading && (
        <View style={[styles.loadingContainer, { width: size, height: size }]}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
      <Image
        source={{ uri: iconUrl }}
        style={[styles.icon, { width: size, height: size }]}
        onLoad={() => setLoading(false)}
        onError={() => {
          console.log('Failed to load category icon:', iconUrl);
          setLoading(false);
          setError(true);
        }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    borderRadius: 8,
  },
  loadingContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
  },
  placeholder: {
    backgroundColor: colors.card,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
