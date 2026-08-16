
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Platform, TextInput, ActivityIndicator, Modal, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RecallHeader from '@/components/RecallHeader';

import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
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
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

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
    console.log('[Profile] Sign out button pressed');
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
            console.log('[Profile] Sign out confirmed');
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

  const dismissDeleteModal = () => {
    console.log('[Profile] Delete confirmation modal dismissed');
    setDeleteConfirmInput('');
    setShowDeleteConfirmModal(false);
  };

  const performAccountDeletion = async () => {
    console.log('[Profile] Typed confirmation accepted, initiating account deletion');
    setDeleteConfirmInput('');
    setShowDeleteConfirmModal(false);
    try {
      setDeleteLoading(true);
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
          onPress: () => {
            console.log('[Profile] First delete alert confirmed, opening typed confirmation modal');
            setShowDeleteConfirmModal(true);
          },
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    console.log('[Profile] Change password button pressed');
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

  const [onDeviceNer, setOnDeviceNer] = useState(false);
  const [onDeviceAnswer, setOnDeviceAnswer] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('search_ner_ondevice').then(val => {
      if (val === 'true') setOnDeviceNer(true);
    });
    AsyncStorage.getItem('search_answer_ondevice').then(val => {
      if (val === 'true') setOnDeviceAnswer(true);
    });
  }, []);

  const handleOnDeviceNerToggle = (value: boolean) => {
    console.log('[Profile] On-device NER toggle changed:', value);
    setOnDeviceNer(value);
    AsyncStorage.setItem('search_ner_ondevice', value ? 'true' : 'false');
  };

  const handleOnDeviceAnswerToggle = (value: boolean) => {
    console.log('[Profile] On-device answer generation toggle changed:', value);
    setOnDeviceAnswer(value);
    AsyncStorage.setItem('search_answer_ondevice', value ? 'true' : 'false');
  };

  const deleteButtonEnabled = deleteConfirmInput.trim() === 'DELETE';

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
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
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
              console.log('[Profile] Change password toggle pressed');
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

        {/* Search Section — iOS only */}
        {Platform.OS === 'ios' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <IconSymbol name="magnifyingglass" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Search</Text>
            </View>

            {/* On-device NER toggle */}
            <View style={styles.searchToggleRow}>
              <View style={styles.searchToggleLeft}>
                <IconSymbol name="text.alignleft" size={20} color={colors.primary} />
                <View style={styles.searchToggleLabelBlock}>
                  <Text style={styles.searchToggleLabel}>On-device NER</Text>
                  <Text style={styles.searchToggleDescription}>
                    Uses on-device AI to extract names, locations, and keywords from your search query privately, without sending the query to the cloud.
                  </Text>
                </View>
              </View>
              <Switch
                value={onDeviceNer}
                onValueChange={handleOnDeviceNerToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* On-device Answer Generation toggle */}
            <View style={[styles.searchToggleRow, { marginTop: 12 }]}>
              <View style={styles.searchToggleLeft}>
                <IconSymbol name="sparkles" size={20} color={colors.primary} />
                <View style={styles.searchToggleLabelBlock}>
                  <Text style={styles.searchToggleLabel}>On-device Answer Generation</Text>
                  <Text style={styles.searchToggleDescription}>
                    Generates answers using Apple Intelligence on-device (iPhone 15 Pro or later with Apple Intelligence enabled). Faster and fully private. Falls back to cloud if unavailable.
                  </Text>
                </View>
              </View>
              <Switch
                value={onDeviceAnswer}
                onValueChange={handleOnDeviceAnswerToggle}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        )}

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

        {/* App Info — long-press version label to open auth diagnostics */}
        <View style={styles.appInfo}>
          <Pressable
            onLongPress={() => {
              console.log('[Profile] Version label long-pressed — navigating to auth diagnostics');
              router.push('/share-extension-debug');
            }}
            hitSlop={{ top: 12, bottom: 12, left: 24, right: 24 }}
          >
            <Text style={styles.appInfoText}>Recall App v{Constants.expoConfig?.version ?? '1.0.0'} ({Constants.nativeBuildVersion ?? 'dev'})</Text>
          </Pressable>
          <Text style={styles.appInfoText}>© 2024 Recall. All rights reserved.</Text>
        </View>
      </ScrollView>

      {/* Typed-confirmation delete modal */}
      <Modal
        visible={showDeleteConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={dismissDeleteModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={dismissDeleteModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Confirm Account Deletion</Text>
            <Text style={styles.modalBody}>
              This action is permanent and cannot be undone. To confirm, type DELETE below.
            </Text>

            <Text style={styles.modalInputLabel}>Type DELETE to confirm</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={deleteConfirmInput}
                onChangeText={(text) => {
                  console.log('[Profile] Delete confirmation input changed');
                  setDeleteConfirmInput(text);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                placeholder="DELETE"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel="Type DELETE to confirm account deletion"
              />
            </View>

            <View style={styles.modalButtonRow}>
              <Pressable
                onPress={dismissDeleteModal}
                style={styles.modalCancelButton}
                accessibilityRole="button"
                accessibilityLabel="Cancel account deletion"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  console.log('[Profile] Delete Account button pressed in confirmation modal');
                  performAccountDeletion();
                }}
                disabled={!deleteButtonEnabled || deleteLoading}
                style={[
                  styles.modalDeleteButton,
                  (!deleteButtonEnabled || deleteLoading) && styles.modalDeleteButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Confirm and delete account"
              >
                {deleteLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalDeleteText}>Delete Account</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
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
  // Delete confirmation modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  modalInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalDeleteButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.error,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDeleteButtonDisabled: {
    opacity: 0.4,
  },
  modalDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  searchToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  searchToggleLabelBlock: {
    flex: 1,
  },
  searchToggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  searchToggleDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

});
