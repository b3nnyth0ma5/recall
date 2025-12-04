
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
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

  // Trigger heavy haptic feedback when screen loads
  useEffect(() => {
    console.log('[PersonRecalls] Screen loaded - triggering heavy haptic feedback');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  // Optimized recall loading with batch queries
  const loadRecallsForPerson = useCallback(async () => {
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

      // Get all recall IDs for this person using optimized index
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

      // Load the recalls with optimized query
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

      // Batch load all images for all recalls
      const { data: allImagesData, error: allImagesError } = await supabase
        .from('recall_images')
        .select('id, recall_id')
        .in('recall_id', recallIds)
        .order('created_at', { ascending: true });

      if (allImagesError) {
        console.error('Error loading images:', allImagesError);
      }

      // Group images by recall_id
      const imagesByRecallId = new Map<string, any[]>();
      (allImagesData || []).forEach(img => {
        if (!imagesByRecallId.has(img.recall_id)) {
          imagesByRecallId.set(img.recall_id, []);
        }
        imagesByRecallId.get(img.recall_id)!.push(img);
      });

      // Batch load all people for all recalls
      const { data: allRecallPeopleData, error: allRecallPeopleError } = await supabase
        .from('recall_people')
        .select('recall_id, person_id, persons!inner(id, person_name)')
        .in('recall_id', recallIds);

      if (allRecallPeopleError) {
        console.error('Error loading recall people:', allRecallPeopleError);
      }

      // Group people by recall_id
      const peopleByRecallId = new Map<string, any[]>();
      (allRecallPeopleData || []).forEach((rp: any) => {
        if (!peopleByRecallId.has(rp.recall_id)) {
          peopleByRecallId.set(rp.recall_id, []);
        }
        if (rp.persons) {
          peopleByRecallId.get(rp.recall_id)!.push({
            id: rp.persons.id,
            person_name: rp.persons.person_name,
          });
        }
      });

      // Process recalls with images and people
      const recallsWithImages = await Promise.all(
        (recallsData || []).map(async (recall) => {
          try {
            const recallImages = imagesByRecallId.get(recall.id) || [];
            
            // Only load first image immediately for better performance
            const imageResults = await Promise.all(
              recallImages.map(async (img, index) => {
                try {
                  // Load only first image, others will be lazy loaded
                  if (index === 0) {
                    const dataUrl = await getImageDataUrl(img.id);
                    if (!dataUrl) {
                      return { url: '', id: img.id };
                    }
                    return { url: dataUrl, id: img.id };
                  } else {
                    // Return placeholder for lazy loading
                    return { url: '', id: img.id };
                  }
                } catch (error) {
                  console.error(`Error processing image ${img.id}:`, error);
                  return { url: '', id: img.id };
                }
              })
            );

            const validImageUrls = imageResults.map(result => result.url);
            const imageIds = imageResults.map(result => result.id);
            const people = peopleByRecallId.get(recall.id) || [];

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
  }, [personId, user]);

  useEffect(() => {
    if (personId && user) {
      loadRecallsForPerson();
    }
  }, [personId, user, loadRecallsForPerson]);

  const handleNotePress = useCallback((noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to note editor:', error);
    }
  }, [router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

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
            color: colors.primary,
          },
          headerLeft: () => (
            <Pressable 
              onPress={handleBack} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
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
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
});
