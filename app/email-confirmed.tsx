
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function EmailConfirmedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying...');

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
            setMessage('Email verified! Redirecting...');
            setTimeout(() => {
              router.replace('/update-password');
            }, 1500);
          } else if (type === 'signup' || type === 'email') {
            // For email confirmation, redirect to home
            setStatus('success');
            setMessage('Email confirmed! Redirecting to app...');
            setTimeout(() => {
              router.replace('/(tabs)/(home)');
            }, 1500);
          } else if (type === 'magiclink') {
            // For magic link, redirect to home
            setStatus('success');
            setMessage('Signed in successfully! Redirecting...');
            setTimeout(() => {
              router.replace('/(tabs)/(home)');
            }, 1500);
          } else {
            // Unknown type, redirect to home
            setStatus('success');
            setMessage('Verification successful! Redirecting...');
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
            setTimeout(() => {
              router.replace('/login');
            }, 3000);
            return;
          }

          if (session) {
            console.log('[EmailConfirmed] User already has session, redirecting to home');
            setStatus('success');
            setMessage('Already signed in! Redirecting...');
            setTimeout(() => {
              router.replace('/(tabs)/(home)');
            }, 1500);
          } else {
            console.log('[EmailConfirmed] No token_hash and no session, redirecting to login');
            setStatus('error');
            setMessage('Invalid or expired link. Please try again.');
            setTimeout(() => {
              router.replace('/login');
            }, 3000);
          }
        }
      } catch (error) {
        console.error('[EmailConfirmed] Exception handling email confirmation:', error);
        setStatus('error');
        setMessage('An unexpected error occurred. Please try again.');
        setTimeout(() => {
          router.replace('/login');
        }, 3000);
      }
    };

    handleEmailConfirmation();
  }, [params, router]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.message}>{message}</Text>
          </>
        )}
        
        {status === 'success' && (
          <>
            <View style={styles.iconContainer}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check_circle"
                size={64}
                color={colors.primary}
              />
            </View>
            <Text style={styles.successMessage}>{message}</Text>
          </>
        )}
        
        {status === 'error' && (
          <>
            <View style={styles.iconContainer}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="error"
                size={64}
                color="#EF4444"
              />
            </View>
            <Text style={styles.errorMessage}>{message}</Text>
          </>
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
    paddingHorizontal: 24,
    gap: 16,
  },
  iconContainer: {
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
    textAlign: 'center',
  },
});
