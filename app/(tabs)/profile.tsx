
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, TextInput, ActivityIndicator } from 'react-native';
import RecallHeader from '@/components/RecallHeader';
import { ChevronLeft } from 'lucide-react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/utils/supabase';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useScrollToTop } from '@/contexts/ScrollToTopContext';



export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const { registerScrollToTop } = useScrollToTop();
  
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const unregister = registerScrollToTop('profile', () => {
      console.log('[ProfileScreen] Scroll to top triggered');
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
    return unregister;
  }, [registerScrollToTop]);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleBackPress = () => {
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
    
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/(home)');
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/login');
            } catch (error) {
              console.error('Error signing out:', error);
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    console.log('[Profile] Delete account button pressed');
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your recalls, photos, and data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            Alert.alert(
              'Are you sure?',
              'All your data will be permanently deleted. You cannot recover it.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Account',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      setDeleteLoading(true);
                      console.log('[Profile] Initiating account deletion');
                      const { data: { session } } = await supabase.auth.getSession();
                      if (!session) {
                        Alert.alert('Error', 'No active session found. Please sign in again.');
                        return;
                      }
                      const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string;
                      console.log('[Profile] Calling delete-account edge function');
                      const response = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${session.access_token}`,
                          'Content-Type': 'application/json',
                        },
                      });
                      const result = await response.json();
                      if (!response.ok) {
                        throw new Error(result.error || 'Failed to delete account');
                      }
                      console.log('[Profile] Account deleted successfully, signing out');
                      await signOut();
                      router.replace('/login');
                    } catch (error) {
                      console.error('[Profile] Delete account error:', error);
                      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete account. Please try again.');
                    } finally {
                      setDeleteLoading(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      Alert.alert('Error', 'Please fill in all password fields');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    try {
      setPasswordLoading(true);

      // First, verify the current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });

      if (signInError) {
        Alert.alert('Error', 'Current password is incorrect');
        return;
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('[Profile] Password update error:', updateError);
        Alert.alert('Error', updateError.message);
      } else {
        console.log('[Profile] Password updated successfully');
        
        // Haptic feedback
        if (Platform.OS !== 'web') {
          try {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            console.error('Error triggering haptic feedback:', error);
          }
        }

        Alert.alert(
          'Success',
          'Your password has been updated successfully.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Reset form
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
                setShowPasswordChange(false);
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('[Profile] Password update exception:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable
              onPress={() => {
                console.log('[Profile] Back chevron tapped');
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/(tabs)/(home)');
                }
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ marginLeft: 8 }}
              android_ripple={null}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.25)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={20} color="#FFFFFF" />
              </View>
            </Pressable>
          ),
          headerTitle: () => <RecallHeader />,
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
        }}
      />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* User Info Section */}
        <View style={styles.section}>
          <View style={styles.userInfoContainer}>
            <View style={styles.avatarContainer}>
              <IconSymbol name="person.circle.fill" size={80} color={colors.primary} />
            </View>
            {(() => {
              const fullName = (user?.user_metadata?.full_name || user?.user_metadata?.display_name || '').trim();
              if (fullName) {
                return (
                  <>
                    <Text style={styles.userName}>{fullName}</Text>
                    {user?.email && <Text style={styles.userEmailSecondary}>{user.email}</Text>}
                  </>
                );
              }
              return <Text style={styles.userEmail}>{user?.email || 'Not signed in'}</Text>;
            })()}
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="lock.shield" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Security</Text>
          </View>

          {/* Change Password Toggle */}
          <Pressable 
            onPress={() => {
              setShowPasswordChange(!showPasswordChange);
              if (showPasswordChange) {
                // Reset form when closing
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
              }
            }}
            style={styles.passwordToggleButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.passwordToggleLeft}>
              <IconSymbol name="key.fill" size={20} color={colors.primary} />
              <Text style={styles.passwordToggleText}>Change Password</Text>
            </View>
            <IconSymbol 
              name={showPasswordChange ? "chevron.up" : "chevron.down"} 
              size={20} 
              color={colors.textSecondary} 
            />
          </Pressable>

          {/* Password Change Form */}
          {showPasswordChange && (
            <View style={styles.passwordChangeForm}>
              <Text style={styles.passwordFormDescription}>
                Update your password to keep your account secure
              </Text>

              <View style={styles.passwordInputContainer}>
                <View style={styles.inputWrapper}>
                  <IconSymbol
                    ios_icon_name="lock.fill"
                    android_material_icon_name="lock"
                    size={18}
                    color={colors.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Current Password"
                    placeholderTextColor={colors.textTertiary}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    autoComplete="password"
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <IconSymbol
                    ios_icon_name="lock.fill"
                    android_material_icon_name="lock"
                    size={18}
                    color={colors.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="New Password"
                    placeholderTextColor={colors.textTertiary}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    autoComplete="password-new"
                  />
                </View>

                <View style={styles.inputWrapper}>
                  <IconSymbol
                    ios_icon_name="lock.fill"
                    android_material_icon_name="lock"
                    size={18}
                    color={colors.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm New Password"
                    placeholderTextColor={colors.textTertiary}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    secureTextEntry
                    autoComplete="password-new"
                  />
                </View>
              </View>

              <Pressable
                onPress={handleChangePassword}
                disabled={passwordLoading}
                style={[styles.updatePasswordButton, passwordLoading && styles.buttonDisabled]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {passwordLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <IconSymbol name="checkmark.circle.fill" size={18} color="#FFFFFF" />
                    <Text style={styles.updatePasswordButtonText}>Update Password</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconSymbol name="person" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Account</Text>
          </View>

          <Pressable 
            onPress={handleSignOut} 
            style={styles.signOutButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <IconSymbol name="arrow.right.square" size={20} color={colors.error} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>

          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleteLoading}
            style={[styles.deleteAccountButton, deleteLoading && styles.buttonDisabled]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {deleteLoading ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <IconSymbol name="trash" size={20} color={colors.error} />
            )}
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </Pressable>
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appInfoText}>Recall App v{Constants.expoConfig?.version ?? '1.0.0'} ({Constants.nativeBuildVersion ?? 'dev'})</Text>
          <Text style={styles.appInfoText}>© 2024 Recall. All rights reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 128,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  userInfoContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginTop: 8,
  },
  userEmailSecondary: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  passwordToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  passwordToggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  passwordChangeForm: {
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordFormDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  passwordInputContainer: {
    gap: 12,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    minHeight: 20,
  },
  updatePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  updatePasswordButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error,
    marginTop: 12,
  },
  deleteAccountText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
  },
  appInfo: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  appInfoText: {
    fontSize: 12,
    color: colors.textTertiary,
  },
});
