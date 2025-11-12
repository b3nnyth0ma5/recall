
import React, { useState } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';

interface CategoryIconProps {
  iconUrl: string | null;
  size?: number;
  style?: any;
}

/**
 * Component to display a category icon from Cloudflare CDN
 * 
 * @param iconUrl - The CDN URL of the icon
 * @param size - The size of the icon (default: 40)
 * @param style - Additional styles to apply
 */
export function CategoryIcon({ iconUrl, size = 40, style }: CategoryIconProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!iconUrl) {
    // Return a placeholder if no icon URL is provided
    return (
      <View style={[styles.placeholder, { width: size, height: size }, style]}>
        <View style={styles.placeholderInner} />
      </View>
    );
  }

  if (error) {
    // Return a placeholder if the icon failed to load
    return (
      <View style={[styles.placeholder, { width: size, height: size }, style]}>
        <View style={styles.placeholderInner} />
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
  placeholderInner: {
    width: '50%',
    height: '50%',
    backgroundColor: colors.primary,
    opacity: 0.3,
    borderRadius: 4,
  },
});
