
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

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
    let writeTokenFile: ((json: string) => Promise<boolean>) | null = null;
    let deleteTokenFile: (() => Promise<boolean>) | null = null;
    try {
      const mod = await import('recall-native');
      writeTokenFile = mod.writeTokenFile;
      deleteTokenFile = mod.deleteTokenFile;
    } catch {
      console.warn('[AuthContext] recall-native not available in this build — skipping App Group write');
      return;
    }

    if (!writeTokenFile || !deleteTokenFile) {
      console.warn('[AuthContext] writeTokenFile/deleteTokenFile not exported from recall-native — skipping');
      return;
    }

    if (newSession) {
      const payload = JSON.stringify({
        access_token: newSession.access_token,
        refresh_token: newSession.refresh_token,
        user_id: newSession.user.id,
        expires_at: newSession.expires_at ?? 0,
      });
      console.log(
        '[AuthContext] Writing token via native bridge — payload size:',
        payload.length,
        'bytes'
      );
      const success = await writeTokenFile(payload);
      if (success) {
        console.log('[AuthContext] Token file written successfully via native bridge');
      } else {
        console.error('[AuthContext] writeTokenFile returned false — token may not have been written');
      }

      // Verify the write landed
      try {
        let verifyAppGroupContainer: (() => Promise<unknown>) | null = null;
        try {
          const mod = await import('recall-native');
          verifyAppGroupContainer = mod.verifyAppGroupContainer;
        } catch {
          // skip verify
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
          console.error('[AuthContext] Post-write verify FAILED — file not found after write.');
        } else if (verify.tokenFileSize !== payload.length) {
          console.error(
            `[AuthContext] Post-write verify SIZE MISMATCH — wrote ${payload.length} bytes, Swift sees ${verify.tokenFileSize} bytes.`
          );
        }
      } catch (verifyErr) {
        console.warn('[AuthContext] Post-write verify threw:', String(verifyErr));
      }
    } else {
      console.log('[AuthContext] Deleting token file via native bridge');
      const deleted = await deleteTokenFile();
      console.log('[AuthContext] Token file delete result:', deleted);
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

    // Get initial session — try to refresh first so the App Group token is always fresh
    const initializeAuth = async () => {
      try {
        // Try to get a fresh session first; fall back to cached if refresh fails
        let initialSession = null;
        try {
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshedSession) {
            console.log('[AuthContext] Initial refresh failed, falling back to cached session:', refreshError?.message);
            const { data: { session: cachedSession } } = await supabase.auth.getSession();
            initialSession = cachedSession;
          } else {
            console.log('[AuthContext] Initial session refreshed successfully');
            initialSession = refreshedSession;
          }
        } catch (e) {
          console.warn('[AuthContext] initializeAuth refresh threw, falling back to getSession:', e);
          const { data: { session: cachedSession } } = await supabase.auth.getSession();
          initialSession = cachedSession;
        }

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
          const { data: { session: currentSession }, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            // If refresh fails (e.g. refresh token expired), fall back to the cached session
            // so we don't wipe a still-valid token from the App Group file
            console.warn('[AuthContext] App foreground token refresh failed, falling back to cached session:', refreshError.message);
            const { data: { session: cachedSession } } = await supabase.auth.getSession();
            await writeTokenToAppGroup(cachedSession);
          } else {
            await writeTokenToAppGroup(currentSession);
          }
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
