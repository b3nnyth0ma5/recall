
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Image, Modal, Platform, Alert, Keyboard } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useNotes } from '@/hooks/useNotes';
import { NoteCard } from '@/components/NoteCard';
import { IconSymbol } from '@/components/IconSymbol';
import { ZeroState } from '@/components/ZeroState';
import { CombinedSearchAdd } from '@/components/CombinedSearchAdd';
import { CategoryCarousel } from '@/components/CategoryCarousel';
import { NoteCardSkeleton } from '@/components/NoteCardSkeleton';
import { supabase } from '@/utils/supabase';
import { uploadImageToDatabase, uploadDocumentToDatabase } from '@/utils/supabase';
import * as Haptics from 'expo-haptics';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { notes, loading, refreshNotes, deleteNote } = useNotes();
  const [refreshing, setRefreshing] = useState(false);
  const [isAddingRecall, setIsAddingRecall] = useState(false);
  const [expectedImageCounts, setExpectedImageCounts] = useState<{ [key: string]: number }>({});
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      console.log('[HomeScreen] Screen focused - refreshing notes');
      refreshNotes();
    }, [refreshNotes])
  );

  useEffect(() => {
    if (user) {
      console.log('[HomeScreen] User authenticated, loading notes');
      refreshNotes();
    }
  }, [user]);

  useEffect(() => {
    if (notes.length > 0) {
      console.log(`[HomeScreen] Loaded ${notes.length} notes`);
    }
  }, [notes.length]);

  const handleRefresh = async () => {
    console.log('[HomeScreen] User triggered refresh');
    setRefreshing(true);
    await refreshNotes();
    setRefreshing(false);
  };

  const handleRecallIconPress = () => {
    console.log('[HomeScreen] Recall icon pressed - navigating to note editor');
    router.push('/note-editor');
  };

  const handleAddRecall = () => {
    console.log('[HomeScreen] Add recall button pressed');
    router.push('/note-editor');
  };

  const handleNotePress = (noteId: string) => {
    console.log('[HomeScreen] Note pressed:', noteId);
    router.push(`/note-editor?id=${noteId}`);
  };

  const handleProfile = () => {
    console.log('[HomeScreen] Profile button pressed');
    router.push('/profile');
  };

  const handleCreateRecallFromCombined = async (
    data: {
      text: string;
      images: string[];
      documents?: { uri: string; name: string; size: number; mimeType?: string }[];
      location?: { latitude: number; longitude: number; name: string; primaryType?: string };
    },
    onProgress?: (stage: string) => void
  ) => {
    if (!user) {
      console.error('[HomeScreen] No user found, cannot create recall');
      Alert.alert('Error', 'User not authenticated');
      return;
    }

    try {
      setIsAddingRecall(true);
      console.log('[HomeScreen] Creating recall from combined search/add');
      console.log('[HomeScreen] Text:', data.text);
      console.log('[HomeScreen] Images:', data.images.length);
      console.log('[HomeScreen] Documents:', data.documents?.length || 0);
      console.log('[HomeScreen] Location:', data.location?.name);

      if (onProgress) {
        onProgress('Creating recall...');
      }

      // Create the recall record first
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert({
          user_id: user.id,
          text: data.text,
          latitude: data.location?.latitude,
          longitude: data.location?.longitude,
          location: data.location?.name,
          location_primary_type: data.location?.primaryType,
        })
        .select('id')
        .single();

      if (recallError || !recallData) {
        console.error('[HomeScreen] Error creating recall:', recallError);
        throw new Error('Failed to create recall');
      }

      const recallId = recallData.id;
      console.log('[HomeScreen] Recall created with ID:', recallId);

      // Set expected image count for this recall
      if (data.images.length > 0) {
        setExpectedImageCounts(prev => ({
          ...prev,
          [recallId]: data.images.length,
        }));
      }

      // Refresh notes immediately to show the new recall
      await refreshNotes();

      // Scroll to top to show the new recall
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: true });
      }

      // Upload images asynchronously in the background
      if (data.images.length > 0) {
        console.log(`[HomeScreen] [ASYNC] Starting background upload of ${data.images.length} images...`);
        
        (async () => {
          let uploadedCount = 0;
          
          for (const imageUri of data.images) {
            try {
              if (onProgress) {
                onProgress(`Uploading image ${uploadedCount + 1}/${data.images.length}...`);
              }
              
              const imageId = await uploadImageToDatabase(imageUri, recallId, 'image/jpeg');
              
              if (imageId) {
                uploadedCount++;
                console.log(`[HomeScreen] [ASYNC] Image ${uploadedCount}/${data.images.length} uploaded successfully`);
              } else {
                console.error(`[HomeScreen] [ASYNC] Failed to upload image ${uploadedCount + 1}`);
              }
            } catch (error) {
              console.error(`[HomeScreen] [ASYNC] Exception uploading image:`, error);
            }
          }
          
          console.log(`[HomeScreen] [ASYNC] Image upload complete: ${uploadedCount}/${data.images.length} successful`);
          
          // Clear expected image count after upload completes
          setExpectedImageCounts(prev => {
            const newCounts = { ...prev };
            delete newCounts[recallId];
            return newCounts;
          });
          
          // Refresh notes to show uploaded images
          await refreshNotes();
        })();
      }

      // Upload documents asynchronously in the background
      if (data.documents && data.documents.length > 0) {
        console.log(`[HomeScreen] [ASYNC] Starting background upload of ${data.documents.length} documents...`);
        
        (async () => {
          let uploadedCount = 0;
          
          for (const doc of data.documents) {
            try {
              if (onProgress) {
                onProgress(`Uploading document ${uploadedCount + 1}/${data.documents.length}...`);
              }
              
              const fileSizeMB = parseFloat((doc.size / (1024 * 1024)).toFixed(2));
              
              // TODO: Backend Integration - POST /api/documents/upload
              // Accepts: multipart form data with 'document' field, recallId, documentName, fileSizeMB, mimeType
              // Returns: { documentId: string, documentCdnUrl: string, previewCdnUrl: string }
              // The backend will:
              // 1. Upload document file to Cloudflare R2
              // 2. Generate preview image from first page
              // 3. Upload preview to Cloudflare CDN
              // 4. Store metadata in recall_documents table
              // 5. Trigger embedding generation asynchronously
              
              const documentId = await uploadDocumentToDatabase(doc.uri, recallId, doc.name, fileSizeMB);
              
              if (documentId) {
                uploadedCount++;
                console.log(`[HomeScreen] [ASYNC] Document ${uploadedCount}/${data.documents.length} uploaded successfully`);
              } else {
                console.error(`[HomeScreen] [ASYNC] Failed to upload document ${uploadedCount + 1}`);
              }
            } catch (error) {
              console.error(`[HomeScreen] [ASYNC] Exception uploading document:`, error);
            }
          }
          
          console.log(`[HomeScreen] [ASYNC] Document upload complete: ${uploadedCount}/${data.documents.length} successful`);
          
          // Refresh notes to show uploaded documents
          await refreshNotes();
        })();
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      console.log('[HomeScreen] Recall created successfully');
    } catch (error) {
      console.error('[HomeScreen] Error creating recall:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsAddingRecall(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    console.log('[HomeScreen] Deleting note:', noteId);
    
    try {
      await deleteNote(noteId);
      console.log('[HomeScreen] Note deleted successfully');
      
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[HomeScreen] Error deleting note:', error);
      Alert.alert('Error', 'Failed to delete note');
    }
  };

  const renderEmptyState = () => {
    if (loading) {
      return null;
    }

    return (
      <ZeroState
        icon="note.text"
        title="No Recalls Yet"
        description="Start capturing your memories, ideas, and moments"
        actionText="Create Your First Recall"
        onAction={handleAddRecall}
      />
    );
  };

  const renderSkeletons = () => {
    return (
      <>
        <NoteCardSkeleton />
        <NoteCardSkeleton />
        <NoteCardSkeleton />
      </>
    );
  };

  const getExpectedImageCount = (noteId: string): number | undefined => {
    return expectedImageCounts[noteId];
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerLeft: () => (
            <Pressable 
              onPress={handleRecallIconPress}
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol 
                ios_icon_name="note.text" 
                android_material_icon_name="description" 
                size={28} 
                color={colors.primary} 
              />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable 
              onPress={handleProfile}
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol 
                ios_icon_name="person.circle.fill" 
                android_material_icon_name="account-circle" 
                size={28} 
                color={colors.text} 
              />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 140 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <CategoryCarousel />

        {loading && notes.length === 0 ? (
          renderSkeletons()
        ) : notes.length === 0 ? (
          renderEmptyState()
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onPress={() => handleNotePress(note.id)}
              onDelete={() => handleDeleteNote(note.id)}
              expectedImageCount={getExpectedImageCount(note.id)}
            />
          ))
        )}
      </ScrollView>

      {user && (
        <CombinedSearchAdd 
          onCreateRecall={handleCreateRecallFromCombined}
          userId={user.id}
        />
      )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
});
