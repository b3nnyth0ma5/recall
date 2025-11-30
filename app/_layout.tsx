
import { useEffect, useState, memo, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { WidgetProvider } from '@/contexts/WidgetContext';
import { PeopleGraphProvider, usePeopleGraph } from '@/contexts/PeopleGraphContext';
import { PeopleGraph } from '@/components/PeopleGraph';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import { getInitialShareData, listenForShareIntents, ReceivedShareData } from '@/utils/nativeShareReceiver';
import { supabase } from '@/utils/supabase';

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

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [pendingShareData, setPendingShareData] = useState<ReceivedShareData | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  
  // Use refs to track navigation state and prevent infinite loops
  const hasNavigatedRef = useRef(false);
  const lastNavigationRef = useRef<string>('');
  const isNavigatingRef = useRef(false);

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

  // Handle initial share data when app launches
  useEffect(() => {
    const handleInitialShare = async () => {
      if (loading) {
        console.log('[Share] Still loading, waiting...');
        return;
      }

      try {
        console.log('[Share] Checking for initial share data...');
        const shareData = await getInitialShareData();
        
        if (shareData) {
          console.log('[Share] Initial share data detected:', shareData);
          setPendingShareData(shareData);
        } else {
          console.log('[Share] No initial share data found');
        }
      } catch (error) {
        console.error('[Share] Error handling initial share:', error);
      }
    };

    handleInitialShare();
  }, [loading]);

  // Listen for share intents while app is running
  useEffect(() => {
    console.log('[Share] Setting up share intent listener');
    
    const unsubscribe = listenForShareIntents((shareData) => {
      console.log('[Share] Share intent received:', shareData);
      
      // Check if user is authenticated
      if (!user) {
        console.log('[Share] User not authenticated, storing share data for later');
        setPendingShareData(shareData);
        return;
      }
      
      // Navigate to share-intent screen with the data
      console.log('[Share] Navigating to share-intent screen');
      try {
        router.push({
          pathname: '/share-intent',
          params: {
            text: shareData.text || '',
            images: shareData.images ? JSON.stringify(shareData.images) : '[]',
          },
        });
      } catch (error) {
        console.error('[Share] Error navigating to share-intent:', error);
      }
    });

    return () => {
      console.log('[Share] Cleaning up share intent listener');
      unsubscribe();
    };
  }, [user]);

  // Handle pending share data after user authentication
  useEffect(() => {
    if (user && pendingShareData && !loading && !checkingOnboarding) {
      console.log('[Share] User authenticated, processing pending share data:', pendingShareData);
      
      // Navigate to share-intent screen with the pending data
      setTimeout(() => {
        console.log('[Share] Navigating to share-intent with pending data');
        try {
          router.push({
            pathname: '/share-intent',
            params: {
              text: pendingShareData.text || '',
              images: pendingShareData.images ? JSON.stringify(pendingShareData.images) : '[]',
            },
          });
          
          // Clear pending share data after navigation
          setPendingShareData(null);
        } catch (error) {
          console.error('[Share] Error navigating with pending share data:', error);
        }
      }, 300);
    }
  }, [user, pendingShareData, loading, checkingOnboarding]);

  // Handle authentication and onboarding routing with proper guards
  useEffect(() => {
    // Don't do anything while loading or checking onboarding
    if (loading || checkingOnboarding) {
      console.log('[Routing] Waiting for loading/checking to complete...', { loading, checkingOnboarding });
      return;
    }

    // Don't navigate if already navigating
    if (isNavigatingRef.current) {
      console.log('[Routing] Already navigating, skipping...');
      return;
    }

    const inAuthGroup = segments[0] === 'login';
    const inOnboardingGroup = segments[0] === 'onboarding';
    const inTabsGroup = segments[0] === '(tabs)';
    const inShareIntentScreen = segments[0] === 'share-intent';
    const inNoteEditor = segments[0] === 'note-editor';
    const inModalScreens = segments[0] === 'modal' || segments[0] === 'formsheet' || segments[0] === 'transparent-modal';
    const inOtherScreens = segments[0] === 'search' || segments[0] === 'location-search' || segments[0] === 'map-view' || segments[0] === 'shared-recall' || segments[0] === 'person-recalls';

    console.log('[Routing] Current state:', { 
      user: !!user, 
      inAuthGroup, 
      inOnboardingGroup, 
      inTabsGroup,
      inShareIntentScreen,
      inNoteEditor,
      inModalScreens,
      inOtherScreens,
      needsOnboarding,
      segments,
      hasPendingShare: !!pendingShareData
    });

    // Don't redirect if user is on special screens
    if (inShareIntentScreen || inNoteEditor || inModalScreens || inOtherScreens) {
      console.log('[Routing] User on special screen, not redirecting');
      return;
    }

    // Don't redirect if we have pending share data
    if (pendingShareData) {
      console.log('[Routing] Pending share data exists, not redirecting');
      return;
    }

    // Determine target route
    let targetRoute: string | null = null;

    if (!user && !inAuthGroup) {
      // User not authenticated, redirect to login
      targetRoute = '/login';
      console.log('[Routing] Need to redirect to login (no user)');
    } else if (user && inAuthGroup) {
      // User authenticated and on login screen
      if (needsOnboarding === true) {
        targetRoute = '/onboarding';
        console.log('[Routing] Need to redirect to onboarding (from login)');
      } else if (needsOnboarding === false) {
        targetRoute = '/(tabs)/(home)';
        console.log('[Routing] Need to redirect to home (from login)');
      }
    } else if (user && inOnboardingGroup && needsOnboarding === false) {
      // User authenticated, on onboarding screen, but doesn't need it anymore
      targetRoute = '/(tabs)/(home)';
      console.log('[Routing] Need to redirect to home (onboarding complete)');
    } else if (user && needsOnboarding === true && !inOnboardingGroup && !inTabsGroup && segments.length === 0) {
      // User authenticated but needs onboarding and is at root
      targetRoute = '/onboarding';
      console.log('[Routing] Need to redirect to onboarding (at root, needs onboarding)');
    }

    // Only navigate if we have a target and haven't navigated to it yet
    if (targetRoute && lastNavigationRef.current !== targetRoute) {
      console.log('[Routing] Navigating to:', targetRoute);
      isNavigatingRef.current = true;
      lastNavigationRef.current = targetRoute;
      
      try {
        router.replace(targetRoute);
      } catch (error) {
        console.error('[Routing] Error navigating:', error);
      } finally {
        // Reset navigation flag after a delay
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 1000);
      }
    }
  }, [user, segments, loading, checkingOnboarding, needsOnboarding, pendingShareData]);

  return (
    <View style={styles.container}>
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
        <Stack.Screen name="person-recalls" options={{ headerShown: false }} />
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
          <PeopleGraphProvider>
            <RootLayoutNav />
          </PeopleGraphProvider>
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
});
