
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { WidgetProvider } from '@/contexts/WidgetContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { handleShareIntent } from '@/utils/shareIntentHandler';
import { supabase } from '@/utils/supabase';

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [pendingShareData, setPendingShareData] = useState<{text?: string; images?: string[]} | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Check if user needs onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user?.id || loading) {
        setCheckingOnboarding(false);
        return;
      }

      try {
        console.log('[Onboarding Check] Checking onboarding status for user:', user.id);
        
        // Check if user_journeys record exists and has main_onboarding_date
        const { data: journey, error } = await supabase
          .from('user_journeys')
          .select('main_onboarding_date')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('[Onboarding Check] Error fetching user journey:', error);
          setNeedsOnboarding(false);
          setCheckingOnboarding(false);
          return;
        }

        // If no record exists or main_onboarding_date is NULL, show onboarding
        const shouldShowOnboarding = !journey || journey.main_onboarding_date === null;
        console.log('[Onboarding Check] Journey data:', journey);
        console.log('[Onboarding Check] Should show onboarding:', shouldShowOnboarding);
        setNeedsOnboarding(shouldShowOnboarding);
        setCheckingOnboarding(false);
      } catch (error) {
        console.error('[Onboarding Check] Exception checking onboarding status:', error);
        setNeedsOnboarding(false);
        setCheckingOnboarding(false);
      }
    };

    checkOnboardingStatus();
  }, [user?.id, loading]);

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

  // Handle authentication and onboarding routing
  useEffect(() => {
    if (loading || checkingOnboarding) {
      console.log('[Routing] Waiting for loading/checking to complete...', { loading, checkingOnboarding });
      return;
    }

    const inAuthGroup = segments[0] === 'login';
    const inOnboardingGroup = segments[0] === 'onboarding';
    const inTabsGroup = segments[0] === '(tabs)';

    console.log('[Routing] Current state:', { 
      user: !!user, 
      inAuthGroup, 
      inOnboardingGroup, 
      inTabsGroup,
      needsOnboarding,
      segments 
    });

    if (!user && !inAuthGroup) {
      // User not authenticated, redirect to login
      console.log('[Routing] Redirecting to login (no user)');
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // User authenticated and on login screen
      // Check if they need onboarding
      if (needsOnboarding) {
        console.log('[Routing] Redirecting to onboarding (from login)');
        router.replace('/onboarding');
      } else {
        console.log('[Routing] Redirecting to home (from login)');
        router.replace('/(tabs)/(home)');
      }
    } else if (user && !inOnboardingGroup && !inTabsGroup && needsOnboarding) {
      // User authenticated but needs onboarding and not on onboarding or tabs screen
      console.log('[Routing] Redirecting to onboarding (needs onboarding)');
      router.replace('/onboarding');
    } else if (user && inOnboardingGroup && needsOnboarding === false) {
      // User authenticated, on onboarding screen, but doesn't need it anymore
      console.log('[Routing] Redirecting to home (onboarding complete)');
      router.replace('/(tabs)/(home)');
    }
  }, [user, segments, loading, checkingOnboarding, needsOnboarding, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
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
