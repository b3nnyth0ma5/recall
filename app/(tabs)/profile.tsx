
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, batchUploadImagesToCloudflare } from '@/utils/supabase';
import { IconSymbol } from '@/components/IconSymbol';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colors } from '@/styles/commonStyles';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  button: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: colors.error,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.text,
  },
  batchUploadSection: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  batchUploadTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  batchUploadDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  batchUploadResults: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  resultText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  successText: {
    color: colors.success,
  },
  errorText: {
    color: colors.error,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 16,
    color: colors.text,
  },
});

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{
    processed: number;
    updated: number;
    failed: number;
    errors: Array<{ imageId: string; error: string }>;
  } | null>(null);

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
            await signOut();
            router.replace('/login');
          },
        },
      ]
    );
  };

  const handleBatchUpload = async () => {
    Alert.alert(
      'Batch Upload to Cloudflare',
      'This will upload all images without CDN URLs to Cloudflare. This may take a few minutes. Continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Start Upload',
          onPress: async () => {
            setIsUploading(true);
            setUploadResults(null);

            try {
              console.log('Starting batch upload...');
              const results = await batchUploadImagesToCloudflare(100);
              
              setUploadResults(results);
              
              if (results.success) {
                Alert.alert(
                  'Upload Complete',
                  `Successfully uploaded ${results.updated} images.\n${results.failed > 0 ? `Failed: ${results.failed}` : ''}`,
                  [{ text: 'OK' }]
                );
              } else {
                Alert.alert(
                  'Upload Failed',
                  'There was an error during the batch upload. Check the results below.',
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              console.error('Error in batch upload:', error);
              Alert.alert(
                'Error',
                'An unexpected error occurred during the batch upload.',
                [{ text: 'OK' }]
              );
            } finally {
              setIsUploading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Profile',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView style={styles.container}>
        <Animated.View entering={FadeIn} style={styles.content}>
          {/* User Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email || 'Not available'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>User ID</Text>
              <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
                {user?.id || 'Not available'}
              </Text>
            </View>
          </View>

          {/* Batch Upload Section */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
            <Text style={styles.sectionTitle}>Image Management</Text>
            <View style={styles.batchUploadSection}>
              <Text style={styles.batchUploadTitle}>Batch Upload to Cloudflare</Text>
              <Text style={styles.batchUploadDescription}>
                Upload all images that don&apos;t have a CDN URL to Cloudflare. 
                This will improve loading times and reduce database storage.
              </Text>
              
              {isUploading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingText}>Uploading images...</Text>
                </View>
              ) : (
                <Pressable
                  style={[styles.button, styles.secondaryButton]}
                  onPress={handleBatchUpload}
                >
                  <Text style={[styles.buttonText, styles.secondaryButtonText]}>
                    Start Batch Upload
                  </Text>
                </Pressable>
              )}

              {uploadResults && (
                <View style={styles.batchUploadResults}>
                  <Text style={[styles.resultText, styles.successText]}>
                    Processed: {uploadResults.processed}
                  </Text>
                  <Text style={[styles.resultText, styles.successText]}>
                    Updated: {uploadResults.updated}
                  </Text>
                  {uploadResults.failed > 0 && (
                    <>
                      <Text style={[styles.resultText, styles.errorText]}>
                        Failed: {uploadResults.failed}
                      </Text>
                      {uploadResults.errors.length > 0 && (
                        <Text style={[styles.resultText, styles.errorText]}>
                          First error: {uploadResults.errors[0].error}
                        </Text>
                      )}
                    </>
                  )}
                </View>
              )}
            </View>
          </Animated.View>

          {/* Actions Section */}
          <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <Pressable
              style={[styles.button, styles.dangerButton]}
              onPress={handleSignOut}
            >
              <Text style={styles.buttonText}>Sign Out</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </>
  );
}
