
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { IconSymbol } from '@/components/IconSymbol';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors } from '@/styles/commonStyles';
import { generateCategoryIcons, getCategoriesWithIcons } from '@/utils/generateCategoryIcons';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [isGeneratingIcons, setIsGeneratingIcons] = useState(false);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleGenerateIcons = async () => {
    Alert.alert(
      'Generate Category Icons',
      'This will create and upload SVG icons for all categories to Cloudflare CDN. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Generate',
          onPress: async () => {
            setIsGeneratingIcons(true);
            try {
              const result = await generateCategoryIcons();
              
              if (result.success && result.summary) {
                Alert.alert(
                  'Success',
                  `Icons generated successfully!\n\nTotal: ${result.summary.total}\nSuccess: ${result.summary.success}\nSkipped: ${result.summary.skipped}\nErrors: ${result.summary.errors}`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  'Error',
                  result.error || 'Failed to generate icons',
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              console.error('Error generating icons:', error);
              Alert.alert(
                'Error',
                'An unexpected error occurred',
                [{ text: 'OK' }]
              );
            } finally {
              setIsGeneratingIcons(false);
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Profile',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.container}>
        <Animated.View entering={FadeIn} style={styles.content}>
          {/* User Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email || 'Not available'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>User ID</Text>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
                {user?.id || 'Not available'}
              </Text>
            </View>
          </View>

          {/* Admin Section */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
            <Text style={styles.sectionTitle}>Admin Tools</Text>
            <Pressable
              style={[styles.button, isGeneratingIcons && styles.buttonDisabled]}
              onPress={handleGenerateIcons}
              disabled={isGeneratingIcons}
            >
              {isGeneratingIcons ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Generate Category Icons</Text>
              )}
            </Pressable>
          </Animated.View>

          {/* Actions Section */}
          <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <Pressable
              style={[styles.button, styles.dangerButton]}
              onPress={handleSignOut}
            >
              <Text style={styles.buttonText}>Sign Out</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: colors.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
});
