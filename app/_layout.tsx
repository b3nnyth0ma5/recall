
import { useEffect, useState, memo, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { WidgetProvider } from '@/contexts/WidgetContext';
import { NotesProvider } from '@/contexts/NotesContext';
import { PeopleGraphProvider, usePeopleGraph } from '@/contexts/PeopleGraphContext';
import { PeopleGraph } from '@/components/PeopleGraph';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Platform } from 'react-native';
import { supabase } from '@/utils/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasPendingShareData } from '@/utils/nativeShareReceiver';

const PeopleGraphOverlay = memo(() => {
  const { showGraph, people, anchorPosition, closeGraph } = usePeopleGraph();

  console.log('[PeopleGraphOverlay] Render state:', { 
    showGraph, 
    peopleCount: people.length, 
    anchorPosition 
  });

  if (!showGraph) {
    return null;
  }

  console.log('[PeopleGraphOverlay] Rendering PeopleGraph with', people.length, 'people');

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      <PeopleGraph
        people={people}
        onClose={closeGraph}
        anchorPosition={anchorPosition}
      />
    </View>
  );
});

PeopleGraphOverlay.displayName = 'PeopleGraphOverlay';

// iOS Status Bar Background Component
const IOSStatusBarBackground = memo(() => {
  const insets = useSafeAreaInsets();
  
  // Only show on iOS
  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <View 
      style={[
        styles.iosStatusBarBackground, 
        { height: insets.top }
      ]} 
    />
  );
});

IOSStatusBarBackground.displayName = 'IOSStatusBarBackground';

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  
  // Use refs to track navigation state and prevent infinite loops
  const hasInitializedRef = useRef(false);
  const lastRouteRef = useRef<string>('');

  // Check for pending share data on app launch
  useEffect(() => {
    const checkForShareData = async () => {
      try {
        console.log('[App Layout] Checking for pending share data...');
        const hasPending = await hasPendingShareData();
        
        if (hasPending && user) {
          console.log('[App Layout] Found pending share data, navigating to create-recall-from-share');
          router.replace('/create-recall-from-share');
        }
      } catch (error) {
        console.error('[App Layout] Error checking for share data:', error);
      }
    };

    if (!loading && user) {
      checkForShareData();
    }
  }, [loading, user, router]);

  // Check if user needs onboarding
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!user?.id) {
        console.log('[Onboarding Check] No user, skipping check');
        setNeedsOnboarding(null);
        setCheckingOnboarding(false);
        return;
      }

      if (loading) {
        console.log('[Onboarding Check] Still loading, waiting...');
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

  // Handle authentication and onboarding routing - FIXED to prevent infinite loops
  useEffect(() => {
    // Don't do anything while loading or checking onboarding
    if (loading || checkingOnboarding) {
      console.log('[Routing] Waiting for loading/checking to complete...', { loading, checkingOnboarding });
      return;
    }

    // Extract current segment for easier comparison
    const currentSegment = segments[0];
    
    const inAuthGroup = currentSegment === 'login';
    const inOnboardingGroup = currentSegment === 'onboarding';
    const inTabsGroup = currentSegment === '(tabs)';
    const inNoteEditor = currentSegment === 'note-editor';
    const inModalScreens = currentSegment === 'modal' || currentSegment === 'formsheet' || currentSegment === 'transparent-modal';
    const inPasswordResetScreens = currentSegment === 'reset-password' || currentSegment === 'update-password';
    const inEmailConfirmedScreen = currentSegment === 'email-confirmed';
    const inShareScreen = currentSegment === 'create-recall-from-share';
    const inOtherScreens = currentSegment === 'search' || currentSegment === 'shared-recall' || currentSegment === 'person-recalls' || currentSegment === 'people-word-cloud';

    console.log('[Routing] Current state:', { 
      user: !!user, 
      inAuthGroup, 
      inOnboardingGroup, 
      inTabsGroup,
      inNoteEditor,
      inModalScreens,
      inPasswordResetScreens,
      inEmailConfirmedScreen,
      inShareScreen,
      inOtherScreens,
      needsOnboarding,
      currentSegment,
      hasInitialized: hasInitializedRef.current,
      lastRoute: lastRouteRef.current
    });

    // Don't redirect if user is on special screens (they can navigate freely)
    // This is critical for password reset flow and share intent to work properly
    if (inNoteEditor || inModalScreens || inPasswordResetScreens || inEmailConfirmedScreen || inShareScreen || inOtherScreens) {
      console.log('[Routing] User on special screen, not redirecting');
      return;
    }

    // Determine target route
    let targetRoute: string | null = null;

    if (!user) {
      // User not authenticated
      if (!inAuthGroup) {
        targetRoute = '/login';
        console.log('[Routing] Need to redirect to login (no user)');
      }
    } else {
      // User is authenticated
      if (inAuthGroup) {
        // On login screen but authenticated
        if (needsOnboarding === true) {
          targetRoute = '/onboarding';
          console.log('[Routing] Need to redirect to onboarding (from login)');
        } else if (needsOnboarding === false) {
          targetRoute = '/(tabs)/(home)';
          console.log('[Routing] Need to redirect to home (from login)');
        }
      } else if (inOnboardingGroup && needsOnboarding === false) {
        // On onboarding screen but doesn't need it
        targetRoute = '/(tabs)/(home)';
        console.log('[Routing] Need to redirect to home (onboarding complete)');
      } else if (!inOnboardingGroup && !inTabsGroup && needsOnboarding === true) {
        // Not on onboarding but needs it
        targetRoute = '/onboarding';
        console.log('[Routing] Need to redirect to onboarding (needs onboarding)');
      } else if (!inOnboardingGroup && !inTabsGroup && needsOnboarding === false && !hasInitializedRef.current) {
        // Initial load - redirect to home
        targetRoute = '/(tabs)/(home)';
        console.log('[Routing] Initial load - redirect to home');
      }
    }

    // Only navigate if we have a target and it's different from the last route
    if (targetRoute && targetRoute !== lastRouteRef.current) {
      console.log('[Routing] Navigating to:', targetRoute);
      lastRouteRef.current = targetRoute;
      hasInitializedRef.current = true;
      
      try {
        router.replace(targetRoute);
      } catch (error) {
        console.error('[Routing] Error navigating:', error);
      }
    } else if (targetRoute === null && !hasInitializedRef.current) {
      // No navigation needed, mark as initialized
      hasInitializedRef.current = true;
      console.log('[Routing] No navigation needed, marking as initialized');
    }
  }, [user, loading, checkingOnboarding, needsOnboarding, segments, router]);

  return (
    <View style={styles.container}>
      {/* iOS Status Bar Background - Thin black bar */}
      <IOSStatusBarBackground />
      
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'default',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="update-password" options={{ headerShown: false }} />
        <Stack.Screen name="email-confirmed" options={{ headerShown: false }} />
        <Stack.Screen name="note-editor" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="shared-recall" options={{ headerShown: false }} />
        <Stack.Screen name="person-recalls" options={{ headerShown: false }} />
        <Stack.Screen name="people-word-cloud" options={{ headerShown: false }} />
        <Stack.Screen name="create-recall-from-share" options={{ headerShown: false }} />
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
      
      {/* People Graph Overlay - Rendered at the highest level with maximum z-index */}
      <PeopleGraphOverlay />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <WidgetProvider>
          <NotesProvider>
            <PeopleGraphProvider>
              <RootLayoutNav />
            </PeopleGraphProvider>
          </NotesProvider>
        </WidgetProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999999,
    elevation: 999999,
  },
  iosStatusBarBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#000000',
    zIndex: 999998,
    elevation: 999998,
  },
});
