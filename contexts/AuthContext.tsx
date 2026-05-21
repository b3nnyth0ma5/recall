
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
  if (Platform.OS !== 'ios') return;
  try {
    const { getAppGroupContainerPath } = await import('@/modules/AppGroupModule');
    const containerPath = await getAppGroupContainerPath();
    if (!containerPath) return;
    const normalized = containerPath.startsWith('file://') ? containerPath : `file://${containerPath}`;
    const tokenPath = normalized.endsWith('/') ? `${normalized}auth-token.json` : `${normalized}/auth-token.json`;
    if (newSession) {
      console.log('[AuthContext] Writing auth token to App Group for share extension');
      await FileSystem.writeAsStringAsync(tokenPath, JSON.stringify({
        access_token: newSession.access_token,
        refresh_token: newSession.refresh_token,
        user_id: newSession.user.id,
        expires_at: newSession.expires_at ?? 0,
      }));
    } else {
      console.log('[AuthContext] Clearing auth token from App Group (sign out)');
      await FileSystem.deleteAsync(tokenPath, { idempotent: true });
    }
  } catch (e) {
    // non-fatal
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
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          await writeTokenToAppGroup(currentSession);
        } catch (e) {
          // non-fatal
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
