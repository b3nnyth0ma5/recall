
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useNotes } from '@/hooks/useNotes';
import { NoteCard } from '@/components/NoteCard';
import { SearchBar } from '@/components/SearchBar';

export default function HomeScreen() {
  const router = useRouter();
  const { notes, loading, searchQuery, searchNotes } = useNotes();
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = (query: string) => {
    searchNotes(query);
  };

  const handleCreateNote = () => {
    router.push('/note-editor');
  };

  const handleNotePress = (noteId: string) => {
    router.push(`/note-editor?id=${noteId}`);
  };

  const renderHeaderRight = () => (
    <Pressable
      onPress={handleCreateNote}
      style={styles.headerButton}
    >
      <IconSymbol name="plus" color={colors.primary} size={24} />
    </Pressable>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <IconSymbol name="note.text" size={64} color={colors.textSecondary} />
      <Text style={styles.emptyTitle}>No Notes Yet</Text>
      <Text style={styles.emptyText}>
        {searchQuery 
          ? 'No notes match your search' 
          : 'Tap the + button to create your first note'}
      </Text>
    </View>
  );

  return (
    <>
      {Platform.OS === 'ios' && (
        <Stack.Screen
          options={{
            title: 'My Notes',
            headerRight: renderHeaderRight,
          }}
        />
      )}
      <View style={styles.container}>
        <SearchBar
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder="Search notes..."
        />

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={notes}
            renderItem={({ item }) => (
              <NoteCard
                note={item}
                onPress={() => handleNotePress(item.id)}
              />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContainer,
              notes.length === 0 && styles.listContainerEmpty,
              Platform.OS !== 'ios' && styles.listContainerWithTabBar
            ]}
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={false}
          />
        )}

        {Platform.OS !== 'ios' && (
          <Pressable
            style={styles.fab}
            onPress={handleCreateNote}
          >
            <IconSymbol name="plus" size={28} color={colors.card} />
          </Pressable>
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
  headerButton: {
    padding: 8,
  },
  listContainer: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  listContainerEmpty: {
    flex: 1,
  },
  listContainerWithTabBar: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 6,
  },
});
