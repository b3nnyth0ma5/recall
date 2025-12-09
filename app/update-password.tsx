
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
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function UpdatePasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // Check if user has a valid recovery session
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error checking session:', error);
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
        } else if (session) {
          console.log('Valid recovery session found');
          setIsValidSession(true);
        } else {
          console.log('No session found');
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
        console.error('Exception checking session:', error);
        setIsValidSession(false);
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, [router]);

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

      const { data, error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        console.error('Password update error:', error);
        Alert.alert('Error', error.message);
      } else {
        console.log('Password updated successfully');
        Alert.alert(
          'Success',
          'Your password has been updated successfully. You can now sign in with your new password.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Sign out the user so they can sign in with new password
                supabase.auth.signOut().then(() => {
                  router.replace('/login');
                }).catch((err) => {
                  console.error('Error signing out:', err);
                  router.replace('/login');
                });
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Password update exception:', error);
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
