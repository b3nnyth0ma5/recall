
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, getImageDataUrl } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Note } from '@/types/Note';

export default function PersonRecallsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [recalls, setRecalls] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [personName, setPersonName] = useState<string>('');

  const personId = params.personId as string;

  useEffect(() => {
    if (personId && user) {
      loadRecallsForPerson();
    }
  }, [personId, user]);

  const loadRecallsForPerson = async () => {
    try {
      setLoading(true);
      console.log('[PersonRecalls] Loading recalls for person:', personId);

      // First, get the person's name
      const { data: personData, error: personError } = await supabase
        .from('persons')
        .select('person_name')
        .eq('id', personId)
        .eq('user_id', user?.id)
        .single();

      if (personError) {
        console.error('Error loading person:', personError);
        return;
      }

      setPersonName(personData.person_name);

      // Get all recall IDs for this person
      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('recall_id')
        .eq('person_id', personId)
        .eq('user_id', user?.id);

      if (recallPeopleError) {
        console.error('Error loading recall_people:', recallPeopleError);
        return;
      }

      const recallIds = recallPeopleData.map(rp => rp.recall_id);

      if (recallIds.length === 0) {
        setRecalls([]);
        return;
      }

      // Load the recalls
      const { data: recallsData, error: recallsError } = await supabase
        .from('recalls')
        .select('*')
        .in('id', recallIds)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (recallsError) {
        console.error('Error loading recalls:', recallsError);
        return;
      }

      // Load images for each recall
      const recallsWithImages = await Promise.all(
        (recallsData || []).map(async (recall) => {
          try {
            const { data: imagesData } = await supabase
              .from('recall_images')
              .select('id')
              .eq('recall_id', recall.id)
              .order('created_at', { ascending: true });

            const imageResults = await Promise.all(
              (imagesData || []).map(async (img) => {
                try {
                  const dataUrl = await getImageDataUrl(img.id);
                  if (!dataUrl) {
                    return { url: '', id: img.id };
                  }
                  return { url: dataUrl, id: img.id };
                } catch (error) {
                  console.error(`Error processing image ${img.id}:`, error);
                  return { url: '', id: img.id };
                }
              })
            );

            const validImageUrls = imageResults.filter(result => result.url !== '').map(result => result.url);
            const imageIds = imageResults.map(result => result.id);

            // Load people for this recall
            const { data: recallPeopleData } = await supabase
              .from('recall_people')
              .select('person_id, persons(id, person_name)')
              .eq('recall_id', recall.id);

            const people = (recallPeopleData || [])
              .filter((rp: any) => rp.persons)
              .map((rp: any) => ({
                id: rp.persons.id,
                person_name: rp.persons.person_name,
              }));

            return {
              ...recall,
              images: validImageUrls,
              imageIds: imageIds,
              people: people,
            };
          } catch (error) {
            console.error(`Error processing recall ${recall.id}:`, error);
            return {
              ...recall,
              images: [],
              imageIds: [],
              people: [],
            };
          }
        })
      );

      setRecalls(recallsWithImages);
      console.log(`[PersonRecalls] Loaded ${recallsWithImages.length} recalls for ${personData.person_name}`);
    } catch (error) {
      console.error('Error loading recalls for person:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotePress = (noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to note editor:', error);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: personName || 'Person Recalls',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontSize: 20,
            fontWeight: 'bold',
          },
          headerLeft: () => (
            <Pressable onPress={handleBack} style={styles.backButton}>
              <IconSymbol 
                ios_icon_name="chevron.left" 
                android_material_icon_name="arrow_back" 
                size={28} 
                color={colors.text} 
              />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : recalls.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconSymbol 
              ios_icon_name="person.fill.questionmark" 
              android_material_icon_name="person_search" 
              size={80} 
              color={colors.textTertiary} 
            />
            <Text style={styles.emptyTitle}>No Recalls Found</Text>
            <Text style={styles.emptyText}>
              No recalls mention {personName}
            </Text>
          </View>
        ) : (
          <View style={styles.recallsContainer}>
            <Text style={styles.countText}>
              {recalls.length} {recalls.length === 1 ? 'recall' : 'recalls'} mentioning {personName}
            </Text>
            {recalls.map((recall, index) => (
              <NoteCard
                key={`${recall.id}-${index}`}
                note={recall}
                onPress={() => handleNotePress(recall.id)}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 16,
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
  recallsContainer: {
    paddingTop: 16,
  },
  countText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  backButton: {
    padding: 8,
    marginLeft: 8,
  },
});
