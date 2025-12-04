
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
import { peopleCache, imageCache, CostCalculator } from '@/utils/memoryCache';
import { useNotes } from '@/hooks/useNotes';

export default function PersonRecallsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { getCachedNote } = useNotes();
  const [recalls, setRecalls] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [personName, setPersonName] = useState<string>('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const personId = params.personId as string;
  const ITEMS_PER_PAGE = 10;

  // Trigger heavy haptic feedback when screen loads
  useEffect(() => {
    console.log('[PersonRecalls] Screen loaded - triggering heavy haptic feedback');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  // Optimized helper function to load people for recalls in batch with caching
  const loadPeopleForRecalls = useCallback(async (recallIds: string[]) => {
    if (!recallIds || recallIds.length === 0) {
      return {};
    }

    try {
      // Check MemoryCache first
      const uncachedIds: string[] = [];
      const result: { [key: string]: any[] } = {};
      
      recallIds.forEach(id => {
        const cached = peopleCache.get(id);
        if (cached) {
          result[id] = cached;
        } else {
          uncachedIds.push(id);
        }
      });
      
      if (uncachedIds.length === 0) {
        // All data is cached
        console.log(`[PersonRecalls] All people data cached for ${recallIds.length} recalls`);
        return result;
      }

      // Fetch only uncached data with optimized query using composite index
      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('recall_id, person_id, persons!inner(id, person_name)')
        .in('recall_id', uncachedIds);

      if (recallPeopleError) {
        console.error('[PersonRecalls] Error loading recall_people:', recallPeopleError);
        return result;
      }

      // Group people by recall_id
      const peopleByRecallId: { [key: string]: any[] } = {};
      
      (recallPeopleData || []).forEach((rp: any) => {
        if (!peopleByRecallId[rp.recall_id]) {
          peopleByRecallId[rp.recall_id] = [];
        }
        
        if (rp.persons) {
          peopleByRecallId[rp.recall_id].push({
            id: rp.persons.id,
            person_name: rp.persons.person_name,
          });
        }
      });

      // Update MemoryCache with cost calculation
      uncachedIds.forEach(id => {
        const people = peopleByRecallId[id] || [];
        const cost = CostCalculator.forPeople(people);
        peopleCache.set(id, people, cost);
        result[id] = people;
      });

      console.log(`[PersonRecalls] Loaded people for ${Object.keys(peopleByRecallId).length} recalls (${uncachedIds.length} from DB, ${recallIds.length - uncachedIds.length} from cache)`);
      return result;
    } catch (error) {
      console.error('[PersonRecalls] Error loading people for recalls:', error);
      return {};
    }
  }, []);

  // Optimized image loading with lazy loading and caching
  const loadImagesForRecalls = useCallback(async (recalls: any[]) => {
    // First, load people for all recalls in one batch
    const recallIds = recalls.map(r => r.id);
    const peopleByRecallId = await loadPeopleForRecalls(recallIds);

    // Batch fetch all images for all recalls in one query
    const { data: allImagesData, error: allImagesError } = await supabase
      .from('recall_images')
      .select('id, recall_id, cdn_url')
      .in('recall_id', recallIds)
      .order('created_at', { ascending: true });

    if (allImagesError) {
      console.error('[PersonRecalls] Error fetching images:', allImagesError);
    }

    // Group images by recall_id
    const imagesByRecallId = new Map<string, any[]>();
    (allImagesData || []).forEach(img => {
      if (!imagesByRecallId.has(img.recall_id)) {
        imagesByRecallId.set(img.recall_id, []);
      }
      imagesByRecallId.get(img.recall_id)!.push(img);
    });

    // Process recalls with their images
    const processedNotes = await Promise.all(
      recalls.map(async (recall) => {
        try {
          const recallImages = imagesByRecallId.get(recall.id) || [];
          
          // Load first TWO images immediately for better UX (same as landing page)
          const imageResults = await Promise.all(
            recallImages.map(async (img, index) => {
              try {
                // Load first two images, others will be lazy loaded
                if (index < 2) {
                  // Check MemoryCache first
                  const cachedImage = imageCache.get(img.id);
                  if (cachedImage) {
                    return { url: cachedImage, id: img.id };
                  }
                  
                  // Prefer CDN URL if available (much faster)
                  if (img.cdn_url) {
                    const cost = CostCalculator.forImage(img.cdn_url);
                    imageCache.set(img.id, img.cdn_url, cost);
                    return { url: img.cdn_url, id: img.id };
                  }
                  
                  // Fallback to base64 data
                  const dataUrl = await getImageDataUrl(img.id);
                  if (dataUrl) {
                    const cost = CostCalculator.forImage(dataUrl);
                    imageCache.set(img.id, dataUrl, cost);
                    return { url: dataUrl, id: img.id };
                  }
                  return { url: '', id: img.id };
                } else {
                  // Return placeholder for lazy loading
                  return { url: '', id: img.id };
                }
              } catch (error) {
                console.error(`[PersonRecalls] Exception processing image ${img.id}:`, error);
                return { url: '', id: img.id };
              }
            })
          );

          const validImageUrls = imageResults.map(result => result.url);
          const imageIds = imageResults.map(result => result.id);
          const people = peopleByRecallId[recall.id] || [];

          return {
            ...recall,
            images: validImageUrls,
            imageIds: imageIds,
            people: people,
          };
        } catch (error) {
          console.error(`[PersonRecalls] Error processing recall ${recall.id}:`, error);
          return {
            ...recall,
            images: [],
            imageIds: [],
            people: [],
          };
        }
      })
    );

    return processedNotes;
  }, [loadPeopleForRecalls]);

  // Optimized recall loading with batch queries, pagination, and cache usage
  const loadRecallsForPerson = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    try {
      if (!append) {
        setLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      console.log(`[PersonRecalls] Loading recalls page ${pageNum} for person:`, personId);

      // First, get the person's name (only on first load)
      if (pageNum === 1) {
        const { data: personData, error: personError } = await supabase
          .from('persons')
          .select('person_name')
          .eq('id', personId)
          .eq('user_id', user?.id)
          .single();

        if (personError) {
          console.error('[PersonRecalls] Error loading person:', personError);
          return;
        }

        setPersonName(personData.person_name);
      }

      // Get recall IDs for this person using optimized index with pagination
      const from = (pageNum - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('recall_id')
        .eq('person_id', personId)
        .eq('user_id', user?.id)
        .range(from, to);

      if (recallPeopleError) {
        console.error('[PersonRecalls] Error loading recall_people:', recallPeopleError);
        return;
      }

      if (!recallPeopleData || recallPeopleData.length === 0) {
        console.log('[PersonRecalls] No recalls found for this page');
        setHasMore(false);
        if (!append) {
          setRecalls([]);
        }
        return;
      }

      if (recallPeopleData.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }

      const recallIds = recallPeopleData.map(rp => rp.recall_id);

      // Check cache first for recalls (from landing page)
      const cachedNotes: Note[] = [];
      const uncachedRecallIds: string[] = [];

      recallIds.forEach(recallId => {
        const cachedNote = getCachedNote(recallId);
        if (cachedNote) {
          console.log(`[PersonRecalls] Using cached note for ${recallId}`);
          cachedNotes.push(cachedNote);
        } else {
          uncachedRecallIds.push(recallId);
        }
      });

      let transformedNotes: Note[] = [...cachedNotes];

      // Fetch only uncached recalls
      if (uncachedRecallIds.length > 0) {
        console.log(`[PersonRecalls] Fetching ${uncachedRecallIds.length} uncached recalls from DB`);
        
        const { data: recallsData, error: recallsError } = await supabase
          .from('recalls')
          .select('*')
          .in('id', uncachedRecallIds)
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false });

        if (recallsError) {
          console.error('[PersonRecalls] Error loading recalls:', recallsError);
        } else if (recallsData) {
          // Optimized image and people loading with lazy loading
          const processedNotes = await loadImagesForRecalls(recallsData);
          transformedNotes = [...transformedNotes, ...processedNotes];
        }
      }

      // Sort by created_at
      transformedNotes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      console.log(`[PersonRecalls] Loaded ${transformedNotes.length} recalls (${cachedNotes.length} from cache, ${uncachedRecallIds.length} from DB)`);
      
      if (append) {
        // Prevent duplicates by filtering out notes that already exist
        setRecalls(prevRecalls => {
          const existingIds = new Set(prevRecalls.map(recall => recall.id));
          const newUniqueRecalls = transformedNotes.filter(recall => !existingIds.has(recall.id));
          console.log(`[PersonRecalls] Adding ${newUniqueRecalls.length} new unique recalls (filtered ${transformedNotes.length - newUniqueRecalls.length} duplicates)`);
          return [...prevRecalls, ...newUniqueRecalls];
        });
      } else {
        setRecalls(transformedNotes);
      }
    } catch (error) {
      console.error('[PersonRecalls] Error loading recalls for person:', error);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [personId, user, getCachedNote, loadImagesForRecalls]);

  useEffect(() => {
    if (personId && user) {
      loadRecallsForPerson(1, false);
      setPage(1);
      setHasMore(true);
    }
  }, [personId, user, loadRecallsForPerson]);

  const loadMoreRecalls = useCallback(() => {
    if (!isLoadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadRecallsForPerson(nextPage, true);
    }
  }, [page, hasMore, isLoadingMore, loading, loadRecallsForPerson]);

  const handleScroll = useCallback((event: any) => {
    try {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

      // Load more recalls when near bottom
      const paddingToBottom = 20;
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

      if (isCloseToBottom && hasMore && !isLoadingMore && !loading) {
        console.log('[PersonRecalls] Loading more recalls...');
        loadMoreRecalls();
      }
    } catch (error) {
      console.error('[PersonRecalls] Error handling scroll:', error);
    }
  }, [hasMore, isLoadingMore, loading, loadMoreRecalls]);

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

  // Render skeleton loaders during initial load
  const renderSkeletonLoaders = () => {
    return (
      <View style={styles.recallsContainer}>
        {[...Array(3)].map((_, index) => (
          <NoteCard
            key={`skeleton-${index}`}
            note={{} as any}
            onPress={() => {}}
            loading={true}
          />
        ))}
      </View>
    );
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
        onScroll={handleScroll}
        scrollEventThrottle={400}
      >
        {loading ? (
          renderSkeletonLoaders()
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
                loading={false}
              />
            ))}
            
            {isLoadingMore && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingMoreText}>Loading more...</Text>
              </View>
            )}
            
            {!hasMore && recalls.length > 0 && (
              <View style={styles.endContainer}>
                <Text style={styles.endText}>You&apos;ve reached the end</Text>
              </View>
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
  loadingMoreContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingMoreText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  endContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  endText: {
    fontSize: 14,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
});
