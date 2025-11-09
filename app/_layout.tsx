
import React, { useEffect } from 'react';
import { useColorScheme, StatusBar, Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '@/styles/commonStyles';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import 'react-native-reanimated';

// Import Geist font CSS for web
if (Platform.OS === 'web') {
  require('../app.css');
}

SplashScreen.preventAutoHideAsync();

// Note: Geist font is loaded via web fonts for web platform
// For native, we'll use system fonts as fallback

// Custom dark theme
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
    if (loading) return;

    const inAuthGroup = segments[0] === 'login';

    if (!session && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (session && inAuthGroup) {
      // Redirect to home if authenticated
      router.replace('/(tabs)/(home)');
    }
  }, [session, loading, segments]);

  return (
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
    </Stack>
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
