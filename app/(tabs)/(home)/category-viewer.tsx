
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { getImageDataUrl } from '@/utils/supabase';
import { useNotes } from '@/hooks/useNotes';
import { peopleCache, imageCache, noteCache, CostCalculator } from '@/utils/memoryCache';
import { SkeletonLoader } from '@/components/SkeletonLoader';

interface Category {
  id: string;
  category_name: string;
  category_search_description: string;
  icon_cdn_url: string | null;
  user_id: string;
  is_matching: boolean;
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
  const [isMatching, setIsMatching] = useState(false);
  const matchingCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [totalRecallCount, setTotalRecallCount] = useState(0);
  const [sortOrder, setSortOrder] = useState<'Newest' | 'Oldest' | 'Best match'>('Best match');

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

      console.log(`[CategoryViewer] Loaded people for ${Object.keys(peopleByRecallId).length} recalls (${uncachedIds.length} from DB, ${recallIds.length - uncachedIds.length} from cache)`);
      return result;
    } catch (error) {
      console.error('[CategoryViewer] Error loading people for recalls:', error);
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
      console.error('[CategoryViewer] Error fetching images:', allImagesError);
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
                console.error(`[CategoryViewer] Exception processing image ${img.id}:`, error);
                return { url: '', id: img.id };
              }
            })
          );

          const validImageUrls = imageResults.map(result => result.url);
          const imageIds = imageResults.map(result => result.id);
          const people = peopleByRecallId[recall.id] || [];
          
          return {
            id: recall.id,
            text: recall.text || '',
            created_at: recall.created_at,
            updated_at: recall.updated_at,
            location: recall.location,
            latitude: recall.latitude,
            longitude: recall.longitude,
            location_primary_type: recall.location_primary_type,
            images: validImageUrls,
            imageIds: imageIds,
            urls: [],
            people: people,
            match_score: recall.match_score || 0,
          };
        } catch (error) {
          console.error(`[CategoryViewer] Exception processing recall ${recall.id}:`, error);
          return {
            id: recall.id,
            text: recall.text || '',
            created_at: recall.created_at,
            updated_at: recall.updated_at,
            location: recall.location,
            latitude: recall.latitude,
            longitude: recall.longitude,
            location_primary_type: recall.location_primary_type,
            images: [],
            imageIds: [],
            urls: [],
            people: [],
            match_score: recall.match_score || 0,
          };
        }
      })
    );

    return processedNotes;
  }, [loadPeopleForRecalls]);

  // Start polling to check if matching is complete
  const startMatchingPolling = useCallback(() => {
    console.log('[CategoryViewer] Starting matching polling...');
    
    // Clear any existing interval
    if (matchingCheckIntervalRef.current) {
      clearInterval(matchingCheckIntervalRef.current);
    }
    
    // Poll every 3 seconds
    matchingCheckIntervalRef.current = setInterval(async () => {
      try {
        console.log('[CategoryViewer] Checking if matching is complete...');
        
        const { data: categoryData, error: categoryError } = await supabase
          .from('recollection_categories')
          .select('is_matching')
          .eq('id', id)
          .single();
        
        if (categoryError) {
          console.error('[CategoryViewer] Error checking matching status:', categoryError);
          return;
        }
        
        if (!categoryData.is_matching) {
          console.log('[CategoryViewer] Matching complete! Reloading recalls...');
          setIsMatching(false);
          
          // Stop polling
          if (matchingCheckIntervalRef.current) {
            clearInterval(matchingCheckIntervalRef.current);
            matchingCheckIntervalRef.current = null;
          }
          
          // Reload recalls
          await loadCategoryAndRecalls(1, false);
        }
      } catch (error) {
        console.error('[CategoryViewer] Error in matching polling:', error);
      }
    }, 1500);
  }, [id, loadCategoryAndRecalls]);

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
        setIsMatching(categoryData.is_matching || false);
        console.log('[CategoryViewer] Category loaded:', categoryData.category_name, 'is_matching:', categoryData.is_matching);
        
        // If category is still matching, start polling
        if (categoryData.is_matching) {
          startMatchingPolling();
        }
      }

      // Fetch total count of recalls in this category (only on first load)
      if (pageNum === 1) {
        const { count, error: countError } = await supabase
          .from('recollections')
          .select('recall_id', { count: 'exact', head: true })
          .eq('category_id', id)
          .eq('user_id', user.id);

        if (countError) {
          console.error('[CategoryViewer] Error fetching total recall count:', countError);
          setTotalRecallCount(0);
        } else {
          setTotalRecallCount(count || 0);
          console.log('[CategoryViewer] Total recall count:', count);
        }
      }

      // Fetch recall IDs that match this category using optimized composite index with pagination
      const from = (pageNum - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // Build query with appropriate sorting based on sortOrder
      console.log(`[CategoryViewer] Applying sort order: ${sortOrder}`);
      
      // For date sorting, we need to fetch ALL recalls in the category first, then sort by the recall's created_at
      if (sortOrder === 'Newest' || sortOrder === 'Oldest') {
        console.log(`[CategoryViewer] Fetching ALL recalls for date sorting (${sortOrder})`);
        
        // Step 1: Get all recall_ids for this category
        const { data: allRecollectionsData, error: allRecollectionsError } = await supabase
          .from('recollections')
          .select('recall_id, match_score')
          .eq('category_id', id)
          .eq('user_id', user.id);

        if (allRecollectionsError) {
          console.error('[CategoryViewer] Error fetching all recollections:', allRecollectionsError);
          if (!append) {
            setNotes([]);
          }
          return;
        }

        if (!allRecollectionsData || allRecollectionsData.length === 0) {
          console.log('[CategoryViewer] No recalls found for this category');
          setHasMore(false);
          if (!append) {
            setNotes([]);
          }
          return;
        }

        const allRecallIds = allRecollectionsData.map(r => r.recall_id);
        const matchScoreMap = new Map(
          allRecollectionsData.map(r => [r.recall_id, r.match_score])
        );

        console.log(`[CategoryViewer] Found ${allRecallIds.length} total recalls, fetching their created_at dates`);

        // Step 2: Fetch all recalls with their created_at dates
        const { data: allRecallsData, error: allRecallsError } = await supabase
          .from('recalls')
          .select('id, created_at')
          .in('id', allRecallIds)
          .eq('user_id', user.id);

        if (allRecallsError) {
          console.error('[CategoryViewer] Error fetching recalls for sorting:', allRecallsError);
          if (!append) {
            setNotes([]);
          }
          return;
        }

        // Step 3: Sort by created_at
        const sortedRecalls = (allRecallsData || []).sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          
          if (sortOrder === 'Newest') {
            return dateB - dateA; // Newest first
          } else {
            return dateA - dateB; // Oldest first
          }
        });

        console.log(`[CategoryViewer] Sorted ${sortedRecalls.length} recalls by ${sortOrder}`);

        // Step 4: Apply pagination to sorted results
        const paginatedRecalls = sortedRecalls.slice(from, to + 1);
        
        if (paginatedRecalls.length < ITEMS_PER_PAGE) {
          setHasMore(false);
        }

        console.log(`[CategoryViewer] Paginated to ${paginatedRecalls.length} recalls for page ${pageNum}`);

        // Step 5: Create recollectionsData format with match_score
        const recollectionsData = paginatedRecalls.map(recall => ({
          recall_id: recall.id,
          match_score: matchScoreMap.get(recall.id) || 0,
        }));

        // Continue with existing logic
        const recallIds = recollectionsData.map(r => r.recall_id);
        
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
        
        return; // Exit early for date sorting
      }
      
      // For "Best match" sorting, use the existing logic with match_score
      let recollectionsQuery = supabase
        .from('recollections')
        .select('recall_id, match_score')
        .eq('category_id', id)
        .eq('user_id', user.id);

      console.log('[CategoryViewer] Ordering by match_score DESC (Best match)');
      recollectionsQuery = recollectionsQuery.order('match_score', { ascending: false });
      
      const { data: recollectionsData, error: recollectionsError } = await recollectionsQuery.range(from, to);

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
  }, [id, user, router, getCachedNote, loadImagesForRecalls, startMatchingPolling]);

  useEffect(() => {
    console.log('[CategoryViewer] useEffect triggered - category:', id, 'sortOrder:', sortOrder);
    loadCategoryAndRecalls(1, false);
    setPage(1);
    setHasMore(true);
    
    // Cleanup polling on unmount
    return () => {
      if (matchingCheckIntervalRef.current) {
        clearInterval(matchingCheckIntervalRef.current);
        matchingCheckIntervalRef.current = null;
      }
    };
  }, [id, sortOrder]); // Reload when sortOrder changes

  const handleRefresh = async () => {
    setRefreshing(true);
    // Clear MemoryCache instances on refresh
    console.log('[CategoryViewer] Clearing caches on refresh');
    peopleCache.clear();
    imageCache.clear();
    setPage(1);
    setHasMore(true);
    
    // Check if matching is complete
    if (id && user) {
      const { data: categoryData } = await supabase
        .from('recollection_categories')
        .select('is_matching')
        .eq('id', id)
        .single();
      
      if (categoryData) {
        setIsMatching(categoryData.is_matching || false);
        
        // If matching just completed, stop polling
        if (!categoryData.is_matching && matchingCheckIntervalRef.current) {
          clearInterval(matchingCheckIntervalRef.current);
          matchingCheckIntervalRef.current = null;
        }
      }
      
      // Reload total count
      const { count, error: countError } = await supabase
        .from('recollections')
        .select('recall_id', { count: 'exact', head: true })
        .eq('category_id', id)
        .eq('user_id', user.id);

      if (!countError) {
        setTotalRecallCount(count || 0);
        console.log('[CategoryViewer] Total recall count refreshed:', count);
      }
    }
    
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

  const handleDeleteRecall = useCallback(async (recallId: string) => {
    if (!user) {
      console.error('[CategoryViewer] No user logged in');
      return;
    }

    try {
      console.log('[CategoryViewer] ===== DELETING RECALL =====');
      console.log('[CategoryViewer] Recall ID:', recallId);
      
      // Optimistically remove from UI immediately
      setNotes(prevNotes => prevNotes.filter(note => note.id !== recallId));
      
      // Update total count
      setTotalRecallCount(prev => Math.max(0, prev - 1));
      
      console.log('[CategoryViewer] Recall removed from UI (optimistic update)');
      
      // Clear caches for this recall
      peopleCache.remove(recallId);
      noteCache.remove(recallId);
      console.log('[CategoryViewer] Caches invalidated for recall:', recallId);
      
      // Perform actual deletion ASYNCHRONOUSLY
      console.log('[CategoryViewer] Starting async deletion process...');
      (async () => {
        try {
          console.log('[CategoryViewer] [ASYNC] Getting images for recall:', recallId);
          
          // Get all images for this recall
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('id, cdn_url')
            .eq('recall_id', recallId);

          // Delete images from CDN and clear image cache
          if (imagesData && imagesData.length > 0) {
            console.log(`[CategoryViewer] [ASYNC] Deleting ${imagesData.length} images for recall ${recallId}`);
            
            for (const img of imagesData) {
              // Clear image cache
              imageCache.remove(img.id);
              
              // Delete from CDN if URL exists
              if (img.cdn_url) {
                console.log(`[CategoryViewer] [ASYNC] Deleting image from CDN:`, img.cdn_url);
                const { deleteImageFromCloudflare } = await import('@/utils/cloudflareCDN');
                await deleteImageFromCloudflare(img.cdn_url);
              }
            }
            
            console.log(`[CategoryViewer] [ASYNC] All ${imagesData.length} images deleted and caches cleared`);
          }

          // Delete the recall itself (cascading will handle recall_images, recall_people, recollections, etc.)
          console.log('[CategoryViewer] [ASYNC] Deleting recall from database:', recallId);
          const { error } = await supabase
            .from('recalls')
            .delete()
            .eq('id', recallId)
            .eq('user_id', user.id);

          if (error) {
            console.error('[CategoryViewer] [ASYNC] Error deleting recall:', error);
            // Revert optimistic update on error
            await loadCategoryAndRecalls(1, false);
          } else {
            console.log('[CategoryViewer] [ASYNC] Recall deleted successfully from database');
            console.log('[CategoryViewer] [ASYNC] Cascading deletions (recall_images, recall_people, recollections, etc.) handled by database');
          }
          
          console.log('[CategoryViewer] ===== DELETION COMPLETE =====');
        } catch (asyncError) {
          console.error('[CategoryViewer] [ASYNC] Exception during async deletion:', asyncError);
          // Revert optimistic update on error
          await loadCategoryAndRecalls(1, false);
        }
      })();
      
      console.log('[CategoryViewer] Deletion initiated asynchronously');
    } catch (error) {
      console.error('[CategoryViewer] Error initiating recall deletion:', error);
      // Revert optimistic update on error
      await loadCategoryAndRecalls(1, false);
    }
  }, [user, loadCategoryAndRecalls]);

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
        
        // Set is_matching to true before triggering
        await supabase
          .from('recollection_categories')
          .update({ is_matching: true })
          .eq('id', category.id)
          .eq('user_id', user.id);
        
        setIsMatching(true);
        startMatchingPolling();
        
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

  const renderEmptyState = () => {
    // If matching is in progress, show matching state
    if (isMatching) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Finding Matching Recalls</Text>
          <Text style={styles.emptyText}>
            Our AI is analyzing your recalls to find matches for this category. This may take a moment...
          </Text>
          <View style={styles.emptyInfoCard}>
            <View style={styles.emptyInfoHeader}>
              <IconSymbol name="sparkles" size={20} color={colors.primary} />
              <Text style={styles.emptyInfoTitle}>What&apos;s Happening?</Text>
            </View>
            <Text style={styles.emptyInfoText}>
              We&apos;re using AI to scan through your existing recalls and identify which ones match this category based on the description you provided.
            </Text>
          </View>
        </View>
      );
    }
    
    // Normal empty state when no recalls match
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <IconSymbol 
            name="tray" 
            size={64} 
            color={colors.textTertiary} 
          />
        </View>
        <Text style={styles.emptyTitle}>No Matching Recalls</Text>
        <Text style={styles.emptyText}>
          No recalls match this category yet. Create new recalls and they&apos;ll automatically appear here if they match!
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
  };

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

  // Render matching placeholders when category is being matched
  const renderMatchingPlaceholders = () => {
    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Category Info - Real data */}
          {category && (
            <View style={styles.categoryInfoContainer}>
              <View style={styles.categoryTopRow}>
                {/* Category Icon */}
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
                
                {/* Search Description and Matching Status */}
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
                  {/* Matching status */}
                  <View style={styles.matchingStatusContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.matchingStatusText}>Finding matches...</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Placeholder Note Cards with shimmer effect */}
          <View style={styles.notesContainer}>
            {[...Array(3)].map((_, index) => (
              <NoteCard
                key={`matching-placeholder-${index}`}
                note={{} as any}
                onPress={() => {}}
                loading={true}
              />
            ))}
          </View>
          
          {/* Info message */}
          <View style={styles.matchingInfoContainer}>
            <IconSymbol name="sparkles" size={20} color={colors.primary} />
            <Text style={styles.matchingInfoText}>
              Analyzing your recalls to find matches...
            </Text>
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
            headerTitle: category?.category_name || 'Category',
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

      {/* Show matching placeholders if category is being matched */}
      {isMatching ? (
        renderMatchingPlaceholders()
      ) : (
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
                  {totalRecallCount} {totalRecallCount === 1 ? 'Recall' : 'Recalls'}
                </Text>
              </View>
            </View>

            {/* Sort By UI */}
            <View style={styles.sortContainer}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              <View style={styles.sortButtons}>
                <Pressable
                  style={[styles.sortButton, sortOrder === 'Newest' && styles.sortButtonActive]}
                  onPress={() => {
                    console.log('[CategoryViewer] User tapped "Newest" sort button');
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setSortOrder('Newest');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.sortButtonText, sortOrder === 'Newest' && styles.sortButtonTextActive]}>
                    Newest
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.sortButton, sortOrder === 'Oldest' && styles.sortButtonActive]}
                  onPress={() => {
                    console.log('[CategoryViewer] User tapped "Oldest" sort button');
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setSortOrder('Oldest');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.sortButtonText, sortOrder === 'Oldest' && styles.sortButtonTextActive]}>
                    Oldest
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.sortButton, sortOrder === 'Best match' && styles.sortButtonActive]}
                  onPress={() => {
                    console.log('[CategoryViewer] User tapped "Best match" sort button');
                    if (Platform.OS !== 'web') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }
                    setSortOrder('Best match');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.sortButtonText, sortOrder === 'Best match' && styles.sortButtonTextActive]}>
                    Best match
                  </Text>
                </Pressable>
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
                  onDelete={() => handleDeleteRecall(note.id)}
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
      )}

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
    paddingBottom: 16,
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
  matchingStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  matchingStatusText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  matchingInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.primary}30`,
  },
  matchingInfoText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
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
  sortContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sortLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  sortButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortButtonTextActive: {
    color: '#FFFFFF',
  },
});
