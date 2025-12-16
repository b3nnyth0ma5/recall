
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function UpdatePasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  
  // Use ref to prevent multiple verifications
  const hasVerifiedRef = useRef(false);
  const isVerifyingRef = useRef(false);

  useEffect(() => {
    // Prevent multiple simultaneous verifications
    if (hasVerifiedRef.current || isVerifyingRef.current) {
      console.log('[UpdatePassword] Already verified or verifying, skipping...');
      return;
    }

    const tokenHash = params.token_hash as string;
    const type = params.type as string;

    // Check if user has a valid recovery session
    const checkSession = async () => {
      try {
        isVerifyingRef.current = true;
        
        console.log('[UpdatePassword] Checking session with params:', {
          hasTokenHash: !!tokenHash,
          hasType: !!type,
        });

        if (tokenHash && type) {
          console.log('[UpdatePassword] Found token_hash in URL, verifying OTP...');
          console.log('[UpdatePassword] Token hash length:', tokenHash.length);
          console.log('[UpdatePassword] Type:', type);
          
          // Verify the OTP token to establish a session
          // This is the critical step that creates a session from the password reset token
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });

          if (error) {
            console.error('[UpdatePassword] Error verifying OTP:', error);
            console.error('[UpdatePassword] Error code:', error.code);
            console.error('[UpdatePassword] Error message:', error.message);
            console.error('[UpdatePassword] Error status:', error.status);
            
            // Mark as verified to prevent retries
            hasVerifiedRef.current = true;
            
            Alert.alert(
              'Invalid Link',
              'This password reset link is invalid or has expired. Please request a new one.',
              [
                {
                  text: 'OK',
                  onPress: () => router.replace('/login'),
                },
              ]
            );
            setIsValidSession(false);
            setCheckingSession(false);
            return;
          }

          if (!data.session) {
            console.error('[UpdatePassword] OTP verified but no session returned');
            
            // Mark as verified to prevent retries
            hasVerifiedRef.current = true;
            
            Alert.alert(
              'Session Error',
              'Unable to establish a session. Please request a new password reset link.',
              [
                {
                  text: 'OK',
                  onPress: () => router.replace('/login'),
                },
              ]
            );
            setIsValidSession(false);
            setCheckingSession(false);
            return;
          }

          console.log('[UpdatePassword] OTP verified successfully, session established');
          console.log('[UpdatePassword] Session user:', data.session.user.email);
          console.log('[UpdatePassword] Session access token present:', !!data.session.access_token);
          console.log('[UpdatePassword] Session refresh token present:', !!data.session.refresh_token);
          
          // Calculate actual expiry time
          const expiresAt = data.session.expires_at;
          const expiresIn = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : 0;
          
          console.log('[UpdatePassword] Session expires at (timestamp):', expiresAt);
          console.log('[UpdatePassword] Session expires in:', expiresIn, 'seconds');
          console.log('[UpdatePassword] Session expires at (date):', expiresAt ? new Date(expiresAt * 1000).toISOString() : 'unknown');
          
          // Verify the session was properly stored
          const { data: { session: storedSession }, error: sessionCheckError } = await supabase.auth.getSession();
          
          if (sessionCheckError) {
            console.error('[UpdatePassword] Error checking stored session:', sessionCheckError);
          } else if (storedSession) {
            console.log('[UpdatePassword] Session successfully stored and retrieved');
            console.log('[UpdatePassword] Stored session user:', storedSession.user.email);
          } else {
            console.warn('[UpdatePassword] Session was not stored properly');
          }
          
          // Mark as successfully verified
          hasVerifiedRef.current = true;
          
          // Session is now established and will be valid for the configured JWT expiry time
          // By default, this is 3600 seconds (60 minutes)
          setIsValidSession(true);
          setCheckingSession(false);
          return;
        }

        // If no token_hash in URL, check if there's already a valid session
        console.log('[UpdatePassword] No token_hash in URL, checking existing session...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[UpdatePassword] Error checking session:', sessionError);
          
          // Mark as verified to prevent retries
          hasVerifiedRef.current = true;
          
          Alert.alert(
            'Session Error',
            'Unable to verify your session. Please request a new password reset link.',
            [
              {
                text: 'OK',
                onPress: () => router.replace('/login'),
              },
            ]
          );
          setIsValidSession(false);
        } else if (session) {
          console.log('[UpdatePassword] Valid session found');
          console.log('[UpdatePassword] Session user:', session.user.email);
          
          const expiresAt = session.expires_at;
          const expiresIn = expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : 0;
          
          console.log('[UpdatePassword] Session expires at (timestamp):', expiresAt);
          console.log('[UpdatePassword] Session expires in:', expiresIn, 'seconds');
          console.log('[UpdatePassword] Session expires at (date):', expiresAt ? new Date(expiresAt * 1000).toISOString() : 'unknown');
          
          // Mark as verified
          hasVerifiedRef.current = true;
          
          setIsValidSession(true);
        } else {
          console.log('[UpdatePassword] No session found');
          
          // Mark as verified to prevent retries
          hasVerifiedRef.current = true;
          
          Alert.alert(
            'Invalid Link',
            'This password reset link is invalid or has expired. Please request a new one.',
            [
              {
                text: 'OK',
                onPress: () => router.replace('/login'),
              },
            ]
          );
          setIsValidSession(false);
        }
      } catch (error) {
        console.error('[UpdatePassword] Exception checking session:', error);
        if (error instanceof Error) {
          console.error('[UpdatePassword] Error name:', error.name);
          console.error('[UpdatePassword] Error message:', error.message);
          console.error('[UpdatePassword] Error stack:', error.stack);
        }
        
        // Mark as verified to prevent retries
        hasVerifiedRef.current = true;
        
        Alert.alert(
          'Error',
          'An unexpected error occurred. Please try again.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/login'),
            },
          ]
        );
        setIsValidSession(false);
      } finally {
        isVerifyingRef.current = false;
        setCheckingSession(false);
      }
    };

    checkSession();
  }, [params.token_hash, params.type, router]); // Include all dependencies

  // Helper function to get user-friendly error message based on error code and message
  const getPasswordUpdateErrorMessage = (error: any): string => {
    console.log('[UpdatePassword] Processing error:', {
      code: error.code,
      message: error.message,
      status: error.status,
    });

    // Check error code first (most reliable)
    if (error.code) {
      switch (error.code) {
        case 'weak_password':
        case 'password_too_short':
          return 'Your password is too weak. Please choose a stronger password with at least 6 characters.';
        
        case 'same_password':
          return 'Your new password cannot be the same as your current password. Please choose a different password.';
        
        case 'session_not_found':
        case 'invalid_credentials':
          return 'Your session has expired. Please request a new password reset link.';
        
        case 'over_request_rate_limit':
        case 'too_many_requests':
          return 'Too many password update attempts. Please wait a few minutes and try again.';
        
        case 'user_not_found':
          return 'User account not found. Please contact support if this issue persists.';
        
        case 'otp_expired':
        case 'otp_disabled':
          return 'Your password reset link has expired. Please request a new one.';
        
        default:
          // Fall through to message-based matching
          break;
      }
    }

    // Check error message for common patterns
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('password') && (message.includes('short') || message.includes('6 character'))) {
      return 'Password must be at least 6 characters long.';
    }
    
    if (message.includes('weak') || message.includes('strength')) {
      return 'Your password is too weak. Please choose a stronger password.';
    }
    
    if (message.includes('same') && message.includes('password')) {
      return 'Your new password cannot be the same as your current password.';
    }
    
    if (message.includes('session') && (message.includes('expired') || message.includes('invalid'))) {
      return 'Your session has expired. Please request a new password reset link.';
    }
    
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'Too many password update attempts. Please wait a few minutes and try again.';
    }
    
    if (message.includes('expired') || message.includes('invalid')) {
      return 'Your password reset link has expired or is invalid. Please request a new one.';
    }

    // Check HTTP status codes
    if (error.status === 422) {
      return 'Unable to process your password update. Please ensure your password meets all requirements.';
    }
    
    if (error.status === 429) {
      return 'Too many password update attempts. Please wait a few minutes and try again.';
    }
    
    if (error.status === 403) {
      return 'Your password reset link has expired. Please request a new one.';
    }
    
    if (error.status === 500) {
      return 'A server error occurred. Please try again later or contact support.';
    }

    // Default fallback with the original error message
    return error.message || 'Failed to update password. Please try again.';
  };

  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert('Error', 'Please enter and confirm your new password');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    try {
      setLoading(true);

      console.log('[UpdatePassword] Updating password...');
      
      // Verify session is still valid before updating
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('[UpdatePassword] Session invalid or expired:', sessionError);
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please request a new password reset link.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/login'),
            },
          ]
        );
        return;
      }
      
      console.log('[UpdatePassword] Session valid, proceeding with password update');
      console.log('[UpdatePassword] Session user:', session.user.email);
      
      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.error('[UpdatePassword] Password update error:', error);
        console.error('[UpdatePassword] Error code:', error.code);
        console.error('[UpdatePassword] Error message:', error.message);
        console.error('[UpdatePassword] Error status:', error.status);
        
        // Get user-friendly error message
        const friendlyErrorMessage = getPasswordUpdateErrorMessage(error);
        
        Alert.alert('Password Update Failed', friendlyErrorMessage);
      } else {
        console.log('[UpdatePassword] Password updated successfully');
        console.log('[UpdatePassword] Updated user:', data.user?.email);
        
        Alert.alert(
          'Success',
          'Your password has been updated successfully. You can now sign in with your new password.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Sign out the user so they can sign in with new password
                console.log('[UpdatePassword] Signing out user...');
                supabase.auth.signOut().then(() => {
                  console.log('[UpdatePassword] User signed out, redirecting to login');
                  router.replace('/login');
                }).catch((err) => {
                  console.error('[UpdatePassword] Error signing out:', err);
                  // Still redirect to login even if sign out fails
                  router.replace('/login');
                });
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('[UpdatePassword] Password update exception:', error);
      if (error instanceof Error) {
        console.error('[UpdatePassword] Error name:', error.name);
        console.error('[UpdatePassword] Error message:', error.message);
        console.error('[UpdatePassword] Error stack:', error.stack);
      }
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen
          options={{
            headerShown: false,
          }}
        />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Verifying link...</Text>
      </View>
    );
  }

  if (!isValidSession) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Update Password',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerLeft: () => null,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <IconSymbol
              ios_icon_name="lock.shield"
              android_material_icon_name="lock"
              size={64}
              color={colors.primary}
            />
          </View>

          {/* Title and Description */}
          <Text style={styles.title}>Create New Password</Text>
          <Text style={styles.description}>
            Enter your new password below. Make sure it&apos;s at least 6 characters long.
          </Text>

          {/* Password Inputs */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <IconSymbol
                ios_icon_name="lock.fill"
                android_material_icon_name="lock"
                size={20}
                color={colors.textSecondary}
              />
              <TextInput
                style={styles.input}
                placeholder="New Password"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password-new"
              />
            </View>

            <View style={styles.inputWrapper}>
              <IconSymbol
                ios_icon_name="lock.fill"
                android_material_icon_name="lock"
                size={20}
                color={colors.textSecondary}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm New Password"
                placeholderTextColor={colors.textTertiary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="password-new"
              />
            </View>
          </View>

          {/* Update Button */}
          <Pressable
            onPress={handleUpdatePassword}
            disabled={loading}
            style={[styles.button, loading && styles.buttonDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Update Password</Text>
            )}
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 24,
  },
  inputContainer: {
    width: '100%',
    gap: 16,
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16 * 1.15,
    paddingVertical: 14 * 1.15,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52 * 1.1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    minHeight: 24 * 1.1,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16 * 1.15,
    paddingHorizontal: 24 * 1.15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
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
});
