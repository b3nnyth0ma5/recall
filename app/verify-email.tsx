
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';
import { AUTH_REDIRECT_URLS } from '@/constants/config';

const RESEND_COOLDOWN_SECONDS = 60;
const POLL_INTERVAL_MS = 5000;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [resendLoading, setResendLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const userEmail = user?.email ?? '';

  // Check if email is now verified and let the layout route us out
  const checkVerified = useCallback(async (source: string) => {
    console.log(`[VerifyEmail] Refresh tick — source: ${source}`);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.log('[VerifyEmail] refreshSession error:', error.message);
        return;
      }
      const refreshedUser = data?.user;
      const confirmedAt = (refreshedUser as any)?.email_confirmed_at || (refreshedUser as any)?.confirmed_at;
      console.log('[VerifyEmail] email_confirmed_at after refresh:', confirmedAt ?? 'null');
      // If confirmed, the AuthContext will update and _layout.tsx will route us out automatically.
      // No manual navigation needed here.
    } catch (e) {
      console.log('[VerifyEmail] checkVerified exception:', e);
    }
  }, []);

  // Polling every 5 seconds
  useEffect(() => {
    mountedRef.current = true;

    pollIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        checkVerified('poll');
      }
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [checkVerified]);

  // Refresh on foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[VerifyEmail] App foregrounded — refreshing session');
        checkVerified('foreground');
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [checkVerified]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;

    cooldownIntervalRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, [cooldown]);

  const handleResend = async () => {
    console.log('[VerifyEmail] Resend email button pressed');
    if (!userEmail || cooldown > 0 || resendLoading) return;

    setResendLoading(true);
    console.log('[VerifyEmail] Calling supabase.auth.resend for:', userEmail);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: userEmail,
        options: {
          emailRedirectTo: AUTH_REDIRECT_URLS.EMAIL_CONFIRMED,
        },
      });

      if (error) {
        console.log('[VerifyEmail] Resend error:', error.message);
        Alert.alert('Error', error.message || 'Failed to resend verification email.');
      } else {
        console.log('[VerifyEmail] Resend successful, starting cooldown');
        Alert.alert('Email sent', `A new verification link has been sent to ${userEmail}.`);
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } catch (e) {
      console.log('[VerifyEmail] Resend exception:', e);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    console.log('[VerifyEmail] "I already verified" button pressed');
    setRefreshLoading(true);
    try {
      const { data: refreshData } = await supabase.auth.refreshSession();
      const { data: userData } = await supabase.auth.getUser();
      const confirmedAt =
        (refreshData?.user as any)?.email_confirmed_at ||
        (refreshData?.user as any)?.confirmed_at ||
        (userData?.user as any)?.email_confirmed_at ||
        (userData?.user as any)?.confirmed_at;

      console.log('[VerifyEmail] Manual refresh — email_confirmed_at:', confirmedAt ?? 'null');

      if (!confirmedAt) {
        Alert.alert(
          'Not verified yet',
          'We could not find a verification for your email. Please check your inbox and tap the link.'
        );
      }
      // If confirmed, AuthContext will update and _layout.tsx routes us out.
    } catch (e) {
      console.log('[VerifyEmail] Manual refresh exception:', e);
    } finally {
      setRefreshLoading(false);
    }
  };

  const handleUseDifferentAccount = async () => {
    console.log('[VerifyEmail] "Use a different account" pressed');
    await signOut();
    router.replace('/login');
  };

  const resendButtonLabel = cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email';
  const resendDisabled = cooldown > 0 || resendLoading;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* App Icon */}
          <View style={styles.iconContainer}>
            <Image
              source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
              style={styles.appIcon}
              contentFit="contain"
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>Verify your email</Text>

          {/* Body */}
          <Text style={styles.bodyText}>
            {'We sent a verification link to '}
          </Text>
          <Text style={styles.emailText}>{userEmail}</Text>
          <Text style={styles.bodyTextBelow}>
            Tap the link in that email to finish setting up your Recall account.
          </Text>

          {/* Resend button */}
          <View style={styles.buttonContainer}>
            <Pressable
              onPress={handleResend}
              disabled={resendDisabled}
              style={[styles.button, resendDisabled && styles.buttonDisabled]}
            >
              {resendLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>{resendButtonLabel}</Text>
              )}
            </Pressable>

            {/* Manual refresh link */}
            <Pressable
              onPress={handleManualRefresh}
              disabled={refreshLoading}
              style={styles.secondaryButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {refreshLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>I already verified — refresh</Text>
              )}
            </Pressable>
          </View>

          {/* Use different account */}
          <Pressable
            onPress={handleUseDifferentAccount}
            style={styles.tertiaryButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.tertiaryButtonText}>Use a different account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  iconContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: {
    width: 120,
    height: 120,
    borderRadius: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  bodyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  emailText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  bodyTextBelow: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 36,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
    marginBottom: 24,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16 * 1.15,
    paddingHorizontal: 24 * 1.15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52 * 1.15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '500',
  },
  tertiaryButton: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  tertiaryButtonText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontWeight: '400',
  },
});
