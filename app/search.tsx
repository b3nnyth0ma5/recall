
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { IconSymbol } from '@/components/IconSymbol';
import { SearchHistory } from '@/types/Note';
import Animated, { FadeIn } from 'react-native-reanimated';

export default function SearchScreen() {
  const router = useRouter();
  const { notes, loading, searchNotes, getSearchHistory } = useNotes();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    loadSearchHistory();
  }, []);

  const loadSearchHistory = async () => {
    const history = await getSearchHistory();
    setSearchHistory(history);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      setShowHistory(false);
      searchNotes(query);
      // Reload history after search to get updated list
      setTimeout(() => {
        loadSearchHistory();
      }, 500);
    } else {
      setShowHistory(true);
      searchNotes('');
    }
  };

  const handleHistoryItemPress = (searchText: string) => {
    setSearchQuery(searchText);
    setShowHistory(false);
    searchNotes(searchText);
  };

  const handleNotePress = (noteId: string) => {
    router.push(`/note-editor?id=${noteId}`);
  };

  const handleClear = () => {
    setSearchQuery('');
    setShowHistory(true);
    searchNotes('');
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Search',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <IconSymbol name="magnifyingglass" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recalls..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearch}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={handleClear}>
              <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Results */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {showHistory && searchHistory.length > 0 ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.historyContainer}>
            <Text style={styles.historyTitle}>Recent Searches</Text>
            {searchHistory.map((item) => (
              <Pressable
                key={item.id}
                style={styles.historyItem}
                onPress={() => handleHistoryItemPress(item.search_text)}
              >
                <IconSymbol name="clock" size={18} color={colors.textSecondary} />
                <Text style={styles.historyText}>{item.search_text}</Text>
                <IconSymbol name="arrow.up.left" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </Animated.View>
        ) : loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : searchQuery.length === 0 ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
            <IconSymbol name="magnifyingglass" size={80} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Search Your Recalls</Text>
            <Text style={styles.emptyText}>
              Type to search across all your recalls
            </Text>
          </Animated.View>
        ) : notes.length === 0 ? (
          <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
            <IconSymbol name="doc.text.magnifyingglass" size={80} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No Results Found</Text>
            <Text style={styles.emptyText}>
              Try a different search term
            </Text>
          </Animated.View>
        ) : (
          <View style={styles.notesContainer}>
            <Text style={styles.resultsText}>
              {notes.length} {notes.length === 1 ? 'result' : 'results'} found
            </Text>
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                onPress={() => handleNotePress(note.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
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
    marginLeft: 8,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  historyContainer: {
    width: '100%',
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  historyText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  notesContainer: {
    width: '100%',
  },
  resultsText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
});
