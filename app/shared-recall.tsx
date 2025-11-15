
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { SharedRecallData } from '@/utils/shareRecall';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export default function SharedRecallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [loadingMessage, setLoadingMessage] = useState('Opening shared recall...');

  const viewSharedRecall = useCallback((sharedData: SharedRecallData) => {
    console.log('Opening note editor with shared data');

    // Reorder images to put the primary image first
    const reorderedImages = [...sharedData.images];
    if (sharedData.primaryImageIndex > 0 && sharedData.primaryImageIndex < reorderedImages.length) {
      const primaryImage = reorderedImages.splice(sharedData.primaryImageIndex, 1)[0];
      reorderedImages.unshift(primaryImage);
    }

    // Navigate to note editor with pre-filled data
    // Using replace to dismiss this transition screen
    router.replace({
      pathname: '/note-editor',
      params: {
        sharedText: sharedData.text || '',
        sharedImages: JSON.stringify(reorderedImages),
        selectedLatitude: sharedData.latitude?.toString() || '',
        selectedLongitude: sharedData.longitude?.toString() || '',
        selectedLocationName: sharedData.location || '',
        selectedPrimaryType: sharedData.location_primary_type || '',
        isSharedRecall: 'true',
      },
    });
  }, [router]);

  const handleSharedRecall = useCallback(async () => {
    try {
      console.log('SharedRecallScreen params:', params);

      // Show loading message briefly
      setLoadingMessage('Opening shared recall...');
      
      // Get the data parameter
      const dataParam = params.data;
      
      if (!dataParam || typeof dataParam !== 'string') {
        console.error('No data parameter found');
        Alert.alert('Error', 'Invalid shared recall link');
        router.replace('/(tabs)/(home)');
        return;
      }

      // Parse the shared data
      const decodedData = decodeURIComponent(dataParam);
      const sharedData: SharedRecallData = JSON.parse(decodedData);

      console.log('Parsed shared recall data:', sharedData);

      // Update loading message
      setLoadingMessage('Loading recall data...');
      
      // Wait a brief moment to show the transition (800ms total)
      await new Promise(resolve => setTimeout(resolve, 800));

      // Navigate to note editor with pre-filled data
      viewSharedRecall(sharedData);
    } catch (error) {
      console.error('Error handling shared recall:', error);
      Alert.alert('Error', 'Failed to open shared recall');
      router.replace('/(tabs)/(home)');
    }
  }, [params, router, viewSharedRecall]);

  useEffect(() => {
    handleSharedRecall();
  }, [handleSharedRecall]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <Animated.View 
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(300)}
        style={styles.container}
      >
        <View style={styles.content}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
          <Text style={styles.subText}>Please wait...</Text>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
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
    marginTop: 4,
  },
});
