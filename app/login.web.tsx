
import React, { useState } from 'react';
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
  Image,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(false);

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
        console.error('Error logging login:', error);
      } else {
        console.log('Login logged successfully');
      }
    } catch (error) {
      console.error('Error logging login:', error);
    }
  };

  const handleMagicLinkAuth = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: 'https://natively.dev/email-confirmed',
        },
      });

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert(
          'Check your email',
          'We sent you a magic link! Click the link in your email to sign in.',
          [{ text: 'OK' }]
        );
        setEmail('');
      }
    } catch (error) {
      console.error('Magic link error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordAuth = async () => {
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
            emailRedirectTo: 'https://natively.dev/email-confirmed'
          }
        });

        if (error) {
          Alert.alert('Sign Up Error', error.message);
        } else if (data.user) {
          Alert.alert(
            'Success',
            'Account created! Please check your email to verify your account before signing in.',
            [{ text: 'OK' }]
          );
          setIsSignUp(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          Alert.alert('Sign In Error', error.message);
        } else if (data.user) {
          await logLogin(data.user.id);
          router.replace('/(tabs)/(home)');
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
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
          {/* App Icon */}
          <View style={styles.iconContainer}>
            <Image
              source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
              style={styles.appIcon}
              resizeMode="contain"
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>Recall</Text>
          <Text style={styles.subtitle}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Text>

          {/* Auth Method Toggle */}
          {!isSignUp && (
            <View style={styles.authMethodToggle}>
              <Pressable
                onPress={() => setUseMagicLink(false)}
                style={[
                  styles.authMethodButton,
                  !useMagicLink && styles.authMethodButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.authMethodText,
                    !useMagicLink && styles.authMethodTextActive,
                  ]}
                >
                  Password
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setUseMagicLink(true)}
                style={[
                  styles.authMethodButton,
                  useMagicLink && styles.authMethodButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.authMethodText,
                    useMagicLink && styles.authMethodTextActive,
                  ]}
                >
                  Magic Link
                </Text>
              </Pressable>
            </View>
          )}

          {/* Input Fields */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <IconSymbol name="envelope.fill" size={20} color={colors.textSecondary} />
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

            {!useMagicLink && (
              <View style={styles.inputWrapper}>
                <IconSymbol name="lock.fill" size={20} color={colors.textSecondary} />
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
            )}
          </View>

          {/* Forgot Password Link - Only show when using password and not in sign up mode */}
          {!isSignUp && !useMagicLink && (
            <Pressable
              onPress={handleForgotPassword}
              disabled={loading}
              style={styles.forgotPasswordButton}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </Pressable>
          )}

          {/* Auth Button */}
          <View style={styles.buttonContainer}>
            <Pressable
              onPress={useMagicLink ? handleMagicLinkAuth : handlePasswordAuth}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {useMagicLink
                    ? 'Send Magic Link'
                    : isSignUp
                    ? 'Sign Up'
                    : 'Sign In'}
                </Text>
              )}
            </Pressable>

            {!useMagicLink && (
              <Pressable
                onPress={() => setIsSignUp(!isSignUp)}
                disabled={loading}
                style={styles.switchButton}
              >
                <Text style={styles.switchButtonText}>
                  {isSignUp
                    ? 'Already have an account? Sign In'
                    : "Don't have an account? Sign Up"}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Magic Link Info */}
          {useMagicLink && (
            <View style={styles.infoContainer}>
              <IconSymbol
                name="info.circle.fill"
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.infoText}>
                We&apos;ll send you a secure link to sign in without a password
              </Text>
            </View>
          )}
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
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: colors.textSecondary,
    marginBottom: 32,
  },
  authMethodToggle: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  authMethodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  authMethodButtonActive: {
    backgroundColor: colors.primary,
  },
  authMethodText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  authMethodTextActive: {
    color: '#FFFFFF',
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
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
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  switchButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
