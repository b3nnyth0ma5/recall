
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { WidgetProvider } from '@/contexts/WidgetContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { handleShareIntent } from '@/utils/shareIntentHandler';

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [pendingShareData, setPendingShareData] = useState<{text?: string; images?: string[]} | null>(null);

  // Handle deep links and share intents
  useEffect(() => {
    const handleInitialURL = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        console.log('Initial URL:', initialUrl);
        
        if (initialUrl) {
          const shareData = await handleShareIntent(initialUrl);
          if (shareData) {
            console.log('Share intent detected on app launch:', shareData);
            
            // Store the share data to be used after authentication
            setPendingShareData(shareData);
          }
        }
      } catch (error) {
        console.error('Error handling initial URL:', error);
      }
    };

    // Only handle initial URL after loading is complete
    if (!loading) {
      handleInitialURL();
    }

    // Listen for URL changes while app is running
    const subscription = Linking.addEventListener('url', async (event) => {
      console.log('URL event received:', event.url);
      
      const shareData = await handleShareIntent(event.url);
      if (shareData) {
        console.log('Share intent detected:', shareData);
        
        // Check if user is authenticated
        if (!user) {
          console.log('User not authenticated, storing share data for later');
          setPendingShareData(shareData);
          return;
        }
        
        // Navigate to share-intent screen with the data
        router.push({
          pathname: '/share-intent',
          params: {
            text: shareData.text || '',
            images: shareData.images ? JSON.stringify(shareData.images) : '[]',
          },
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router, user, loading]);

  // Handle pending share data after user authentication
  useEffect(() => {
    if (user && pendingShareData && !loading) {
      console.log('User authenticated, processing pending share data:', pendingShareData);
      
      // Navigate to share-intent screen with the pending data
      setTimeout(() => {
        router.push({
          pathname: '/share-intent',
          params: {
            text: pendingShareData.text || '',
            images: pendingShareData.images ? JSON.stringify(pendingShareData.images) : '[]',
          },
        });
        
        // Clear pending share data
        setPendingShareData(null);
      }, 500);
    }
  }, [user, pendingShareData, loading, router]);

  // Handle authentication routing
  useEffect(() => {
    if (loading) {
      return;
    }

    const inAuthGroup = segments[0] === 'login';

    if (!user && !inAuthGroup) {
      // User not authenticated, redirect to login
      // But don't clear pending share data - it will be processed after login
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // User authenticated and on login screen, redirect to home
      router.replace('/(tabs)/(home)');
    }
  }, [user, segments, loading, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="note-editor" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="location-search" options={{ headerShown: false }} />
      <Stack.Screen name="map-view" options={{ headerShown: false }} />
      <Stack.Screen name="share-intent" options={{ headerShown: false }} />
      <Stack.Screen name="shared-recall" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="formsheet"
        options={{
          presentation: 'formSheet',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="transparent-modal"
        options={{
          presentation: 'transparentModal',
          headerShown: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <AuthProvider>
        <WidgetProvider>
          <RootLayoutNav />
        </WidgetProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
