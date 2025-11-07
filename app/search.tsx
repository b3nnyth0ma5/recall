
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { NoteCard } from '@/components/NoteCard';
import { colors } from '@/styles/commonStyles';
import { SearchHistory } from '@/types/Note';
import { useNotes } from '@/hooks/useNotes';

export default function SearchScreen() {
  const router = useRouter();
  const searchInputRef = useRef<TextInput>(null);
  const [searchText, setSearchText] = useState('');
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const { notes, loading, searchNotes, getSearchHistory } = useNotes();

  useEffect(() => {
    loadSearchHistory();
    
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
    };
  }, []);

  const loadSearchHistory = async () => {
    const history = await getSearchHistory();
    setSearchHistory(history);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    await searchNotes(query);
    await loadSearchHistory();
  };

  const handleHistoryItemPress = (searchText: string) => {
    setSearchText(searchText);
    handleSearch(searchText);
  };

  const handleNotePress = (noteId: string) => {
    router.push(`/note-editor?id=${noteId}`);
  };

  const handleClear = () => {
    setSearchText('');
    searchNotes('');
  };

  const toggleKeyboard = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      searchInputRef.current?.focus();
    }
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
          headerRight: () => (
            <Pressable onPress={toggleKeyboard} style={styles.headerButton}>
              <IconSymbol 
                name={keyboardVisible ? "keyboard.chevron.compact.down" : "keyboard"} 
                size={24} 
                color={colors.text} 
              />
            </Pressable>
          ),
        }}
      />

      <View style={styles.searchSection}>
        <View style={styles.searchContainer}>
          <IconSymbol name="magnifyingglass" size={20} color={colors.textSecondary} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search recalls..."
            placeholderTextColor={colors.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => handleSearch(searchText)}
          />
          {searchText.length > 0 && (
            <Pressable onPress={handleClear}>
              <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : searchText.length > 0 ? (
          notes.length > 0 ? (
            notes.map((note) => (
              <NoteCard key={note.id} note={note} onPress={() => handleNotePress(note.id)} />
            ))
          ) : (
            <Animated.View entering={FadeIn.duration(600)} style={styles.emptyState}>
              <IconSymbol name="magnifyingglass" size={64} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Results Found</Text>
              <Text style={styles.emptyDescription}>
                Try searching with different keywords
              </Text>
            </Animated.View>
          )
        ) : (
          <View style={styles.historySection}>
            <Text style={styles.historyTitle}>Recent Searches</Text>
            {searchHistory.length > 0 ? (
              searchHistory.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.historyItem}
                  onPress={() => handleHistoryItemPress(item.search_text)}
                >
                  <IconSymbol name="clock" size={20} color={colors.textSecondary} />
                  <Text style={styles.historyText}>{item.search_text}</Text>
                  <IconSymbol name="arrow.up.left" size={16} color={colors.textTertiary} />
                </Pressable>
              ))
            ) : (
              <Text style={styles.noHistoryText}>No recent searches</Text>
            )}
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
    marginHorizontal: 8,
  },
  searchSection: {
    padding: 16,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  emptyDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  historySection: {
    paddingTop: 8,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  noHistoryText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 32,
  },
});
