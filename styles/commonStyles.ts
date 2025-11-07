
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';

export const colors = {
  // Light theme colors inspired by the design image
  background: '#E8DDD3', // Beige/cream background
  backgroundSecondary: '#F5EFE9',
  card: '#FFFFFF',
  cardHover: '#F8F4F0',
  text: '#2D2D2D', // Dark gray for text
  textSecondary: '#6B6B6B',
  textTertiary: '#9B9B9B',
  primary: '#E57368', // Coral/salmon accent
  primaryDark: '#D45F54',
  primaryLight: '#F08B82',
  accent: '#E57368',
  border: '#D4C4B8',
  borderLight: '#E0D5CA',
  error: '#D9534F',
  success: '#5CB85C',
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: 'rgba(0, 0, 0, 0.15)',
  // Additional colors for the design
  darkCard: '#3D3D3D', // Dark card background
  darkText: '#FFFFFF', // Text on dark backgrounds
  meshPattern: '#8B8B8B', // For mesh/pattern elements
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
    marginBottom: 10
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 24,
    textAlign: 'center',
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
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    width: '100%',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.3)',
    elevation: 2,
  },
  icon: {
    width: 60,
    height: 60,
    tintColor: colors.primary,
  },
});
