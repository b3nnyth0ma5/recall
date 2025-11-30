
import { Platform } from 'react-native';
import { Stack } from 'expo-router';

export default function HomeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'default',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: Platform.OS === 'ios', // Show header on iOS with NativeTabs, hide on Android/Web
          title: 'Home'
        }}
      />
      <Stack.Screen
        name="create-category"
        options={{
          headerShown: false,
          presentation: 'card',
        }}
      />
    </Stack>
  );
}
