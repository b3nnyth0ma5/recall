
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { parseSharedRecallUrl, SharedRecallData } from '@/utils/shareRecall';
import * as Linking from 'expo-linking';

export default function SharedRecallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    handleSharedRecall();
  }, [params]);

  const handleSharedRecall = async () => {
    try {
      console.log('SharedRecallScreen params:', params);

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

      // Navigate to note editor with pre-filled data
      viewSharedRecall(sharedData);
    } catch (error) {
      console.error('Error handling shared recall:', error);
      Alert.alert('Error', 'Failed to open shared recall');
      router.replace('/(tabs)/(home)');
    } finally {
      setLoading(false);
    }
  };

  const viewSharedRecall = (sharedData: SharedRecallData) => {
    console.log('Opening note editor with shared data');

    // Reorder images to put the primary image first
    const reorderedImages = [...sharedData.images];
    if (sharedData.primaryImageIndex > 0 && sharedData.primaryImageIndex < reorderedImages.length) {
      const primaryImage = reorderedImages.splice(sharedData.primaryImageIndex, 1)[0];
      reorderedImages.unshift(primaryImage);
    }

    // Navigate to note editor with pre-filled data
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
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Opening shared recall...</Text>
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
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: colors.text,
    marginTop: 16,
  },
});
