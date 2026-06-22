
import React, { useState, useEffect } from 'react';
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
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { AUTH_REDIRECT_URLS } from '@/constants/config';

export default function LoginScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  const logLogin = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('login_history')
        .insert([
          {
            user_id: userId,
            login_at: new Date().toISOString(),
          },
        ]);

      if (error) {
        console.error('[Login] Error logging login:', error);
      } else {
        console.log('[Login] Login logged successfully');
      }
    } catch (error) {
      console.error('[Login] Error logging login:', error);
    }
  };

  const handlePasswordAuth = async () => {
    console.log('[Login] Password auth button pressed, isSignUp:', isSignUp);
    if (isSignUp && !name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    try {
      setLoading(true);

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: AUTH_REDIRECT_URLS.EMAIL_CONFIRMED,
            data: name.trim() ? { full_name: name.trim() } : undefined,
          },
        });

        if (error) {
          Alert.alert('Sign Up Error', error.message);
        } else if (data.user) {
          console.log('[Login] Sign-up successful for:', data.user.id, '— routing handled by _layout.tsx');
          // _layout.tsx will detect the unverified session and route to /verify-email automatically.
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          Alert.alert('Sign In Error', error.message);
        } else if (data.user) {
          console.log('[Login] User signed in successfully:', data.user.id);
          await logLogin(data.user.id);
          // Don't navigate here - let _layout.tsx handle routing based on onboarding status
          console.log('[Login] Waiting for _layout.tsx to handle navigation');
        }
      }
    } catch (error) {
      console.error('[Login] Auth error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    console.log('[Login] Apple sign-in button pressed');
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        console.log('[Apple] No identity token returned');
        Alert.alert('Sign In Error', 'No identity token returned from Apple');
        return;
      }

      console.log('[Login] Apple credential received, exchanging with Supabase');
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) {
        console.error('[Apple] Supabase sign-in error:', error.message);
        Alert.alert('Sign In Error', error.message);
        return;
      }

      if (data.user) {
        console.log('[Login] Apple sign-in successful:', data.user.id);

        // Apple only returns fullName on FIRST sign-in. Persist it.
        const appleFullName = [credential.fullName?.givenName, credential.fullName?.familyName]
          .filter(Boolean)
          .join(' ')
          .trim();

        if (appleFullName && !data.user.user_metadata?.full_name) {
          console.log('[Apple] Persisting full_name to Supabase user_metadata:', appleFullName);
          const { error: updateError } = await supabase.auth.updateUser({
            data: { full_name: appleFullName },
          });
          if (updateError) {
            console.error('[Apple] Failed to persist full_name:', updateError.message);
          } else {
            console.log('[Apple] full_name persisted successfully');
          }
        }

        await logLogin(data.user.id);
        // _layout.tsx handles routing on auth state change
      }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') {
        console.log('[Login] Apple sign-in cancelled by user');
        return;
      }
      console.error('[Login] Apple sign-in error:', e);
      Alert.alert('Error', 'An unexpected error occurred during Apple sign-in');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    console.log('[Login] Forgot password pressed');
    router.push('/reset-password');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Logo block: icon + title centred together */}
          <View style={styles.logoBlock}>
            <View style={styles.iconContainer}>
              <Image
                source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
                style={styles.appIcon}
                contentFit="contain"
              />
            </View>
            <Text style={styles.title}>Recall</Text>
          </View>

          <Text style={styles.subtitle}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Text>

          {/* Apple Sign In — Apple HIG Guideline 4.8: must be first social option */}
          {appleAvailable && (
            <View style={styles.appleSection}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={isSignUp
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={12}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or continue with email</Text>
                <View style={styles.dividerLine} />
              </View>
            </View>
          )}

          {/* Input Fields */}
          <View style={styles.inputContainer}>
            {isSignUp && (
              <View style={styles.inputWrapper}>
                <IconSymbol
                  ios_icon_name="person.fill"
                  android_material_icon_name="person"
                  size={20}
                  color={colors.textSecondary}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoComplete="name"
                  returnKeyType="next"
                />
              </View>
            )}

            <View style={styles.inputWrapper}>
              <IconSymbol
                ios_icon_name="envelope.fill"
                android_material_icon_name="email"
                size={20}
                color={colors.textSecondary}
              />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
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
                placeholder="Password"
                placeholderTextColor={colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>
          </View>

          {/* Forgot Password Link - Only show when not in sign up mode */}
          {!isSignUp && (
            <Pressable
              onPress={handleForgotPassword}
              disabled={loading}
              style={styles.forgotPasswordButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </Pressable>
          )}

          {/* Auth Button */}
          <View style={styles.buttonContainer}>
            <Pressable
              onPress={handlePasswordAuth}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {isSignUp ? 'Sign Up' : 'Sign In'}
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                console.log('[Login] Toggle sign-up mode:', !isSignUp);
                setIsSignUp(prev => !prev);
              }}
              disabled={loading}
              style={styles.switchButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.switchButtonText}>
                {isSignUp
                  ? 'Already have an account? Sign In'
                  : "Don't have an account? Sign Up"}
              </Text>
            </Pressable>


          </View>
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
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logoBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: {
    width: 100,
    height: 100,
    borderRadius: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },
  inputContainer: {
    width: '100%',
    gap: 16,
    marginBottom: 8,
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
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
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
  switchButton: {
    paddingVertical: 12 * 1.15,
    alignItems: 'center',
  },
  switchButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginHorizontal: 12,
    fontWeight: '500',
  },
  appleSection: {
    width: '100%',
    marginBottom: 24,
    gap: 16,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
});
