
import { StyleSheet, ViewStyle, TextStyle, Platform } from 'react-native';

// Geist-like font family for different platforms
export const fontFamily = {
  regular: Platform.select({
    ios: 'System',
    android: 'Roboto',
    web: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    default: 'System',
  }),
  medium: Platform.select({
    ios: 'System',
    android: 'Roboto-Medium',
    web: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    default: 'System',
  }),
  semibold: Platform.select({
    ios: 'System',
    android: 'Roboto-Medium',
    web: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    default: 'System',
  }),
  bold: Platform.select({
    ios: 'System',
    android: 'Roboto-Bold',
    web: 'Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    default: 'System',
  }),
};

export const colors = {
  // Dark theme backgrounds (from UI design image)
  background: '#1A1A1A', // Very dark background
  backgroundSecondary: '#242424', // Slightly lighter dark
  
  // Card backgrounds
  card: '#2A2A2A', // Dark card background
  cardHover: '#333333', // Hover state
  cardDark: '#1F1F1F', // Darker card variant
  
  // Text colors
  text: '#FFFFFF', // White text on dark backgrounds
  textSecondary: '#B0B0B0', // Light gray text for secondary info
  textTertiary: '#808080', // Medium gray for tertiary info
  textOnLight: '#1A1A1A', // Dark text on light backgrounds
  
  // Primary/Accent colors (coral/pink from UI design)
  primary: '#FF6B7A', // Coral/pink accent color
  primaryDark: '#E55A68', // Darker coral
  primaryLight: '#FF8A96', // Lighter coral
  accent: '#FF6B7A', // Same as primary
  searchAccent: '#FF6B7A',
  
  // UI element colors
  border: '#3A3A3A', // Subtle border
  borderLight: '#4A4A4A', // Lighter border
  error: '#FF4444', // Error red
  success: '#4CAF50', // Success green
  overlay: 'rgba(0, 0, 0, 0.8)', // Dark overlay
  shadow: 'rgba(0, 0, 0, 0.5)', // Shadow
  highlight: 'rgba(255, 107, 122, 0.15)', // Highlight with primary color
  
  // Additional colors for various states
  inactive: '#666666', // Inactive elements
  divider: '#333333', // Dividers
  appleRed: '#FF3B30', // Apple red for delete actions
  borderColor: '#3A3A3A', // Border color for consistency
};

export const buttonStyles = StyleSheet.create({
  instructionsButton: {
    backgroundColor: colors.primary,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  backButton: {
    backgroundColor: colors.card,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
});

export const commonStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 800,
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    color: colors.text,
    marginBottom: 8,
    fontFamily: fontFamily.bold,
  },
  text: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 16,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
  },
  section: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    width: '100%',
    // Modern shadow for iOS
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    // Elevation for Android
    elevation: 6,
  },
  icon: {
    width: 60,
    height: 60,
    tintColor: colors.primary,
  },
});
