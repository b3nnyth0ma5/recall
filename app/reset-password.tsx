
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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://natively.dev/update-password',
      });

      if (error) {
        console.error('Password reset error:', error);
        Alert.alert('Error', error.message);
      } else {
        console.log('Password reset email sent successfully');
        setEmailSent(true);
        Alert.alert(
          'Check Your Email',
          'We have sent you a password reset link. Please check your email and click the link to reset your password.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Password reset exception:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Reset Password',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerShadowVisible: false,
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
              ios_icon_name="lock.rotation"
              android_material_icon_name="lock_reset"
              size={64}
              color={colors.primary}
            />
          </View>

          {/* Title and Description */}
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.description}>
            Enter your email address and we&apos;ll send you a link to reset your password.
          </Text>

          {/* Email Input */}
          <View style={styles.inputContainer}>
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
                editable={!emailSent}
              />
            </View>
          </View>

          {/* Reset Button */}
          <Pressable
            onPress={handleResetPassword}
            disabled={loading || emailSent}
            style={[
              styles.button,
              (loading || emailSent) && styles.buttonDisabled,
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>
                {emailSent ? 'Email Sent' : 'Send Reset Link'}
              </Text>
            )}
          </Pressable>

          {/* Back to Login */}
          <Pressable
            onPress={() => router.back()}
            disabled={loading}
            style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backButtonText}>Back to Login</Text>
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
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backButton: {
    paddingVertical: 12 * 1.15,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
});
