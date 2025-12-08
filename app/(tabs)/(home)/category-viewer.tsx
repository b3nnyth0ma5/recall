
import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, Alert, TextInput, Image, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useNotes } from '@/hooks/useNotes';
import { peopleCache, imageCache, CostCalculator } from '@/utils/memoryCache';
import { SkeletonLoader } from '@/components/SkeletonLoader';

interface Category {
  id: string;
  category_name: string;
  category_search_description: string;
  icon_cdn_url: string | null;
  user_id: string;
}

export default function CategoryViewerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { getCachedNote } = useNotes();
  const [category, setCategory] = useState<Category | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImage, setEditImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const nameInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  const ITEMS_PER_PAGE = 10;

  // Optimized helper function to load people for recalls in batch
  const loadPeopleForRecalls = useCallback(async (recallIds: string[]) => {
    if (!recallIds || recallIds.length === 0) {
      return {};
    }

    try {
      // Check MemoryCache first
      const uncachedIds: string[] = [];
      const result: Record<string, unknown[]> = {};

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
        console.log(`[CategoryViewer] All people data cached for ${recallIds.length} recalls`);
        return result;
      }

      // Fetch only uncached data with optimized query using composite index
      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('recall_id, person_id, persons!inner(id, person_name)')
        .in('recall_id', uncachedIds);

      if (recallPeopleError) {
        console.error('[CategoryViewer] Error loading recall_people:', recallPeopleError);
        return result;
      }

      // Group people by recall_id
      const peopleByRecallId: Record<string, unknown[]> = {};

      (recallPeopleData || []).forEach((rp: Record<string, unknown>) => {
        const recallId = rp.recall_id as string;
        if (!peopleByRecallId[recallId]) {
          peopleByRecallId[recallId] = [];
        }

        if (rp.persons) {
          const persons = rp.persons as Record<string, unknown>;
          peopleByRecallId[recallId].push({
            id: persons.id,
            person_name: persons.person_name,
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

      console.log(`[CategoryViewer] Loaded people for ${Object.keys(peopleByRecallId).length} recalls (${uncachedIds.length} from DB, ${recallIds.length - uncachedIds.length} from cache)`);
      return result;
    } catch (error) {
      console.error('[CategoryViewer] Error loading people for recalls:', error);
      return {};
    }
  }, []);

  // Optimized image loading with lazy loading and caching
  const loadImagesForRecalls = useCallback(async (recalls: Record<string, unknown>[]) => {
    // First, load people for all recalls in one batch
    const recallIds = recalls.map(r => r.id as string);
    const peopleByRecallId = await loadPeopleForRecalls(recallIds);

    // Batch fetch all images for all recalls in one query
    const { data: allImagesData, error: allImagesError } = await supabase
      .from('recall_images')
      .select('id, recall_id, cdn_url')
      .in('recall_id', recallIds)
      .order('created_at', { ascending: true });

    if (allImagesError) {
      console.error('[CategoryViewer] Error fetching images:', allImagesError);
    }

    // Group images by recall_id
    const imagesByRecallId = new Map<string, Record<string, unknown>[]>();
    (allImagesData || []).forEach(img => {
      const recallId = img.recall_id as string;
      if (!imagesByRecallId.has(recallId)) {
        imagesByRecallId.set(recallId, []);
      }
      const images = imagesByRecallId.get(recallId);
      if (images) {
        images.push(img);
      }
    });

    // Process recalls with their images
    const processedNotes = await Promise.all(
      recalls.map(async (recall) => {
        try {
          const recallId = recall.id as string;
          const recallImages = imagesByRecallId.get(recallId) || [];

          // Load first TWO images immediately for better UX (same as landing page)
          const imageResults = await Promise.all(
            recallImages.map(async (img, index) => {
              try {
                const imgId = img.id as string;
                // Load first two images, others will be lazy loaded
                if (index < 2) {
                  // Check MemoryCache first
                  const cachedImage = imageCache.get(imgId);
                  if (cachedImage) {
                    return { url: cachedImage, id: imgId };
                  }

                  // Prefer CDN URL if available (much faster)
                  if (img.cdn_url) {
                    const cdnUrl = img.cdn_url as string;
                    const cost = CostCalculator.forImage(cdnUrl);
                    imageCache.set(imgId, cdnUrl, cost);
                    return { url: cdnUrl, id: imgId };
                  }

                  // Fallback to base64 data
                  const { getImageDataUrl } = await import('@/utils/supabase');
                  const dataUrl = await getImageDataUrl(imgId);
                  if (dataUrl) {
                    const cost = CostCalculator.forImage(dataUrl);
                    imageCache.set(imgId, dataUrl, cost);
                    return { url: dataUrl, id: imgId };
                  }
                  return { url: '', id: imgId };
                } else {
                  // Return placeholder for lazy loading
                  return { url: '', id: imgId };
                }
              } catch (error) {
                console.error(`[CategoryViewer] Exception processing image ${img.id}:`, error);
                return { url: '', id: img.id as string };
              }
            })
          );

          const validImageUrls = imageResults.map(result => result.url);
          const imageIds = imageResults.map(result => result.id);
          const people = peopleByRecallId[recallId] || [];

          return {
            id: recallId,
            text: (recall.text as string) || '',
            created_at: recall.created_at as string,
            updated_at: recall.updated_at as string,
            location: recall.location as string,
            latitude: recall.latitude as number,
            longitude: recall.longitude as number,
            location_primary_type: recall.location_primary_type as string,
            images: validImageUrls,
            imageIds: imageIds,
            urls: [],
            people: people,
            match_score: (recall.match_score as number) || 0,
          };
        } catch (error) {
          console.error(`[CategoryViewer] Exception processing recall ${recall.id}:`, error);
          return {
            id: recall.id as string,
            text: (recall.text as string) || '',
            created_at: recall.created_at as string,
            updated_at: recall.updated_at as string,
            location: recall.location as string,
            latitude: recall.latitude as number,
            longitude: recall.longitude as number,
            location_primary_type: recall.location_primary_type as string,
            images: [],
            imageIds: [],
            urls: [],
            people: [],
            match_score: (recall.match_score as number) || 0,
          };
        }
      })
    );

    return processedNotes;
  }, [loadPeopleForRecalls]);

  // Optimized category and recalls loading with pagination and cache usage
  const loadCategoryAndRecalls = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!id || !user) {
      console.log('[CategoryViewer] No category ID or user');
      setLoading(false);
      return;
    }

    try {
      if (!append) {
        setLoading(true);
      } else {
        setIsLoadingMore(true);
      }
      
      console.log(`[CategoryViewer] Loading category and recalls page ${pageNum} for:`, id);
      
      // Fetch category details (only on first load)
      if (pageNum === 1) {
        const { data: categoryData, error: categoryError } = await supabase
          .from('recollection_categories')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single();

        if (categoryError) {
          console.error('[CategoryViewer] Error loading category:', categoryError);
          Alert.alert('Error', 'Failed to load category');
          router.back();
          return;
        }

        setCategory(categoryData);
        console.log('[CategoryViewer] Category loaded:', categoryData.category_name);
      }

      // Fetch recall IDs that match this category using optimized composite index with pagination
      const from = (pageNum - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: recollectionsData, error: recollectionsError } = await supabase
        .from('recollections')
        .select('recall_id, match_score')
        .eq('category_id', id)
        .eq('user_id', user.id)
        .order('match_score', { ascending: false })
        .range(from, to);

      if (recollectionsError) {
        console.error('[CategoryViewer] Error fetching recollections:', recollectionsError);
        if (!append) {
          setNotes([]);
        }
        return;
      }

      if (!recollectionsData || recollectionsData.length === 0) {
        console.log('[CategoryViewer] No recalls found for this page');
        setHasMore(false);
        if (!append) {
          setNotes([]);
        }
        return;
      }

      if (recollectionsData.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }

      console.log(`[CategoryViewer] Found ${recollectionsData.length} recollections for page ${pageNum}`);

      const recallIds = recollectionsData.map(r => r.recall_id);
      
      // Create a map of recall_id to match_score for sorting
      const matchScoreMap = new Map(
        recollectionsData.map(r => [r.recall_id, r.match_score])
      );

      // Check cache first for recalls (from landing page)
      const cachedNotes: Note[] = [];
      const uncachedRecallIds: string[] = [];

      recallIds.forEach(recallId => {
        const cachedNote = getCachedNote(recallId);
        if (cachedNote) {
          console.log(`[CategoryViewer] Using cached note for ${recallId}`);
          cachedNotes.push({
            ...cachedNote,
            match_score: matchScoreMap.get(recallId) || 0,
          });
        } else {
          uncachedRecallIds.push(recallId);
        }
      });

      let transformedNotes: Note[] = [...cachedNotes];

      // Fetch only uncached recalls
      if (uncachedRecallIds.length > 0) {
        console.log(`[CategoryViewer] Fetching ${uncachedRecallIds.length} uncached recalls from DB`);
        
        const { data: recallsData, error: recallsError } = await supabase
          .from('recalls')
          .select('*')
          .in('id', uncachedRecallIds)
          .eq('user_id', user.id);

        if (recallsError) {
          console.error('[CategoryViewer] Error fetching recalls:', recallsError);
        } else if (recallsData) {
          // Add match_score to recalls
          const recallsWithScore = recallsData.map(recall => ({
            ...recall,
            match_score: matchScoreMap.get(recall.id) || 0,
          }));

          // Optimized image and people loading with lazy loading
          const processedNotes = await loadImagesForRecalls(recallsWithScore);
          transformedNotes = [...transformedNotes, ...processedNotes];
        }
      }

      // Sort by match_score
      transformedNotes.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));

      console.log(`[CategoryViewer] Loaded ${transformedNotes.length} recalls (${cachedNotes.length} from cache, ${uncachedRecallIds.length} from DB)`);
      
      if (append) {
        // Prevent duplicates by filtering out notes that already exist
        setNotes(prevNotes => {
          const existingIds = new Set(prevNotes.map(note => note.id));
          const newUniqueNotes = transformedNotes.filter(note => !existingIds.has(note.id));
          console.log(`[CategoryViewer] Adding ${newUniqueNotes.length} new unique notes (filtered ${transformedNotes.length - newUniqueNotes.length} duplicates)`);
          return [...prevNotes, ...newUniqueNotes];
        });
      } else {
        setNotes(transformedNotes);
      }
    } catch (error) {
      console.error('[CategoryViewer] Error loading data:', error);
      Alert.alert('Error', 'Failed to load category data');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [id, user, router, getCachedNote, loadImagesForRecalls]);

  useEffect(() => {
    loadCategoryAndRecalls(1, false);
    setPage(1);
    setHasMore(true);
  }, [loadCategoryAndRecalls]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Clear MemoryCache instances on refresh
    console.log('[CategoryViewer] Clearing caches on refresh');
    peopleCache.clear();
    imageCache.clear();
    setPage(1);
    setHasMore(true);
    await loadCategoryAndRecalls(1, false);
    setRefreshing(false);
  };

  const loadMoreRecalls = useCallback(() => {
    if (!isLoadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadCategoryAndRecalls(nextPage, true);
    }
  }, [page, hasMore, isLoadingMore, loading, loadCategoryAndRecalls]);

  const handleScroll = useCallback((event: any) => {
    try {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

      // Load more recalls when near bottom
      const paddingToBottom = 20;
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

      if (isCloseToBottom && hasMore && !isLoadingMore && !loading) {
        console.log('[CategoryViewer] Loading more recalls...');
        loadMoreRecalls();
      }
    } catch (error) {
      console.error('[CategoryViewer] Error handling scroll:', error);
    }
  }, [hasMore, isLoadingMore, loading, loadMoreRecalls]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleNotePress = useCallback((noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to note editor:', error);
    }
  }, [router]);

  const handleEditPress = () => {
    if (!category) return;
    
    setEditName(category.category_name);
    setEditDescription(category.category_search_description);
    setEditImage(category.icon_cdn_url);
    setShowEditModal(true);

    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }
  };

  const handleSelectImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to access your photo library.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setEditImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Error', 'Failed to select image');
    }
  };

  const handleSaveEdit = async () => {
    if (!category || !user) return;

    if (!editName.trim()) {
      Alert.alert('Name Required', 'Please enter a category name');
      return;
    }

    if (!editDescription.trim()) {
      Alert.alert('Description Required', 'Please enter a category description');
      return;
    }

    try {
      setIsSaving(true);

      // Check if name or description changed
      const nameChanged = editName.trim() !== category.category_name;
      const descriptionChanged = editDescription.trim() !== category.category_search_description;

      // Upload new image if changed
      let iconUrl = category.icon_cdn_url;
      if (editImage && editImage !== category.icon_cdn_url) {
        const { uploadImageToCloudflare } = await import('@/utils/cloudflareCDN');
        const { File } = await import('expo-file-system');
        
        const file = new File(editImage);
        const base64 = await file.base64();
        const fileName = `category-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        
        const uploadedUrl = await uploadImageToCloudflare(base64, fileName, 'image/jpeg');
        
        if (uploadedUrl) {
          iconUrl = uploadedUrl;
        }
      }

      // Update category in database
      const { error } = await supabase
        .from('recollection_categories')
        .update({
          category_name: editName.trim(),
          category_search_description: editDescription.trim(),
          icon_cdn_url: iconUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', category.id)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error updating category:', error);
        Alert.alert('Error', 'Failed to update category');
        return;
      }

      console.log('Category updated successfully');

      // Trigger new-category-matching edge function if name or description changed
      if (nameChanged || descriptionChanged) {
        console.log('Category name or description changed, triggering new-category-matching...');
        triggerCategoryMatching(category.id);
      }

      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }

      // Reload category data
      await loadCategoryAndRecalls(1, false);
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating category:', error);
      Alert.alert('Error', 'Failed to update category');
    } finally {
      setIsSaving(false);
    }
  };

  const triggerCategoryMatching = async (categoryId: string) => {
    try {
      console.log('Triggering category matching for updated category:', categoryId);
      
      const { data, error } = await supabase.functions.invoke('new-category-matching', {
        body: { 
          categoryId: categoryId
        },
      });

      if (error) {
        console.error('Error invoking category matching:', error);
      } else {
        console.log('Category matching triggered successfully:', data);
      }
    } catch (error) {
      console.error('Exception in triggerCategoryMatching:', error);
    }
  };

  const handleDeletePress = () => {
    Alert.alert(
      'Delete Category',
      'Are you sure you want to delete this category? This will not delete your recalls, only the category grouping.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: handleDeleteConfirm,
        },
      ]
    );
  };

  const handleDeleteConfirm = async () => {
    if (!category || !user) return;

    try {
      setIsDeleting(true);

      // Delete all recollections for this category first
      const { error: recollectionsError } = await supabase
        .from('recollections')
        .delete()
        .eq('category_id', category.id)
        .eq('user_id', user.id);

      if (recollectionsError) {
        console.error('Error deleting recollections:', recollectionsError);
        Alert.alert('Error', 'Failed to delete category');
        return;
      }

      // Delete the category
      const { error: categoryError } = await supabase
        .from('recollection_categories')
        .delete()
        .eq('id', category.id)
        .eq('user_id', user.id);

      if (categoryError) {
        console.error('Error deleting category:', categoryError);
        Alert.alert('Error', 'Failed to delete category');
        return;
      }

      console.log('Category deleted successfully');

      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }

      // Navigate back
      router.back();
    } catch (error) {
      console.error('Error deleting category:', error);
      Alert.alert('Error', 'Failed to delete category');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <IconSymbol 
          name="tray" 
          size={64} 
          color={colors.textTertiary} 
        />
      </View>
      <Text style={styles.emptyTitle}>No Recalls Yet</Text>
      <Text style={styles.emptyText}>
        Recalls matching this category will appear here automatically
      </Text>
      <View style={styles.emptyInfoCard}>
        <View style={styles.emptyInfoHeader}>
          <IconSymbol name="sparkles" size={20} color={colors.primary} />
          <Text style={styles.emptyInfoTitle}>Auto-Matching</Text>
        </View>
        <Text style={styles.emptyInfoText}>
          Our AI automatically categorizes your recalls based on the category description. Create recalls and they&apos;ll show up here if they match!
        </Text>
      </View>
    </View>
  );

  // Render skeleton loaders for initial load - NOW INCLUDING ICON AND DESCRIPTION
  const renderSkeletons = () => {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Category Info Skeleton */}
          <View style={styles.categoryInfoContainer}>
            <View style={styles.categoryTopRow}>
              {/* Category Icon Skeleton */}
              <SkeletonLoader 
                width={80} 
                height={80} 
                borderRadius={40}
                variant="wave"
              />
              
              {/* Category Text Skeleton */}
              <View style={styles.categoryTextContainer}>
                {/* Description lines */}
                <View style={styles.descriptionRow}>
                  <View style={{ flex: 1 }}>
                    <SkeletonLoader 
                      width="100%" 
                      height={16} 
                      borderRadius={4}
                      variant="wave"
                      style={{ marginBottom: 6 }}
                    />
                    <SkeletonLoader 
                      width="80%" 
                      height={16} 
                      borderRadius={4}
                      variant="wave"
                    />
                  </View>
                </View>
                {/* Recall count skeleton */}
                <SkeletonLoader 
                  width={80} 
                  height={14} 
                  borderRadius={4}
                  variant="wave"
                  style={{ marginTop: 8 }}
                />
              </View>
            </View>
          </View>

          {/* Note Cards Skeleton */}
          <View style={styles.notesContainer}>
            {[...Array(3)].map((_, index) => (
              <NoteCard
                key={`skeleton-${index}`}
                note={{} as any}
                onPress={() => {}}
                loading={true}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Category',
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.text,
            headerTitleAlign: 'center',
            headerTitleStyle: {
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
        {renderSkeletons()}
      </View>
    );
  }

  if (!category) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Category',
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.text,
            headerTitleAlign: 'center',
            headerTitleStyle: {
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
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Category Not Found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: category.category_name,
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
          headerRight: () => (
            <Pressable 
              onPress={handleDeletePress} 
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="trash" size={24} color={colors.error} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={400}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Category Info - Updated Layout */}
        <View style={styles.categoryInfoContainer}>
          <View style={styles.categoryTopRow}>
            {/* Category Icon - 20% smaller and on the left with edit badge */}
            <View style={styles.iconContainer}>
              {category.icon_cdn_url && (
                <Image
                  source={{ uri: category.icon_cdn_url }}
                  style={styles.categoryIcon}
                  resizeMode="cover"
                />
              )}
              {/* Edit badge on photo */}
              <Pressable 
                onPress={handleEditPress} 
                style={styles.photoEditBadge}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol 
                  ios_icon_name="pencil.circle.fill" 
                  android_material_icon_name="edit" 
                  size={24} 
                  color={colors.primary} 
                />
              </Pressable>
            </View>
            
            {/* Search Description and Recall Count - Vertically aligned */}
            <View style={styles.categoryTextContainer}>
              <View style={styles.descriptionRow}>
                <Text style={styles.categoryDescription}>{category.category_search_description}</Text>
                {/* Small Edit Text */}
                <Pressable 
                  onPress={handleEditPress} 
                  style={styles.editTextButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.editText}>edit</Text>
                </Pressable>
              </View>
              <Text style={styles.recallCount}>
                {notes.length} {notes.length === 1 ? 'Recall' : 'Recalls'}
              </Text>
            </View>
          </View>
        </View>

        {/* Recalls */}
        {notes.length === 0 ? (
          renderEmptyState()
        ) : (
          <View style={styles.notesContainer}>
            {notes.map((note, index) => (
              <NoteCard
                key={`${note.id}-${index}`}
                note={note}
                onPress={() => handleNotePress(note.id)}
              />
            ))}
            
            {isLoadingMore && (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingMoreText}>Loading more...</Text>
              </View>
            )}
            
            {!hasMore && notes.length > 0 && (
              <View style={styles.endContainer}>
                <Text style={styles.endText}>You&apos;ve reached the end</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowEditModal(false)} style={styles.modalButton}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Edit Category</Text>
            <Pressable onPress={handleSaveEdit} style={styles.modalButton} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Save</Text>
              )}
            </Pressable>
          </View>

          <ScrollView 
            style={styles.modalScrollView}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Category Icon */}
            <View style={styles.modalImageSection}>
              <Text style={styles.modalLabel}>Category Icon</Text>
              <Pressable onPress={handleSelectImage} style={styles.modalImageSelector}>
                {editImage ? (
                  <Image source={{ uri: editImage }} style={styles.modalSelectedImage} resizeMode="cover" />
                ) : (
                  <View style={styles.modalEmptyImagePlaceholder}>
                    <IconSymbol 
                      ios_icon_name="photo" 
                      android_material_icon_name="image" 
                      size={36} 
                      color={colors.textSecondary} 
                    />
                    <Text style={styles.modalEmptyImageText}>Tap to select</Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* Category Name */}
            <View style={styles.modalFieldContainer}>
              <Text style={styles.modalLabel}>Category Name *</Text>
              <TextInput
                ref={nameInputRef}
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter category name"
                placeholderTextColor={colors.textSecondary}
                maxLength={30}
                returnKeyType="next"
                onSubmitEditing={() => descriptionInputRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            {/* Search Description */}
            <View style={styles.modalFieldContainer}>
              <Text style={styles.modalLabel}>Search Description *</Text>
              <TextInput
                ref={descriptionInputRef}
                style={[styles.modalInput, styles.modalTextArea]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder="Describe what recalls should be in this category"
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                returnKeyType="done"
                blurOnSubmit={true}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Deletion Indicator Modal */}
      <Modal
        visible={isDeleting}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.deletionModalContainer}>
          <View style={styles.deletionModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.deletionModalText}>Deleting category...</Text>
          </View>
        </View>
      </Modal>
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
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.textTertiary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 300,
  },
  emptyInfoCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  emptyInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyInfoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  categoryInfoContainer: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  iconContainer: {
    position: 'relative',
  },
  categoryIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  photoEditBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 2,
  },
  categoryTextContainer: {
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 80,
  },
  descriptionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
  },
  categoryDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
    flex: 1,
  },
  editTextButton: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  editText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  recallCount: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  notesContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalButton: {
    padding: 8,
    minWidth: 60,
  },
  modalButtonText: {
    fontSize: 16,
    color: colors.text,
  },
  modalButtonTextPrimary: {
    color: colors.primary,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  modalImageSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    alignSelf: 'flex-start',
    width: '100%',
  },
  modalImageSelector: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.borderLight,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  modalSelectedImage: {
    width: '100%',
    height: '100%',
  },
  modalEmptyImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalEmptyImageText: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  modalFieldContainer: {
    marginBottom: 24,
  },
  modalInput: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 50,
  },
  modalTextArea: {
    minHeight: 140,
    paddingTop: 14,
  },
  deletionModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletionModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    minWidth: 200,
  },
  deletionModalText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
});
