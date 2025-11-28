
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, Text } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';

export default function ShareIntentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasNavigated, setHasNavigated] = useState(false);

  useEffect(() => {
    console.log('[ShareIntentScreen] Mounted with params:', params);
    console.log('[ShareIntentScreen] User:', user ? 'authenticated' : 'not authenticated');
    
    // Prevent multiple navigations
    if (hasNavigated) {
      console.log('[ShareIntentScreen] Already navigated, skipping');
      return;
    }

    // Check if user is authenticated
    if (!user) {
      console.log('[ShareIntentScreen] User not authenticated, redirecting to login');
      setHasNavigated(true);
      router.replace('/login');
      return;
    }

    // Parse shared content from params
    const text = typeof params.text === 'string' ? params.text : '';
    const imagesParam = params.images;
    
    let images: string[] = [];
    if (typeof imagesParam === 'string') {
      try {
        images = JSON.parse(imagesParam);
      } catch (error) {
        console.error('[ShareIntentScreen] Error parsing images:', error);
        // If it's a single image URL
        if (imagesParam.startsWith('http') || imagesParam.startsWith('file://') || imagesParam.startsWith('content://')) {
          images = [imagesParam];
        }
      }
    } else if (Array.isArray(imagesParam)) {
      images = imagesParam;
    }

    console.log('[ShareIntentScreen] Parsed shared content:', { text, images });

    setLoading(false);

    // Navigate to note editor with pre-populated content
    if (text || images.length > 0) {
      console.log('[ShareIntentScreen] Navigating to note editor with shared content');
      
      // Mark as navigated to prevent duplicate navigation
      setHasNavigated(true);
      
      // Small delay to ensure smooth transition
      setTimeout(() => {
        router.replace({
          pathname: '/note-editor',
          params: {
            sharedText: text,
            sharedImages: images.length > 0 ? JSON.stringify(images) : undefined,
            fromShare: 'true',
          },
        });
      }, 300);
    } else {
      console.log('[ShareIntentScreen] No shared content found, redirecting to home');
      setHasNavigated(true);
      router.replace('/(tabs)/(home)');
    }
  }, [params, router, user, hasNavigated]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading shared content...</Text>
        <Text style={styles.subText}>Preparing your recall</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  subText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
