
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as ImagePicker from 'expo-image-picker';
import { supabase, uploadImageToStorage, getImageUrl, deleteImageFromStorage } from '@/utils/supabase';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

interface PolicyInfo {
  policyname: string;
  tablename: string;
  cmd: string;
  qual: string;
  with_check: string;
}

interface BucketInfo {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
}

export default function StorageTestScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [bucketInfo, setBucketInfo] = useState<BucketInfo | null>(null);
  const [policies, setPolicies] = useState<PolicyInfo[]>([]);
  const [testImagePath, setTestImagePath] = useState<string | null>(null);
  const [testImageUrl, setTestImageUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    checkBucketPolicies();
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    console.log('Current session:', session ? 'Active' : 'None');
  };

  const checkBucketPolicies = async () => {
    try {
      setLoading(true);
      console.log('=== Checking Storage Bucket Policies ===');

      // Check if bucket exists
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
      
      if (bucketsError) {
        console.error('Error listing buckets:', bucketsError);
        Alert.alert('Error', `Failed to list buckets: ${bucketsError.message}`);
        return;
      }

      console.log('Available buckets:', buckets?.map(b => b.name).join(', '));
      
      const recallImagesBucket = buckets?.find(b => b.name === 'recall-images');
      
      if (recallImagesBucket) {
        setBucketInfo(recallImagesBucket);
        console.log('Bucket info:', recallImagesBucket);
        console.log('Bucket is public:', recallImagesBucket.public);
      } else {
        console.error('recall-images bucket not found!');
        Alert.alert('Error', 'The recall-images bucket does not exist. Please create it in Supabase Dashboard.');
        return;
      }

      // Try to list files in the bucket to test access
      try {
        const { data: files, error: listError } = await supabase.storage
          .from('recall-images')
          .list('', { limit: 1 });

        if (listError) {
          console.log('Cannot list files in bucket:', listError.message);
          console.log('This might indicate missing SELECT policy');
        } else {
          console.log('Successfully listed files in bucket. File count:', files?.length || 0);
        }
      } catch (listErr) {
        console.log('Error testing bucket access:', listErr);
      }

      // Note: Direct policy queries require admin access
      console.log('Note: Policy details require admin access to view directly');
      console.log('You can check policies in Supabase Dashboard: Storage → recall-images → Policies');

    } catch (error) {
      console.error('Error checking bucket policies:', error);
      Alert.alert('Error', 'Failed to check bucket policies');
    } finally {
      setLoading(false);
    }
  };

  const testImageUpload = async () => {
    try {
      if (!session) {
        Alert.alert('Error', 'You must be logged in to upload images');
        return;
      }

      setLoading(true);
      setUploadStatus('Requesting image picker permission...');

      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'We need camera roll permissions to test image upload');
        setLoading(false);
        return;
      }

      setUploadStatus('Opening image picker...');

      // Pick an image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled) {
        setUploadStatus('Upload cancelled');
        setLoading(false);
        return;
      }

      const imageUri = result.assets[0].uri;
      setUploadStatus('Uploading image to storage...');
      console.log('Selected image URI:', imageUri);

      // Create a test recall ID
      const testRecallId = `test-${Date.now()}`;

      // Upload the image
      const storagePath = await uploadImageToStorage(imageUri, testRecallId);

      if (!storagePath) {
        setUploadStatus('Upload failed - check console logs');
        Alert.alert('Upload Failed', 'Failed to upload image. Check console for details.');
        setLoading(false);
        return;
      }

      setUploadStatus('Upload successful! Generating URL...');
      console.log('Upload successful! Storage path:', storagePath);

      // Get the public URL
      const publicUrl = getImageUrl(storagePath);
      console.log('Public URL:', publicUrl);

      setTestImagePath(storagePath);
      setTestImageUrl(publicUrl);
      setUploadStatus('✅ Upload and retrieval successful!');

      Alert.alert(
        'Success!',
        `Image uploaded successfully!\n\nStorage Path: ${storagePath}\n\nYou can now see the image below.`
      );

    } catch (error) {
      console.error('Error in test upload:', error);
      setUploadStatus('Error occurred - check console');
      Alert.alert('Error', `Test upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const testImageRetrieval = async () => {
    if (!testImagePath) {
      Alert.alert('No Image', 'Please upload a test image first');
      return;
    }

    try {
      setLoading(true);
      console.log('Testing image retrieval for path:', testImagePath);

      // Try to get the public URL again
      const url = getImageUrl(testImagePath);
      console.log('Retrieved URL:', url);

      // Test if the URL is accessible
      const response = await fetch(url, { method: 'HEAD' });
      console.log('URL accessibility test - Status:', response.status);

      if (response.ok) {
        Alert.alert('Success', `Image is accessible!\n\nStatus: ${response.status}\nURL: ${url}`);
      } else {
        Alert.alert('Warning', `Image URL returned status ${response.status}. This might indicate a policy issue.`);
      }

    } catch (error) {
      console.error('Error testing retrieval:', error);
      Alert.alert('Error', `Failed to test retrieval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const testImageDeletion = async () => {
    if (!testImagePath) {
      Alert.alert('No Image', 'Please upload a test image first');
      return;
    }

    Alert.alert(
      'Confirm Deletion',
      'Are you sure you want to delete the test image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              console.log('Deleting test image:', testImagePath);

              const success = await deleteImageFromStorage(testImagePath);

              if (success) {
                Alert.alert('Success', 'Test image deleted successfully');
                setTestImagePath(null);
                setTestImageUrl(null);
                setUploadStatus('Test image deleted');
              } else {
                Alert.alert('Error', 'Failed to delete test image');
              }

            } catch (error) {
              console.error('Error deleting test image:', error);
              Alert.alert('Error', `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Storage Test',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Session Status */}
        <Animated.View entering={FadeIn.delay(100)} style={styles.section}>
          <Text style={styles.sectionTitle}>Authentication Status</Text>
          <View style={[styles.card, session ? styles.successCard : styles.errorCard]}>
            <Text style={styles.cardText}>
              {session ? `✅ Logged in as: ${session.user.email}` : '❌ Not logged in'}
            </Text>
            {!session && (
              <Text style={styles.warningText}>
                You must be logged in to upload images
              </Text>
            )}
          </View>
        </Animated.View>

        {/* Bucket Info */}
        <Animated.View entering={FadeIn.delay(200)} style={styles.section}>
          <Text style={styles.sectionTitle}>Bucket Information</Text>
          {loading && !bucketInfo ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : bucketInfo ? (
            <View style={styles.card}>
              <Text style={styles.cardText}>Name: {bucketInfo.name}</Text>
              <Text style={styles.cardText}>
                Public: {bucketInfo.public ? '✅ Yes' : '❌ No'}
              </Text>
              <Text style={styles.cardText}>ID: {bucketInfo.id}</Text>
              <Text style={styles.cardText}>
                Created: {new Date(bucketInfo.created_at).toLocaleDateString()}
              </Text>
            </View>
          ) : (
            <View style={[styles.card, styles.errorCard]}>
              <Text style={styles.cardText}>❌ Bucket not found</Text>
            </View>
          )}
        </Animated.View>

        {/* Policies Info */}
        <Animated.View entering={FadeIn.delay(300)} style={styles.section}>
          <Text style={styles.sectionTitle}>Storage Policies</Text>
          {policies.length > 0 ? (
            policies.map((policy, index) => (
              <View key={index} style={styles.card}>
                <Text style={styles.cardText}>Policy: {policy.policyname}</Text>
                <Text style={styles.cardText}>Command: {policy.cmd}</Text>
              </View>
            ))
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardText}>
                ℹ️ Could not fetch policies directly. This is normal if you don't have admin access.
              </Text>
              <Text style={styles.warningText}>
                Policies should be configured in Supabase Dashboard under Storage → Policies
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Test Actions */}
        <Animated.View entering={FadeIn.delay(400)} style={styles.section}>
          <Text style={styles.sectionTitle}>Test Actions</Text>
          
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={testImageUpload}
            disabled={loading || !session}
          >
            <IconSymbol name="photo" size={20} color="#fff" />
            <Text style={styles.buttonText}>Upload Test Image</Text>
          </Pressable>

          {testImagePath && (
            <>
              <Pressable
                style={[styles.button, styles.secondaryButton, loading && styles.buttonDisabled]}
                onPress={testImageRetrieval}
                disabled={loading}
              >
                <IconSymbol name="arrow.down.circle" size={20} color="#fff" />
                <Text style={styles.buttonText}>Test Retrieval</Text>
              </Pressable>

              <Pressable
                style={[styles.button, styles.dangerButton, loading && styles.buttonDisabled]}
                onPress={testImageDeletion}
                disabled={loading}
              >
                <IconSymbol name="trash" size={20} color="#fff" />
                <Text style={styles.buttonText}>Delete Test Image</Text>
              </Pressable>
            </>
          )}

          {uploadStatus && (
            <View style={styles.statusCard}>
              <Text style={styles.statusText}>{uploadStatus}</Text>
            </View>
          )}
        </Animated.View>

        {/* Test Image Display */}
        {testImageUrl && (
          <Animated.View entering={FadeInDown.delay(500)} style={styles.section}>
            <Text style={styles.sectionTitle}>Uploaded Test Image</Text>
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: testImageUrl }}
                style={styles.testImage}
                resizeMode="cover"
                onError={(error) => {
                  console.error('Image load error:', error.nativeEvent.error);
                  Alert.alert('Image Load Error', 'Failed to load the uploaded image. This might indicate a policy issue.');
                }}
                onLoad={() => {
                  console.log('Image loaded successfully!');
                }}
              />
              <Text style={styles.imageCaption}>Storage Path: {testImagePath}</Text>
              <Text style={styles.imageCaption}>URL: {testImageUrl}</Text>
            </View>
          </Animated.View>
        )}

        {/* Instructions */}
        <Animated.View entering={FadeIn.delay(600)} style={styles.section}>
          <Text style={styles.sectionTitle}>Expected Policies</Text>
          <View style={styles.card}>
            <Text style={styles.instructionText}>
              For the recall-images bucket to work properly, you need these policies:
            </Text>
            <Text style={styles.codeText}>
              1. INSERT policy: Allow authenticated users to upload
            </Text>
            <Text style={styles.codeText}>
              2. SELECT policy: Allow authenticated users to view their images
            </Text>
            <Text style={styles.codeText}>
              3. DELETE policy: Allow authenticated users to delete their images
            </Text>
            <Text style={styles.instructionText} style={{ marginTop: 10 }}>
              Or make the bucket public for easier testing.
            </Text>
          </View>

          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.instructionText}>
              📋 How to set up policies in Supabase Dashboard:
            </Text>
            <Text style={styles.codeText}>
              1. Go to Storage → recall-images → Policies
            </Text>
            <Text style={styles.codeText}>
              2. Click "New Policy"
            </Text>
            <Text style={styles.codeText}>
              3. Choose a template or create custom policies
            </Text>
            <Text style={styles.codeText}>
              4. For testing, you can make the bucket public
            </Text>
          </View>

          <View style={[styles.card, { marginTop: 12 }]}>
            <Text style={styles.instructionText}>
              🔍 Example SQL for policies:
            </Text>
            <Text style={[styles.codeText, { fontSize: 10 }]}>
              {`-- Allow authenticated users to upload\nCREATE POLICY "Users can upload images"\nON storage.objects FOR INSERT\nTO authenticated\nWITH CHECK (bucket_id = 'recall-images');`}
            </Text>
          </View>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  backButton: {
    padding: 8,
    marginLeft: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  successCard: {
    backgroundColor: '#d4edda',
    borderColor: '#28a745',
  },
  errorCard: {
    backgroundColor: '#f8d7da',
    borderColor: '#dc3545',
  },
  cardText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#856404',
    marginTop: 8,
    fontStyle: 'italic',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
  },
  dangerButton: {
    backgroundColor: '#dc3545',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  imageContainer: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  testImage: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginBottom: 12,
  },
  imageCaption: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  instructionText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    marginBottom: 4,
    paddingLeft: 8,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
