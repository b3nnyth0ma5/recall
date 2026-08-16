import { useEffect, useState, memo, useRef, useCallback } from 'react';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { WidgetProvider } from '@/contexts/WidgetContext';
import { NotesProvider } from '@/contexts/NotesContext';
import { PeopleGraphProvider, usePeopleGraph } from '@/contexts/PeopleGraphContext';
import { CreateRecallUIProvider, useCreateRecallUI } from '@/contexts/CreateRecallUIContext';
import { ScrollToTopProvider, useScrollToTop } from '@/contexts/ScrollToTopContext';
import { PeopleGraph } from '@/components/PeopleGraph';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PortalProvider } from '@gorhom/portal';
import { StyleSheet, View, Platform, Linking, AppState } from 'react-native';
import { supabase } from '@/utils/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Asset as ExpoAsset } from 'expo-asset';


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
    <View style={[styles.overlayContainer, { pointerEvents: 'box-none' }]}>
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
  const { user, loading, emailVerified } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  
  // Use refs to track navigation state and prevent infinite loops
  const hasInitializedRef = useRef(false);
  const lastRouteRef = useRef<string>('');
  // Track share intent that arrived before auth was ready
  const pendingShareIntentRef = useRef(false);

  // One-shot Recall logo prefetch — runs once when the root layout mounts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log('[RootLayout] Prefetching Recall logo...');
        const asset = ExpoAsset.fromModule(require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png'));
        await asset.downloadAsync(); // ensures the asset is available locally
        if (cancelled) return;
        // Warm expo-image's memory + disk cache too
        const uri = asset.localUri || asset.uri;
        if (uri) {
          await ExpoImage.prefetch(uri);
          console.log('[RootLayout] Recall logo prefetch complete');
        }
      } catch (e) {
        console.warn('[RootLayout] Recall logo prefetch failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Unified URL handler: share-intent + Siri
  useEffect(() => {
    if (loading) return;

    const handleIncomingUrl = (url: string) => {
      console.log('[URLHandler] Received URL:', url);

      if (url.includes('share-intent')) {
        console.log('[URLHandler] Share intent URL detected');
        if (user) {
          console.log('[URLHandler] User authenticated, navigating to create-recall-from-share');
          router.replace('/create-recall-from-share');
        } else {
          console.log('[URLHandler] User not authenticated, storing pending share intent');
          pendingShareIntentRef.current = true;
        }
        return;
      }

      if (url.includes('create-recall') && !url.includes('create-recall-from-share')) {
        console.log('[URLHandler] Create recall URL detected');
        if (user) {
          console.log('[URLHandler] User authenticated, navigating to home with openCreate');
          router.push('/(tabs)/(home)?openCreate=true');
        }
        return;
      }

      // Siri tap-to-open: recall://note/{id}
      if (url.includes('/note/')) {
        try {
          const parsed = new URL(url);
          let noteId: string | null = null;
          if (parsed.hostname === 'note') {
            noteId = parsed.pathname.replace(/^\//, '');
          } else if (parsed.pathname.startsWith('/note/')) {
            noteId = parsed.pathname.replace('/note/', '');
          }
          if (noteId && user) {
            console.log('[URLHandler] Opening recall from Siri tap:', noteId);
            router.push(`/note-editor?id=${encodeURIComponent(noteId)}`);
          }
        } catch (e) {
          // ignore malformed URLs
        }
        return;
      }

      // Siri / NSUserActivity search URLs
      try {
        const parsed = new URL(url);
        if (parsed.hostname === 'search' || parsed.pathname === '/search') {
          const q = parsed.searchParams.get('q');
          const autoSearch = parsed.searchParams.get('autoSearch');
          if (q && autoSearch === 'true' && user) {
            console.log('[URLHandler] Siri search URL, navigating to search with query:', q);
            router.push(`/search?q=${encodeURIComponent(q)}&autoSearch=true`);
          }
        }
      } catch (e) {
        // ignore malformed URLs
      }
    };

    // Check initial URL (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[URLHandler] Initial URL on cold start:', url);
        handleIncomingUrl(url);
      }
    });

    // Foreground URL events
    const subscription = Linking.addEventListener('url', ({ url }) => {
      console.log('[URLHandler] Foreground URL event:', url);
      handleIncomingUrl(url);
    });

    return () => subscription.remove();
  }, [loading, user, router]);

  // Check for pending share data in App Group (used by AppState + Darwin listeners)
  const checkForPendingShare = useCallback(async () => {
    if (!user) return;
    try {
      const { hasPendingShareData } = await import('@/utils/nativeShareReceiver');
      const hasPending = await hasPendingShareData();
      if (hasPending) {
        console.log('[URLHandler] Pending share data detected on foreground — navigating');
        router.replace('/create-recall-from-share');
      }
    } catch (e) {
      console.warn('[URLHandler] checkForPendingShare error:', e);
    }
  }, [user, router]);

  // AppState foreground listener — check for pending share when app becomes active
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForPendingShare();
    });
    return () => sub.remove();
  }, [checkForPendingShare]);

  // Darwin bridge — listen for onShareCompleted event from AppGroupModule
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let sub: any;
    (async () => {
      try {
        const { requireNativeModule } = await import('expo-modules-core');
        const mod = requireNativeModule('AppGroupModule');
        if (mod?.addListener) {
          sub = mod.addListener('onShareCompleted', () => {
            console.log('[URLHandler] Darwin onShareCompleted event received');
            checkForPendingShare();
          });
        }
      } catch (e) {
        // AppGroupModule not available in this build
      }
    })();
    return () => { try { sub?.remove(); } catch {} };
  }, [checkForPendingShare]);

  // When user becomes available, flush any pending share intent
  useEffect(() => {
    if (user && pendingShareIntentRef.current) {
      console.log('[URLHandler] User now authenticated, flushing pending share intent');
      pendingShareIntentRef.current = false; // reset FIRST to prevent re-entry
      try {
        router.replace('/create-recall-from-share');
      } catch (e) {
        console.warn('[URLHandler] Failed to navigate to create-recall-from-share:', e);
      }
    }
  }, [user, router]);

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
    const inVerifyEmailScreen = currentSegment === 'verify-email';
    const inShareScreen = currentSegment === 'create-recall-from-share';
    const inOtherScreens = currentSegment === 'search' || currentSegment === 'location-search' || currentSegment === 'map-view' || currentSegment === 'shared-recall' || currentSegment === 'person-recalls' || currentSegment === 'people-word-cloud';

    console.log('[Routing] Current state:', { 
      user: !!user, 
      emailVerified,
      inAuthGroup, 
      inOnboardingGroup, 
      inTabsGroup,
      inNoteEditor,
      inModalScreens,
      inPasswordResetScreens,
      inEmailConfirmedScreen,
      inVerifyEmailScreen,
      inShareScreen,
      inOtherScreens,
      needsOnboarding,
      currentSegment,
      hasInitialized: hasInitializedRef.current,
      lastRoute: lastRouteRef.current
    });

    // Don't redirect if user is on special screens (they can navigate freely)
    // This is critical for password reset flow and share intent to work properly
    if (inNoteEditor || inModalScreens || inPasswordResetScreens || inEmailConfirmedScreen || inVerifyEmailScreen || inShareScreen || inOtherScreens) {
      console.log('[Routing] User on special screen, not redirecting');
      return;
    }

    // Determine target route
    let targetRoute: string | null = null;

    if (!user) {
      // User not authenticated — send to onboarding unless already on onboarding or login
      if (!inAuthGroup && !inOnboardingGroup) {
        targetRoute = '/onboarding';
        console.log('[Routing] Need to redirect to onboarding (no user)');
      }
    } else if (!emailVerified) {
      // User is authenticated but email not yet verified — gate them
      if (!inAuthGroup) {
        targetRoute = '/verify-email';
        console.log('[Routing] Email not verified — redirecting to verify-email');
      }
    } else {
      // User is authenticated and email is verified
      // If they were on the verify-email screen, move them along
      if (inVerifyEmailScreen) {
        if (needsOnboarding === true) {
          targetRoute = '/onboarding';
          console.log('[Routing] Email now verified — redirecting to onboarding');
        } else if (needsOnboarding === false) {
          targetRoute = '/(tabs)/(home)';
          console.log('[Routing] Email now verified — redirecting to home');
        }
      } else if (inAuthGroup) {
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
  }, [user, loading, emailVerified, checkingOnboarding, needsOnboarding, segments, router]);

  const { isCreatePanelOpen, openCreatePanel } = useCreateRecallUI();
  const { triggerScrollToTop, triggerSearchFocus } = useScrollToTop();
  const pathname = usePathname();

  const showNavBar = (() => {
    const seg0 = segments[0] as string | undefined;
    const seg1 = segments[1] as string | undefined;
    const seg2 = segments[2] as string | undefined;
    const inHomeIndex = seg0 === '(tabs)' && seg1 === '(home)' && (!seg2 || seg2 === 'index');
    const inProfile = seg0 === '(tabs)' && seg1 === 'profile';
    const inSearch = seg0 === 'search';
    const inPersonRecalls = seg0 === 'person-recalls';
    const inPeopleWordCloud = seg0 === 'people-word-cloud';
    return inHomeIndex || inProfile || inSearch;
  })();

  const activeRoute: 'home' | 'search' | 'profile' | null = (() => {
    const seg0 = segments[0] as string | undefined;
    const seg1 = segments[1] as string | undefined;
    if (seg0 === 'search') return 'search';
    if (seg0 === '(tabs)' && seg1 === 'profile') return 'profile';
    if (seg0 === '(tabs)' && seg1 === '(home)') return 'home';
    if (seg0 === 'person-recalls' || seg0 === 'people-word-cloud') return 'home';
    return null;
  })();

  const navBarVisible = showNavBar && !isCreatePanelOpen;

  const handleNavHome = () => {
    console.log('[FloatingNavBar] Home tapped, activeRoute:', activeRoute, 'pathname:', pathname);
    if (activeRoute === 'home') {
      console.log('[FloatingNavBar] Already on home — scrolling to top');
      triggerScrollToTop('home');
    } else {
      router.push('/(tabs)/(home)');
    }
  };

  const handleNavSearch = () => {
    console.log('[FloatingNavBar] Search tapped, activeRoute:', activeRoute);
    if (activeRoute === 'search') {
      console.log('[FloatingNavBar] Already on search — scrolling to top and focusing input');
      triggerScrollToTop('search');
      triggerSearchFocus();
    } else {
      router.push('/search');
    }
  };

  const handleNavProfile = () => {
    console.log('[FloatingNavBar] Profile tapped, activeRoute:', activeRoute);
    if (activeRoute === 'profile') {
      console.log('[FloatingNavBar] Already on profile — scrolling to top');
      triggerScrollToTop('profile');
    } else {
      router.push('/(tabs)/profile');
    }
  };

  const handleNavCreateRecall = () => {
    console.log('[FloatingNavBar] Create recall tapped, seg0:', segments[0], 'seg1:', segments[1]);
    const seg0 = segments[0] as string | undefined;
    const seg1 = segments[1] as string | undefined;
    const seg2 = segments[2] as string | undefined;
    const isOnHomeIndex = seg0 === '(tabs)' && seg1 === '(home)' && (!seg2 || seg2 === 'index');
    if (!isOnHomeIndex) {
      router.push('/(tabs)/(home)');
    }
    openCreatePanel();
  };

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
        <Stack.Screen name="verify-email" options={{ headerShown: false }} />
        <Stack.Screen name="note-editor" options={{ headerShown: false }} />
        <Stack.Screen
          name="search"
          options={{
            headerShown: false,
            animation: 'fade',
            animationDuration: 200,
          }}
        />
        <Stack.Screen name="location-search" options={{ headerShown: false }} />
        <Stack.Screen name="map-view" options={{ headerShown: false }} />
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

      {/* Floating Nav Bar */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 24, pointerEvents: 'box-none' }]}>
        <FloatingNavBar
          visible={navBarVisible}
          activeRoute={activeRoute}
          onHomePress={handleNavHome}
          onCreateRecallPress={handleNavCreateRecall}
          onSearchPress={handleNavSearch}
          onProfilePress={handleNavProfile}
        />
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PortalProvider>
        <AuthProvider>
          <WidgetProvider>
            <NotesProvider>
              <PeopleGraphProvider>
                <ScrollToTopProvider>
                  <CreateRecallUIProvider>
                    <RootLayoutNav />
                  </CreateRecallUIProvider>
                </ScrollToTopProvider>
              </PeopleGraphProvider>
            </NotesProvider>
          </WidgetProvider>
        </AuthProvider>
      </PortalProvider>
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
