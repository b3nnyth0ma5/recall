
import React, { useEffect } from 'react';
import { useColorScheme, StatusBar, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { colors } from '@/styles/commonStyles';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { isSharedRecallUrl } from '@/utils/shareRecall';
import { toastConfig } from '@/components/CustomToast';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Prevent Reanimated errors on web - must be before any other imports
if (Platform.OS === 'web') {
  // Suppress Reanimated warnings on web
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Reanimated') || 
       args[0].includes('worklet') ||
       args[0].includes('uninitialized'))
    ) {
      return;
    }
    originalWarn(...args);
  };
  
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Reanimated') || 
       args[0].includes('worklet') ||
       args[0].includes('uninitialized') ||
       args[0].includes('Cannot access'))
    ) {
      return;
    }
    originalError(...args);
  };
}

// Import CSS and disable service workers for web - after console overrides
if (Platform.OS === 'web') {
  // Dynamically import CSS
  import('../app.css').catch(err => {
    console.log('CSS import skipped or failed');
  });
  
  // Dynamically import and execute service worker cleanup utility
  import('../utils/webServiceWorkerCleanup').catch(err => {
    console.log('Service worker cleanup skipped or failed');
  });
}

SplashScreen.preventAutoHideAsync().catch(() => {
  console.log('Splash screen auto hide prevention skipped');
});

const CustomDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.primary,
  },
};

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }

    try {
      const inAuthGroup = segments[0] === 'login';

      if (!session && !inAuthGroup) {
        router.replace('/login');
      } else if (session && inAuthGroup) {
        router.replace('/(tabs)/(home)');
      }
    } catch (error) {
      console.log('Navigation error:', error);
    }
  }, [session, loading, segments, router]);

  // Handle deep links for shared recalls
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      try {
        console.log('Deep link received:', event.url);
        
        if (isSharedRecallUrl(event.url)) {
          console.log('Shared recall deep link detected');
          const parsed = Linking.parse(event.url);
          
          if (parsed.queryParams?.data) {
            router.push({
              pathname: '/shared-recall',
              params: { data: parsed.queryParams.data as string },
            });
          }
        }
      } catch (error) {
        console.log('Error handling deep link:', error);
      }
    };

    // Handle initial URL (app opened from link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL:', url);
        handleDeepLink({ url });
      }
    }).catch(() => {
      console.log('Error getting initial URL');
    });

    // Handle URL changes (app already open)
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, [router]);

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="note-editor"
          options={{
            presentation: 'card',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="search"
          options={{
            presentation: 'card',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="location-search"
          options={{
            presentation: 'card',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="shared-recall"
          options={{
            presentation: 'card',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="share-intent"
          options={{
            presentation: 'card',
            headerShown: false,
          }}
        />
      </Stack>
      <Toast config={toastConfig} />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {
        console.log('Failed to hide splash screen');
      });
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <ThemeProvider value={CustomDarkTheme}>
            <StatusBar barStyle="light-content" backgroundColor={colors.background} />
            <RootLayoutNav />
          </ThemeProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
