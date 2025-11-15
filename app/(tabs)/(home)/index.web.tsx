
import { NoteCard } from '@/components/NoteCard';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/Note';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';
import { supabase, getImageDataUrl } from '@/utils/supabase';
import { CategoryCarousel } from '@/components/CategoryCarousel';
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Image, Modal } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();
  const { notes, loading, refreshNotes } = useNotes();
  const { user } = useAuth();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const [scrollY, setScrollY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);

  // Filter notes by selected category
  useEffect(() => {
    if (selectedCategoryId) {
      const filtered = notes.filter((note) => {
        // Check if note has this category
        // This would require fetching category associations from the database
        // For now, we'll just show all notes
        return true;
      });
      setFilteredNotes(filtered);
    } else {
      setFilteredNotes(notes);
    }
  }, [notes, selectedCategoryId]);

  // Fetch category associations when user or selected category changes
  useEffect(() => {
    if (!user?.id || !selectedCategoryId) {
      return;
    }

    const fetchCategoryNotes = async () => {
      try {
        const { data, error } = await supabase
          .from('recollection_categories')
          .select('recollection_id')
          .eq('category_id', selectedCategoryId);

        if (error) {
          console.error('Error fetching category notes:', error);
          return;
        }

        const categoryNoteIds = new Set(data.map((item) => item.recollection_id));
        const filtered = notes.filter((note) => categoryNoteIds.has(note.id));
        setFilteredNotes(filtered);
      } catch (error) {
        console.error('Error fetching category notes:', error);
      }
    };

    fetchCategoryNotes();
  }, [selectedCategoryId, user?.id, notes]);

  const handleRefresh = useCallback(async () => {
    await refreshNotes();
  }, [refreshNotes]);

  const handleTouchStart = (e: any) => {
    setIsDragging(true);
    setStartY(scrollY);
  };

  const handleTouchMove = (e: any) => {
    if (!isDragging) return;
    
    const currentY = scrollY;
    if (currentY < -100) {
      handleRefresh();
      setIsDragging(false);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleCreateNote = useCallback(() => {
    router.push('/note-editor');
  }, [router]);

  const handleNotePress = useCallback((noteId: string) => {
    router.push({
      pathname: '/note-editor',
      params: { id: noteId },
    });
  }, [router]);

  const handleSearch = useCallback(() => {
    router.push('/search');
  }, [router]);

  const handleProfile = useCallback(() => {
    router.push('/(tabs)/profile');
  }, [router]);

  const handleCategorySelect = useCallback((categoryId: string | null) => {
    console.log('Selected category:', categoryId);
    setSelectedCategoryId(categoryId);
  }, []);

  const renderEmptyState = () => (
    <Animated.View entering={FadeIn} style={styles.emptyState}>
      <IconSymbol
        ios_icon_name="note.text"
        android_material_icon_name="note"
        size={64}
        color={colors.textTertiary}
      />
      <Text style={styles.emptyStateTitle}>No Recalls Yet</Text>
      <Text style={styles.emptyStateText}>
        Tap the + button to create your first recall
      </Text>
    </Animated.View>
  );

  useFocusEffect(
    useCallback(() => {
      refreshNotes();
    }, [refreshNotes])
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Recalls</Text>
        <View style={styles.headerButtons}>
          <Pressable onPress={handleSearch} style={styles.headerButton}>
            <IconSymbol
              ios_icon_name="magnifyingglass"
              android_material_icon_name="search"
              size={24}
              color={colors.text}
            />
          </Pressable>
          <Pressable onPress={handleProfile} style={styles.headerButton}>
            <IconSymbol
              ios_icon_name="person.circle"
              android_material_icon_name="account_circle"
              size={24}
              color={colors.text}
            />
          </Pressable>
        </View>
      </View>

      {/* Category Carousel */}
      <CategoryCarousel onCategorySelect={handleCategorySelect} />

      {/* Notes List */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {loading && filteredNotes.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : filteredNotes.length === 0 ? (
          renderEmptyState()
        ) : (
          filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onPress={() => handleNotePress(note.id)}
            />
          ))
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <Pressable style={styles.fab} onPress={handleCreateNote}>
        <IconSymbol
          ios_icon_name="plus"
          android_material_icon_name="add"
          size={28}
          color={colors.text}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: colors.background,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
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
    paddingHorizontal: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
});
