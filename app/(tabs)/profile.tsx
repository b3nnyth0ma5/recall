
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleAbout = () => {
    Alert.alert(
      'About Recall',
      'Recall is a simple and intuitive app for capturing and organizing your memories with text and images.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Profile',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <IconSymbol name="person.circle.fill" size={80} color={colors.primary} />
          </View>
          <Text style={styles.email}>{user?.email || 'Not logged in'}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.menuSection}>
          <Pressable style={styles.menuItem} onPress={handleAbout}>
            <View style={styles.menuItemLeft}>
              <IconSymbol name="info.circle.fill" size={24} color={colors.primary} />
              <Text style={styles.menuItemText}>About</Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color={colors.textTertiary} />
          </Pressable>

          <Pressable style={styles.menuItem} onPress={handleLogout}>
            <View style={styles.menuItemLeft}>
              <IconSymbol name="arrow.right.square.fill" size={24} color={colors.error} />
              <Text style={[styles.menuItemText, styles.logoutText]}>Logout</Text>
            </View>
            <IconSymbol name="chevron.right" size={20} color={colors.textTertiary} />
          </Pressable>
        </Animated.View>

        <Text style={styles.version}>Version 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  email: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  menuSection: {
    marginTop: 24,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  logoutText: {
    color: colors.error,
  },
  version: {
    fontSize: 14,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 32,
  },
});
