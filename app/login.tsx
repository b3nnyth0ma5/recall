
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
import { Stack } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

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

  const handleAuth = async () => {
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
          console.log('[Login] User signed in successfully:', data.user.id);
          await logLogin(data.user.id);
          // Don't navigate here - let _layout.tsx handle routing based on onboarding status
          console.log('[Login] Waiting for _layout.tsx to handle navigation');
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      Alert.alert('Email Required', 'Please enter your email address to reset your password');
      return;
    }

    try {
      setLoading(true);
      console.log('[Login] Sending password reset email to:', email);

      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://natively.dev/update-password',
      });

      if (error) {
        console.error('[Login] Password reset error:', error);
        Alert.alert('Error', error.message);
      } else {
        console.log('[Login] Password reset email sent successfully');
        Alert.alert(
          'Check Your Email',
          'We&apos;ve sent you a password reset link. Please check your email and follow the instructions to reset your password.',
          [
            {
              text: 'OK',
              onPress: () => setShowResetPassword(false),
            },
          ]
        );
      }
    } catch (error) {
      console.error('[Login] Exception during password reset:', error);
      Alert.alert('Error', 'An unexpected error occurred');
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
            {showResetPassword 
              ? 'Reset your password' 
              : (isSignUp ? 'Create your account' : 'Welcome back')}
          </Text>

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

            {!showResetPassword && (
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

          {/* Auth Button */}
          <View style={styles.buttonContainer}>
            <Pressable
              onPress={showResetPassword ? handleResetPassword : handleAuth}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {showResetPassword ? 'Send Reset Link' : (isSignUp ? 'Sign Up' : 'Sign In')}
                </Text>
              )}
            </Pressable>

            {!showResetPassword && (
              <>
                <Pressable
                  onPress={() => setIsSignUp(!isSignUp)}
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

                {!isSignUp && (
                  <Pressable
                    onPress={() => setShowResetPassword(true)}
                    disabled={loading}
                    style={styles.forgotPasswordButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.forgotPasswordText}>
                      Forgot Password?
                    </Text>
                  </Pressable>
                )}
              </>
            )}

            {showResetPassword && (
              <Pressable
                onPress={() => setShowResetPassword(false)}
                disabled={loading}
                style={styles.switchButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.switchButtonText}>
                  Back to Sign In
                </Text>
              </Pressable>
            )}
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
    marginBottom: 40,
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
  forgotPasswordButton: {
    paddingVertical: 12 * 1.15,
    alignItems: 'center',
  },
  forgotPasswordText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
</write file>

Now let me create a summary document of the changes:

<write file="ASYNC_OPERATIONS_IMPLEMENTATION.md">
# Asynchronous Operations Implementation

This document describes the implementation of asynchronous operations for image uploads and recall deletion, plus password reset functionality.

## 1. Asynchronous Image Upload on Recall Creation

### Implementation Details

**Location:** `app/(tabs)/(home)/index.tsx` - `handleCreateRecallFromCombined` function

**Strategy:**
- Upload the **first image synchronously** to ensure at least one image is available immediately
- Upload **remaining images asynchronously** in the background without blocking the UI
- User sees immediate feedback and can continue using the app while images upload

**Benefits:**
- Faster perceived performance - user doesn't wait for all images to upload
- Better user experience - immediate feedback after first image uploads
- Prevents UI blocking on multi-image uploads
- Fixes the "last image fails to upload" bug by reducing concurrent operations

**Code Flow:**
```javascript
// 1. Create recall record (fast)
const recallData = await supabase.from('recalls').insert({...}).single();

// 2. Upload first image synchronously
const firstImageId = await uploadImageToDatabase(firstImageUri, recallData.id, 'image/jpeg');

// 3. Upload remaining images asynchronously (don't await)
(async () => {
  for (const remainingImage of remainingImages) {
    await uploadImageToDatabase(remainingImage, recallData.id, 'image/jpeg');
  }
})();

// 4. Refresh UI immediately (don't wait for async uploads)
await refreshNotes();
```

**Edge Functions:**
- OCR processing is automatically triggered by database triggers (`trigger-ocr-on-image-insert`)
- People finder is automatically triggered by database triggers (`trigger_people_finder_on_recall_insert`)
- All background processing happens asynchronously via `pg_net.http_post()`

## 2. Asynchronous Recall Deletion

### Implementation Details

**Location:** `app/note-editor.tsx` - `handleDelete` function

**Strategy:**
- Navigate user back to landing page **immediately** when delete is confirmed
- Perform actual deletion **asynchronously** in the background
- Refresh the notes list after deletion completes
- Any edge functions triggered by delete triggers run automatically

**Benefits:**
- Instant UI response - user doesn't wait for deletion to complete
- Better perceived performance
- Smoother navigation flow
- Edge functions run asynchronously without blocking

**Code Flow:**
```javascript
// 1. User confirms deletion
Alert.alert('Delete Recall', 'Are you sure?', [
  {
    text: 'Delete',
    onPress: async () => {
      // 2. Navigate back immediately
      router.push('/(tabs)/(home)');
      
      // 3. Delete asynchronously in background
      (async () => {
        await supabase.from('recalls').delete().eq('id', recallId);
        await refreshNotes();
      })();
    }
  }
]);
```

**Database Cascade:**
- Recall deletion automatically cascades to:
  - `recall_images` (via foreign key cascade)
  - `recall_people` (via foreign key cascade)
  - `recall_urls` (via foreign key cascade)
  - Any other related tables

**Edge Functions:**
- Any edge functions triggered by delete triggers run automatically
- All processing happens asynchronously via database triggers

## 3. Password Reset Functionality

### Implementation Details

**Location:** `app/login.tsx`

**Features:**
- "Forgot Password?" link on sign-in screen
- Dedicated password reset mode with clear UI
- Uses Supabase's native `resetPasswordForEmail` function
- Email sent with password reset link
- Redirect URL configured for password update flow

**User Flow:**
1. User clicks "Forgot Password?" on sign-in screen
2. UI switches to password reset mode (hides password field)
3. User enters email address
4. User clicks "Send Reset Link"
5. Supabase sends password reset email
6. User receives email with reset link
7. User clicks link and is redirected to update password page
8. User sets new password

**Code Implementation:**
```javascript
const handleResetPassword = async () => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://natively.dev/update-password',
  });
  
  if (!error) {
    Alert.alert('Check Your Email', 'We\'ve sent you a password reset link...');
  }
};
```

**UI States:**
- **Sign In Mode:** Email + Password fields, "Forgot Password?" link
- **Sign Up Mode:** Email + Password fields, account creation
- **Reset Password Mode:** Email field only, "Send Reset Link" button

## Performance Optimizations

### Image Upload Optimization
- **Sequential uploads with delays:** Prevents overwhelming the system
- **100ms delay between uploads:** Reduces race conditions
- **First image priority:** Ensures at least one image is always available
- **Background processing:** Remaining images upload without blocking UI

### Deletion Optimization
- **Immediate navigation:** User doesn't wait for deletion
- **Background cleanup:** All deletion happens asynchronously
- **Cascade deletes:** Database handles related record cleanup
- **Automatic refresh:** Notes list updates after deletion completes

### Database Triggers
All edge functions are triggered asynchronously via database triggers:
- `trigger-ocr-on-image-insert` - OCR processing on image insert
- `trigger_people_finder_on_recall_insert` - People detection on recall insert
- All triggers use `pg_net.http_post()` for async execution

## Testing Recommendations

### Image Upload Testing
1. Create recall with single image - verify immediate upload
2. Create recall with multiple images - verify first image uploads immediately
3. Check console logs for async upload progress
4. Verify all images appear in recall after background upload completes
5. Test with slow network to verify async behavior

### Deletion Testing
1. Delete recall - verify immediate navigation to landing page
2. Check console logs for async deletion progress
3. Verify recall is removed from list after deletion completes
4. Test with slow network to verify async behavior
5. Verify cascade deletion of images and related data

### Password Reset Testing
1. Click "Forgot Password?" - verify UI switches to reset mode
2. Enter email and send reset link - verify email is received
3. Click reset link in email - verify redirect to update password page
4. Set new password - verify can sign in with new password
5. Test with invalid email - verify error handling

## Known Limitations

### Image Upload
- First image must upload successfully before async uploads begin
- If first image fails, entire recall creation fails
- Async uploads continue even if user navigates away
- No progress indicator for background uploads

### Deletion
- No undo functionality after deletion starts
- User cannot cancel deletion once confirmed
- Background deletion continues even if app is closed
- No notification when deletion completes

### Password Reset
- Requires email verification to be enabled in Supabase
- Reset link expires after 24 hours (Supabase default)
- No custom email template configuration in code
- Redirect URL must be configured in Supabase dashboard

## Future Enhancements

### Potential Improvements
1. **Upload Progress:** Show progress indicator for background image uploads
2. **Retry Logic:** Automatically retry failed uploads
3. **Undo Deletion:** Add undo functionality with timeout
4. **Deletion Notification:** Show toast when deletion completes
5. **Custom Email Templates:** Configure password reset email template
6. **Batch Upload:** Upload multiple images in parallel with rate limiting
7. **Upload Queue:** Implement upload queue with retry and error handling

## Configuration

### Supabase Settings
- **Email Templates:** Configure in Supabase Dashboard > Authentication > Email Templates
- **Redirect URLs:** Add `https://natively.dev/update-password` to allowed redirect URLs
- **Email Provider:** Configure email provider in Supabase Dashboard
- **Rate Limits:** Default Supabase rate limits apply to password reset emails

### Environment Variables
No additional environment variables required - uses existing Supabase configuration.

## Conclusion

These asynchronous operations significantly improve the user experience by:
- Reducing perceived wait times
- Providing immediate feedback
- Allowing users to continue using the app while operations complete
- Maintaining data integrity through proper error handling
- Leveraging database triggers for automatic background processing

The password reset functionality provides a complete, secure password recovery flow using Supabase's native authentication features.
