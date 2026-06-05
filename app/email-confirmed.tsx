
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function EmailConfirmedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    const handleEmailConfirmation = async () => {
      try {
        console.log('[EmailConfirmed] Params received:', params);

        // Check if we have token_hash and type in the URL
        const tokenHash = params.token_hash as string;
        const type = params.type as string;

        if (tokenHash && type) {
          console.log('[EmailConfirmed] Verifying OTP with token_hash:', tokenHash, 'type:', type);
          
          // Verify the OTP token
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });

          if (error) {
            console.error('[EmailConfirmed] Error verifying OTP:', error);
            setStatus('error');
            setMessage(error.message || 'Verification failed. Please try again.');
            
            // Animate error state
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
              }),
            ]).start();
            
            // Redirect to login after 3 seconds
            setTimeout(() => {
              router.replace('/login');
            }, 3000);
            return;
          }

          console.log('[EmailConfirmed] OTP verified successfully:', data);

          // Check the type to determine what action was taken
          if (type === 'recovery' || type === 'email_change') {
            // For password recovery, redirect to update-password
            setStatus('success');
            setMessage('Email verified successfully!');
            
            // Animate success state
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
              }),
            ]).start();
            
            setTimeout(() => {
              router.replace('/update-password');
            }, 1500);
          } else if (type === 'signup' || type === 'email') {
            // For email confirmation, refresh session so email_confirmed_at is set, then let layout decide
            setStatus('success');
            setMessage('Email confirmed! Welcome to Recall.');
            
            // Animate success state
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
              }),
            ]).start();
            
            setTimeout(async () => {
              console.log('[EmailConfirmed] Refreshing session before redirect');
              await supabase.auth.refreshSession();
              router.replace('/onboarding');
            }, 1500);
          } else if (type === 'magiclink') {
            // For magic link, refresh session then let layout decide
            setStatus('success');
            setMessage('Signed in successfully!');
            
            // Animate success state
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
              }),
            ]).start();
            
            setTimeout(async () => {
              console.log('[EmailConfirmed] Refreshing session before redirect');
              await supabase.auth.refreshSession();
              router.replace('/onboarding');
            }, 1500);
          } else {
            // Unknown type, redirect to home
            setStatus('success');
            setMessage('Verification successful!');
            
            // Animate success state
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
              }),
            ]).start();
            
            setTimeout(() => {
              router.replace('/(tabs)/(home)');
            }, 1500);
          }
        } else {
          // No token_hash, check if user is already authenticated
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error('[EmailConfirmed] Error getting session:', sessionError);
            setStatus('error');
            setMessage('Session error. Please try again.');
            
            // Animate error state
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
              }),
            ]).start();
            
            setTimeout(() => {
              router.replace('/login');
            }, 3000);
            return;
          }

          if (session) {
            console.log('[EmailConfirmed] User already has session, redirecting to home');
            setStatus('success');
            setMessage('Already signed in!');
            
            // Animate success state
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
              }),
            ]).start();
            
            setTimeout(() => {
              router.replace('/(tabs)/(home)');
            }, 1500);
          } else {
            console.log('[EmailConfirmed] No token_hash and no session, redirecting to login');
            setStatus('error');
            setMessage('Invalid or expired link. Please try again.');
            
            // Animate error state
            Animated.parallel([
              Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
              }),
            ]).start();
            
            setTimeout(() => {
              router.replace('/login');
            }, 3000);
          }
        }
      } catch (error) {
        console.error('[EmailConfirmed] Exception handling email confirmation:', error);
        setStatus('error');
        setMessage('An unexpected error occurred. Please try again.');
        
        // Animate error state
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 8,
            tension: 40,
            useNativeDriver: true,
          }),
        ]).start();
        
        setTimeout(() => {
          router.replace('/login');
        }, 3000);
      }
    };

    handleEmailConfirmation();
  }, [params, router, fadeAnim, scaleAnim]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      
      <View style={styles.content}>
        {status === 'loading' && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingMessage}>{message}</Text>
          </View>
        )}
        
        {status === 'success' && (
          <Animated.View
            style={[
              styles.statusContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={[styles.iconCircle, styles.successCircle]}>
              <IconSymbol
                ios_icon_name="checkmark"
                android_material_icon_name="check"
                size={48}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.successTitle}>Success!</Text>
            <Text style={styles.successMessage}>{message}</Text>
            <View style={styles.redirectIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.redirectText}>Redirecting...</Text>
            </View>
          </Animated.View>
        )}
        
        {status === 'error' && (
          <Animated.View
            style={[
              styles.statusContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <View style={[styles.iconCircle, styles.errorCircle]}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={48}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.errorTitle}>Verification Failed</Text>
            <Text style={styles.errorMessage}>{message}</Text>
            <View style={styles.redirectIndicator}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={styles.redirectText}>Redirecting to login...</Text>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 20,
  },
  loadingMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  statusContainer: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  successCircle: {
    backgroundColor: colors.primary,
  },
  errorCircle: {
    backgroundColor: colors.error,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  redirectIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  redirectText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
