
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { Note } from '@/types/Note';
import { useNotes } from '@/hooks/useNotes';

export default function NoteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { notes, addNote, updateNote, deleteNote } = useNotes();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (params.id && typeof params.id === 'string') {
      const note = notes.find(n => n.id === params.id);
      if (note) {
        setTitle(note.title);
        setContent(note.content);
        setImages(note.images || []);
        setIsEditing(true);
        setCurrentNoteId(note.id);
        console.log('Loaded note for editing:', note.id);
      }
    }
  }, [params.id, notes]);

  const handleSave = async () => {
    if (!title.trim() && !content.trim() && images.length === 0) {
      Alert.alert('Empty Note', 'Please add some content before saving.');
      return;
    }

    try {
      setSaving(true);
      const now = Date.now();
      
      if (isEditing && currentNoteId) {
        const updatedNote: Note = {
          id: currentNoteId,
          title: title.trim() || 'Untitled',
          content: content.trim(),
          images,
          createdAt: notes.find(n => n.id === currentNoteId)?.createdAt || now,
          updatedAt: now,
          synced: false,
        };
        await updateNote(updatedNote);
        console.log('Note updated successfully');
      } else {
        const newNote: Note = {
          id: `note_${now}_${Math.random().toString(36).substr(2, 9)}`,
          title: title.trim() || 'Untitled',
          content: content.trim(),
          images,
          createdAt: now,
          updatedAt: now,
          synced: false,
        };
        await addNote(newNote);
        console.log('Note created successfully');
      }
      
      router.back();
    } catch (error) {
      console.error('Error saving note:', error);
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!currentNoteId) return;

    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(currentNoteId);
              console.log('Note deleted successfully');
              router.back();
            } catch (error) {
              console.error('Error deleting note:', error);
              Alert.alert('Error', 'Failed to delete note.');
            }
          },
        },
      ]
    );
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant permission to access your photos.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 5,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map(asset => asset.uri);
        setImages(prev => [...prev, ...newImages]);
        console.log('Images added:', newImages.length);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    console.log('Image removed at index:', index);
  };

  const renderHeaderRight = () => (
    <Pressable
      onPress={handleSave}
      disabled={saving}
      style={styles.headerButton}
    >
      {saving ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text style={styles.saveButtonText}>Save</Text>
      )}
    </Pressable>
  );

  const renderHeaderLeft = () => (
    <Pressable
      onPress={() => router.back()}
      style={styles.headerButton}
    >
      <IconSymbol name="chevron.left" color={colors.primary} size={24} />
    </Pressable>
  );

  return (
    <>
      {Platform.OS === 'ios' && (
        <Stack.Screen
          options={{
            title: isEditing ? 'Edit Note' : 'New Note',
            headerRight: renderHeaderRight,
            headerLeft: renderHeaderLeft,
          }}
        />
      )}
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Note Title"
            placeholderTextColor={colors.textSecondary}
            maxLength={100}
          />

          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={setContent}
            placeholder="Start typing your note..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
          />

          {images.length > 0 && (
            <View style={styles.imagesContainer}>
              {images.map((uri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri }} style={styles.image} resizeMode="cover" />
                  <Pressable
                    style={styles.removeImageButton}
                    onPress={() => removeImage(index)}
                  >
                    <IconSymbol name="xmark.circle.fill" size={24} color={colors.card} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.toolbar}>
          <Pressable style={styles.toolbarButton} onPress={pickImage}>
            <IconSymbol name="photo" size={24} color={colors.primary} />
            <Text style={styles.toolbarButtonText}>Add Image</Text>
          </Pressable>

          {isEditing && (
            <Pressable style={styles.toolbarButton} onPress={handleDelete}>
              <IconSymbol name="trash" size={24} color={colors.error} />
              <Text style={[styles.toolbarButtonText, { color: colors.error }]}>
                Delete
              </Text>
            </Pressable>
          )}
        </View>

        {Platform.OS !== 'ios' && (
          <View style={styles.androidHeader}>
            <Pressable onPress={() => router.back()} style={styles.androidBackButton}>
              <IconSymbol name="chevron.left" color={colors.text} size={24} />
            </Pressable>
            <Text style={styles.androidTitle}>
              {isEditing ? 'Edit Note' : 'New Note'}
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={styles.androidSaveButton}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
    padding: 0,
  },
  contentInput: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    minHeight: 200,
    padding: 0,
  },
  imagesContainer: {
    marginTop: 16,
    gap: 12,
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 12,
  },
  toolbar: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 16,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  headerButton: {
    padding: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  androidHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  androidBackButton: {
    padding: 8,
  },
  androidTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  androidSaveButton: {
    padding: 8,
  },
});
