
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import { NoteCard } from '@/components/NoteCard';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useNotes } from '@/hooks/useNotes';

export default function HomeScreen() {
  const router = useRouter();
  const { notes, loading, refreshNotes, deleteNote } = useNotes();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshNotes();
    setRefreshing(false);
  }, [refreshNotes]);

  const handleCreateNote = () => {
    router.push('/note-editor');
  };

  const handleNotePress = (noteId: string) => {
    router.push(`/note-editor?id=${noteId}`);
  };

  const handleSearch = () => {
    router.push('/search');
  };

  const handleDeleteNote = (noteId: string) => {
    Alert.alert(
      'Delete Recall',
      'Are you sure you want to delete this recall?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(noteId);
            } catch (error) {
              console.error('Error deleting recall:', error);
              Alert.alert('Error', 'Failed to delete recall');
            }
          },
        },
      ]
    );
  };

  const renderRightActions = (noteId: string) => {
    return (
      <Pressable
        style={styles.deleteButton}
        onPress={() => handleDeleteNote(noteId)}
      >
        <IconSymbol name="trash.fill" size={24} color="#FFFFFF" />
        <Text style={styles.deleteButtonText}>Delete</Text>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <IconSymbol name="note.text" size={64} color={colors.textTertiary} />
      </View>
      <Text style={styles.emptyTitle}>No Recalls Yet</Text>
      <Text style={styles.emptyDescription}>
        Tap the + button to create your first recall
      </Text>
    </Animated.View>
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: '',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerLeft: () => (
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>Recall</Text>
            </View>
          ),
          headerRight: () => (
            <Pressable onPress={handleSearch} style={styles.headerButton}>
              <IconSymbol name="magnifyingglass" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {loading && notes.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : notes.length === 0 ? (
          renderEmptyState()
        ) : (
          notes.map((note) => (
            <Swipeable
              key={note.id}
              renderRightActions={() => renderRightActions(note.id)}
              overshootRight={false}
            >
              <NoteCard note={note} onPress={() => handleNotePress(note.id)} />
            </Swipeable>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={handleCreateNote}>
        <IconSymbol name="plus" size={28} color="#FFFFFF" />
      </Pressable>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerLeft: {
    paddingLeft: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  emptyDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  deleteButton: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    marginBottom: 16,
    borderRadius: 16,
    marginLeft: 8,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: `0px 4px 12px ${colors.shadow}`,
    elevation: 6,
  },
});
