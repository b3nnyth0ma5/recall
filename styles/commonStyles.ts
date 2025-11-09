
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
  // Warm peachy background (from UI design)
  background: '#E8B89A',
  backgroundSecondary: '#D4A88A',
  
  // Dark card backgrounds (from UI design)
  card: '#1F1F1F',
  cardHover: '#2A2A2A',
  cardDark: '#1A1A1A',
  
  // Text colors
  text: '#FFFFFF', // White text on dark backgrounds
  textSecondary: '#A0A0A0', // Gray text for secondary info
  textTertiary: '#808080', // Lighter gray for tertiary info
  textOnLight: '#1A1A1A', // Dark text on light backgrounds
  
  // Primary/Accent colors (orange/coral from UI)
  primary: '#FF6B35',
  primaryDark: '#E55A2B',
  primaryLight: '#FF8555',
  accent: '#FF6B35',
  searchAccent: '#FF6B35',
  
  // UI element colors
  border: '#2A2A2A',
  borderLight: '#3A3A3A',
  error: '#FF4444',
  success: '#4CAF50',
  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.3)',
  highlight: 'rgba(255, 107, 53, 0.15)',
  
  // Additional colors for various states
  inactive: '#666666',
  divider: '#333333',
};

export const buttonStyles = StyleSheet.create({
  instructionsButton: {
    backgroundColor: colors.primary,
    alignSelf: 'center',
    width: '100%',
  },
  backButton: {
    backgroundColor: colors.card,
    alignSelf: 'center',
    width: '100%',
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
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.text,
    marginBottom: 10,
    fontFamily: fontFamily.bold,
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
  },
  section: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginVertical: 8,
    width: '100%',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3)',
    elevation: 4,
  },
  icon: {
    width: 60,
    height: 60,
    tintColor: colors.primary,
  },
});
