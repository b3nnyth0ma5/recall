
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import * as FileSystem from 'expo-file-system/legacy';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  emailVerified: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export async function writeTokenToAppGroup(newSession: Session | null) {
  const hasSession = newSession !== null;
  console.log(
    '[AuthContext] writeTokenToAppGroup called — has session:',
    hasSession,
    '| platform:',
    Platform.OS
  );

  if (Platform.OS !== 'ios') {
    console.log('[AuthContext] writeTokenToAppGroup — skipping, not iOS');
    return;
  }

  try {
    let getAppGroupContainerPath: (() => Promise<string | null>) | null = null;
    try {
      const mod = await import('recall-native');
      getAppGroupContainerPath = mod.getAppGroupContainerPath;
    } catch {
      console.warn('[AuthContext] recall-native not available in this build — skipping App Group write');
      return;
    }
    const containerPath = await getAppGroupContainerPath() as string | null;

    console.log(
      '[AuthContext] App Group container path:',
      containerPath ?? 'NULL'
    );

    if (!containerPath) {
      console.warn('[AuthContext] writeTokenToAppGroup — containerPath is null, aborting');
      return;
    }

    const normalized = containerPath.startsWith('file://')
      ? containerPath
      : `file://${containerPath}`;
    const tokenPath = normalized.endsWith('/')
      ? `${normalized}auth-token.json`
      : `${normalized}/auth-token.json`;

    if (newSession) {
      const payload = JSON.stringify({
        access_token: newSession.access_token,
        refresh_token: newSession.refresh_token,
        user_id: newSession.user.id,
        expires_at: newSession.expires_at ?? 0,
      });
      console.log(
        '[AuthContext] Writing token file to:',
        tokenPath,
        '| payload size:',
        payload.length,
        'bytes'
      );
      await FileSystem.writeAsStringAsync(tokenPath, payload);
      console.log('[AuthContext] Token file written successfully');

      // Verify the write actually landed where the share extension will read.
      try {
        let verifyAppGroupContainer: (() => Promise<unknown>) | null = null;
        try {
          const mod = await import('recall-native');
          verifyAppGroupContainer = mod.verifyAppGroupContainer;
        } catch {
          // recall-native not available in this build — skip verify
        }
        const verify = verifyAppGroupContainer ? await verifyAppGroupContainer() as any : null;
        console.log(
          '[AuthContext] Post-write verify:',
          JSON.stringify({
            tokenFileExists: verify?.tokenFileExists ?? null,
            tokenFileSize: verify?.tokenFileSize ?? null,
            expectedSize: payload.length,
            sizeMatches: verify?.tokenFileSize === payload.length,
            containerPath: verify?.containerPath ?? null,
          })
        );
        if (!verify?.tokenFileExists) {
          console.error('[AuthContext] Post-write verify FAILED — file not found after write. Container path may differ between JS write and Swift read.');
        } else if (verify.tokenFileSize !== payload.length) {
          console.error(
            `[AuthContext] Post-write verify SIZE MISMATCH — wrote ${payload.length} bytes, Swift sees ${verify.tokenFileSize} bytes.`
          );
        }
      } catch (verifyErr) {
        console.warn('[AuthContext] Post-write verify threw:', String(verifyErr));
      }
    } else {
      console.log('[AuthContext] Deleting token file at:', tokenPath);
      await FileSystem.deleteAsync(tokenPath, { idempotent: true });
      console.log('[AuthContext] Token file deleted successfully');
    }
  } catch (e) {
    console.error(
      '[AuthContext] writeTokenToAppGroup FAILED:',
      e instanceof Error ? e.message : String(e)
    );
    console.error(
      '[AuthContext] writeTokenToAppGroup error stack:',
      e instanceof Error ? e.stack : 'no stack'
    );
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (mounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
          setLoading(false);
        }

        // Write initial session token to App Group
        if (initialSession) {
          await writeTokenToAppGroup(initialSession);
        }
      } catch (error) {
        console.log('Error initializing auth:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
      }
      // Persist/clear token in App Group for share extension
      writeTokenToAppGroup(newSession);

      // NEW: trigger theme analysis on first login if no categories exist
      if (_event === 'SIGNED_IN' && newSession?.user) {
        const userId = newSession.user.id;
        (async () => {
          try {
            const { count } = await supabase
              .from('recollection_categories')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', userId);
            if (count === 0) {
              console.log('[AuthContext] No categories found for user — triggering analyse-user-themes');
              await supabase.functions.invoke('analyse-user-themes', {
                body: { userId: userId, force: true },
              });
              console.log('[AuthContext] analyse-user-themes invoked successfully');
            }
          } catch (e) {
            console.error('[AuthContext] Failed to trigger theme analysis on login:', e);
          }
        })();
      }
    });

    // Refresh the App Group token whenever the app comes to the foreground.
    // This ensures the share extension always has the freshest token even if
    // Supabase silently refreshed it while the app was backgrounded.
    const appStateSubscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        console.log('[AuthContext] App foregrounded — refreshing App Group auth token');

        // Run App Group diagnostics on every foreground so we can see the
        // native module state in device logs without needing Xcode.
        try {
          // const { getDiagnostics } = await import('recall-native'); // recall-native disabled
          // const diagnostics = await getDiagnostics(); // recall-native disabled
        } catch (diagErr) {
          console.warn('[AuthContext] getDiagnostics threw:', String(diagErr));
        }

        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          await writeTokenToAppGroup(currentSession);
        } catch (e) {
          console.error(
            '[AuthContext] App foreground token refresh FAILED:',
            e instanceof Error ? e.message : String(e)
          );
          console.error(
            '[AuthContext] App foreground token refresh error stack:',
            e instanceof Error ? e.stack : 'no stack'
          );
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.log('Error signing out:', error);
    }
  };

  // Apple / OAuth users are considered verified; email/password users must have email_confirmed_at.
  const provider = user?.app_metadata?.provider as string | undefined;
  const isEmailProvider = !provider || provider === 'email';
  const emailVerified = !user
    ? false
    : !isEmailProvider
      ? true
      : Boolean((user as any).email_confirmed_at || (user as any).confirmed_at);

  const value = {
    session,
    user,
    loading,
    emailVerified,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
