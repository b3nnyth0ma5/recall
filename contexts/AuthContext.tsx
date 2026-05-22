
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';
import * as FileSystem from 'expo-file-system/legacy';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function writeTokenToAppGroup(newSession: Session | null) {
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
    const { getAppGroupContainerPath } = await import('@/modules/AppGroupModule');
    const containerPath = await getAppGroupContainerPath();

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
          const { getDiagnostics } = await import('@/modules/AppGroupModule');
          const diagnostics = await getDiagnostics();
          console.log('[AuthContext] App Group diagnostics:', JSON.stringify(diagnostics));
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

  const value = {
    session,
    user,
    loading,
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
