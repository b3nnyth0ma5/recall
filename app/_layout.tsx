
import React, { useEffect } from 'react';
import { useColorScheme, StatusBar, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import Toast from 'react-native-toast-message';
import { toastConfig } from '@/components/CustomToast';
import { colors } from '@/styles/commonStyles';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { isSharedRecallUrl } from '@/utils/shareRecall';
import 'react-native-reanimated';

// Import CSS for web using dynamic import
if (Platform.OS === 'web') {
  import('../app.css');
}

SplashScreen.preventAutoHideAsync();

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

    const inAuthGroup = segments[0] === 'login';

    if (!session && !inAuthGroup) {
      router.replace('/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/(home)');
    }
  }, [session, loading, segments, router]);

  // Handle deep links for shared recalls
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
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
    };

    // Handle initial URL (app opened from link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL:', url);
        handleDeepLink({ url });
      }
    });

    // Handle URL changes (app already open)
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, [router]);

  // Handle share intents (Android/iOS)
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const handleShareIntent = async () => {
      try {
        // For Android, we need to check if the app was opened with a share intent
        // This is handled through the intent filters in app.json
        // The shared content will be available through Linking
        
        const initialUrl = await Linking.getInitialURL();
        console.log('Initial URL for share intent:', initialUrl);

        // Check if this is a share intent
        if (initialUrl && initialUrl.includes('share-intent')) {
          console.log('Share intent detected');
          // The share-intent route will handle the shared content
        }
      } catch (error) {
        console.error('Error handling share intent:', error);
      }
    };

    handleShareIntent();
  }, []);

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
            presentation: 'transparentModal',
            headerShown: false,
            animation: 'fade',
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
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ThemeProvider value={CustomDarkTheme}>
          <StatusBar barStyle="light-content" backgroundColor={colors.background} />
          <RootLayoutNav />
        </ThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
