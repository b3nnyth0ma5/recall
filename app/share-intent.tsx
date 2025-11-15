
import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Platform, Alert } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { CreateRecallFromShare } from '@/components/CreateRecallFromShare';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, uploadImageToDatabase, triggerOCRProcessing, triggerCategoryMatching } from '@/utils/supabase';
import * as Location from 'expo-location';
import Toast from 'react-native-toast-message';

export default function ShareIntentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [sharedText, setSharedText] = useState<string>('');
  const [sharedImages, setSharedImages] = useState<string[]>([]);

  useEffect(() => {
    console.log('ShareIntentScreen params:', params);
    
    // Parse shared content from params
    const text = typeof params.text === 'string' ? params.text : '';
    const imagesParam = params.images;
    
    let images: string[] = [];
    if (typeof imagesParam === 'string') {
      try {
        images = JSON.parse(imagesParam);
      } catch (error) {
        console.error('Error parsing images:', error);
        // If it's a single image URL
        if (imagesParam.startsWith('http') || imagesParam.startsWith('file://')) {
          images = [imagesParam];
        }
      }
    } else if (Array.isArray(imagesParam)) {
      images = imagesParam;
    }

    console.log('Parsed shared content:', { text, images });

    setSharedText(text);
    setSharedImages(images);
    setVisible(true);
  }, [params]);

  const handleSave = useCallback(async (text: string, images: string[]) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to save recalls');
      return;
    }

    try {
      console.log('Saving recall from shared content...');

      // Get current location
      let latitude: number | undefined;
      let longitude: number | undefined;
      let location: string | undefined;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const currentLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          latitude = currentLocation.coords.latitude;
          longitude = currentLocation.coords.longitude;

          // Reverse geocode to get location name
          const geocode = await Location.reverseGeocodeAsync({
            latitude,
            longitude,
          });

          if (geocode.length > 0) {
            const place = geocode[0];
            location = [place.city, place.region, place.country]
              .filter(Boolean)
              .join(', ');
          }
        }
      } catch (locationError) {
        console.log('Could not get location:', locationError);
        // Continue without location
      }

      // Create the recall in the database
      const { data: recallData, error: recallError } = await supabase
        .from('recollections')
        .insert({
          text: text.trim(),
          user_id: user.id,
          latitude,
          longitude,
          location,
        })
        .select()
        .single();

      if (recallError) {
        throw recallError;
      }

      console.log('Recall created:', recallData.id);

      // Upload images if any
      const uploadedImageIds: string[] = [];
      for (const imageUri of images) {
        try {
          console.log('Uploading image:', imageUri);
          const imageId = await uploadImageToDatabase(
            imageUri,
            recallData.id,
            'image/jpeg'
          );
          uploadedImageIds.push(imageId);
          console.log('Image uploaded:', imageId);

          // Trigger OCR processing
          try {
            await triggerOCRProcessing(imageId);
          } catch (ocrError) {
            console.log('OCR processing failed:', ocrError);
          }
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
        }
      }

      // Trigger category matching
      try {
        await triggerCategoryMatching(recallData.id);
      } catch (categoryError) {
        console.log('Category matching failed:', categoryError);
      }

      console.log('Recall saved successfully');

      // Close the panel
      setVisible(false);

      // Show success toast with navigation option
      Toast.show({
        type: 'success',
        text1: 'Recall Saved',
        text2: 'Tap to view your new recall',
        visibilityTime: 4000,
        position: 'bottom',
        bottomOffset: 100,
        onPress: () => {
          Toast.hide();
          router.push({
            pathname: '/note-editor',
            params: { id: recallData.id },
          });
        },
      });

      // Navigate back to home after a short delay
      setTimeout(() => {
        router.replace('/(tabs)/(home)');
      }, 500);
    } catch (error) {
      console.error('Error saving recall:', error);
      Alert.alert('Error', 'Failed to save recall. Please try again.');
    }
  }, [user, router]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      router.replace('/(tabs)/(home)');
    }, 300);
  }, [router]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <View style={styles.container}>
        <CreateRecallFromShare
          visible={visible}
          sharedText={sharedText}
          sharedImages={sharedImages}
          onSave={handleSave}
          onClose={handleClose}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
