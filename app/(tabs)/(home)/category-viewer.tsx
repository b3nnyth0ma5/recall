
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Pressable, ActivityIndicator, RefreshControl, Alert, TextInput, Image, Modal, KeyboardAvoidingView, Platform, Animated, Dimensions } from 'react-native';
import RecallHeader from '@/components/RecallHeader';

import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { uploadImageToCloudflare } from '@/utils/cloudflareCDN';
import { getImageDataUrl } from '@/utils/supabase';
import { useNotes } from '@/hooks/useNotes';
import { useNotesContext } from '@/contexts/NotesContext';
import { peopleCache, imageCache, noteCache, CostCalculator } from '@/utils/memoryCache';
import { debounce } from '@/utils/debounce';
import { cdnVariant } from '@/utils/cdnVariant';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import Toast from 'react-native-toast-message';

interface Category {
  id: string;
  category_name: string;
  category_search_description: string;
  icon_cdn_url: string | null;
  user_id: string;
  is_matching: boolean;
}

type SortOrder = 'Newest' | 'Oldest' | 'Best match';



export default function CategoryViewerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { getCachedNote } = useNotes();
  const { refreshUrlMetadata } = useNotesContext();
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
  const [isRematching, setIsRematching] = useState(false);
  const rematchingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchingCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [totalRecallCount, setTotalRecallCount] = useState(0);
  const [sortOrder, setSortOrder] = useState<SortOrder>('Newest');

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const ellipsisButtonRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);

  const nameInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  // Ref so loadCategoryAndRecalls can call startMatchingPolling without a circular dep
  const startMatchingPollingRef = useRef<() => void>(() => {});

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
      
      recallIds.forEach(rid => {
        const cached = peopleCache.get(rid);
        if (cached) {
          result[rid] = cached;
        } else {
          uncachedIds.push(rid);
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
        .select('recall_id, person_id, persons!inner(id, person_name, photo_url)')
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
            photo_url: rp.persons.photo_url,
          });
        }
      });

      // Update MemoryCache with cost calculation
      uncachedIds.forEach(rid => {
        const people = peopleByRecallId[rid] || [];
        const cost = CostCalculator.forPeople(people);
        peopleCache.set(rid, people, cost);
        result[rid] = people;
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
      
      console.log(`[CategoryViewer] Loading category and recalls page ${pageNum} for:`, id, 'sortOrder:', sortOrder);
      
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
          startMatchingPollingRef.current();
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
        
        // Step 1: Get all recollections (recall_id + match_score) for this category
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
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        if (!allRecollectionsData || allRecollectionsData.length === 0) {
          console.log('[CategoryViewer] No recalls found for this category');
          setHasMore(false);
          if (!append) {
            setNotes([]);
          }
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        const allRecallIds = allRecollectionsData.map(r => r.recall_id);
        const matchScoreMap = new Map(
          allRecollectionsData.map(r => [r.recall_id, r.match_score])
        );

        console.log(`[CategoryViewer] Found ${allRecallIds.length} total recalls, fetching their created_at dates from recalls table`);

        // Step 2: Fetch all recalls with their created_at dates from the recalls table
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
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        if (!allRecallsData || allRecallsData.length === 0) {
          console.log('[CategoryViewer] No recalls data found');
          setHasMore(false);
          if (!append) {
            setNotes([]);
          }
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        // Step 3: Sort by created_at
        const sortedRecalls = allRecallsData.sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          
          if (sortOrder === 'Newest') {
            return dateB - dateA; // Newest first (descending)
          } else {
            return dateA - dateB; // Oldest first (ascending)
          }
        });

        console.log(`[CategoryViewer] Sorted ${sortedRecalls.length} recalls by ${sortOrder}`);
        console.log(`[CategoryViewer] First recall date: ${sortedRecalls[0]?.created_at}, Last recall date: ${sortedRecalls[sortedRecalls.length - 1]?.created_at}`);

        // Step 4: Apply pagination to sorted results
        const paginatedRecalls = sortedRecalls.slice(from, to + 1);
        
        if (paginatedRecalls.length < ITEMS_PER_PAGE) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }

        console.log(`[CategoryViewer] Paginated to ${paginatedRecalls.length} recalls for page ${pageNum} (from index ${from} to ${to})`);

        if (paginatedRecalls.length === 0) {
          console.log('[CategoryViewer] No recalls in this page');
          setHasMore(false);
          if (!append) {
            setNotes([]);
          }
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        const paginatedRecallIds = paginatedRecalls.map(r => r.id);

        // Step 5: Fetch full recall data for paginated IDs
        console.log(`[CategoryViewer] Fetching full data for ${paginatedRecallIds.length} paginated recalls`);

        // Check cache first for recalls (from landing page)
        const cachedNotes: Note[] = [];
        const uncachedRecallIds: string[] = [];

        paginatedRecallIds.forEach(recallId => {
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
            .select('id, user_id, text, latitude, longitude, location, location_primary_type, created_at, updated_at')
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

        // Sort transformedNotes to match the order of paginatedRecallIds
        const orderedNotes = paginatedRecallIds
          .map(nid => transformedNotes.find(note => note.id === nid))
          .filter((note): note is Note => note !== undefined);

        console.log(`[CategoryViewer] Loaded ${orderedNotes.length} recalls (${cachedNotes.length} from cache, ${uncachedRecallIds.length} from DB)`);
        
        if (append) {
          // Prevent duplicates by filtering out notes that already exist
          setNotes(prevNotes => {
            const existingIds = new Set(prevNotes.map(note => note.id));
            const newUniqueNotes = orderedNotes.filter(note => !existingIds.has(note.id));
            console.log(`[CategoryViewer] Adding ${newUniqueNotes.length} new unique notes (filtered ${orderedNotes.length - newUniqueNotes.length} duplicates)`);
            return [...prevNotes, ...newUniqueNotes];
          });
        } else {
          setNotes(orderedNotes);
        }

        // Fire-and-forget: populate URL metadata in context so NoteCard can render UrlPreviewCard
        const noteIds = orderedNotes.map(n => n.id);
        if (noteIds.length > 0) {
          refreshUrlMetadata(noteIds);
        }
        
        setLoading(false);
        setIsLoadingMore(false);
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
        setLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (!recollectionsData || recollectionsData.length === 0) {
        console.log('[CategoryViewer] No recalls found for this page');
        setHasMore(false);
        if (!append) {
          setNotes([]);
        }
        setLoading(false);
        setIsLoadingMore(false);
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
          .select('id, user_id, text, latitude, longitude, location, location_primary_type, created_at, updated_at')
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

      // Fire-and-forget: populate URL metadata in context so NoteCard can render UrlPreviewCard
      const noteIds = transformedNotes.map(n => n.id);
      if (noteIds.length > 0) {
        refreshUrlMetadata(noteIds);
      }
    } catch (error) {
      console.error('[CategoryViewer] Error loading data:', error);
      Alert.alert('Error', 'Failed to load category data');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [id, user, router, getCachedNote, loadImagesForRecalls, sortOrder, refreshUrlMetadata]);

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

  // Keep the ref in sync so loadCategoryAndRecalls can call it without a circular dep
  startMatchingPollingRef.current = startMatchingPolling;

  // Bust the in-memory people cache once on mount so any stale entries that
  // were cached without photo_url (before this fix) are evicted immediately.
  useEffect(() => {
    console.log('[CategoryViewer] Clearing peopleCache on mount to evict stale entries missing photo_url');
    peopleCache.clear();
  }, []);

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
      if (rematchingTimeoutRef.current) {
        clearTimeout(rematchingTimeoutRef.current);
        rematchingTimeoutRef.current = null;
      }
    };
  }, [id, sortOrder, loadCategoryAndRecalls]); // Reload when sortOrder changes

  // Realtime subscription: refresh recalls as background matching inserts new rows
  useEffect(() => {
    if (!id || !user) return;

    const channelName = `realtime:${user.id}:recollections:${id}:${Math.random().toString(36).slice(2, 8)}`;

    const debouncedRefresh = debounce(() => {
      console.log('[CategoryViewer] Realtime: recollections changed, refreshing recalls');
      // Clear rematching indicator when we get the first update
      setIsRematching(false);
      if (rematchingTimeoutRef.current) {
        clearTimeout(rematchingTimeoutRef.current);
        rematchingTimeoutRef.current = null;
      }
      loadCategoryAndRecalls(1, false);
    }, 300);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recollections',
          filter: `category_id=eq.${id}`,
        },
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      debouncedRefresh.cancel();
      supabase.removeChannel(channel);
    };
  }, [id, user, loadCategoryAndRecalls]);

  const handleRefresh = async () => {
    console.log('[CategoryViewer] User initiated refresh');
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
      console.log('[CategoryViewer] Loading more recalls, page:', nextPage);
      setPage(nextPage);
      loadCategoryAndRecalls(nextPage, true);
    }
  }, [page, hasMore, isLoadingMore, loading, loadCategoryAndRecalls]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && !loading) {
      console.log('[CategoryViewer] onEndReached — loading more recalls...');
      loadMoreRecalls();
    }
  }, [hasMore, isLoadingMore, loading, loadMoreRecalls]);

  const openMenu = useCallback(() => {
    console.log('[CategoryViewer] User tapped ellipsis menu button');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    const SCREEN_WIDTH = Dimensions.get('window').width;
    const MENU_WIDTH = 180;
    const SCREEN_MARGIN = 12;
    const FALLBACK_ANCHOR = { top: insets.top + 160, left: SCREEN_WIDTH - MENU_WIDTH - SCREEN_MARGIN };

    const doOpen = (anchor: { top: number; left: number }) => {
      setMenuAnchor(anchor);
      setIsMenuOpen(true);
      Animated.timing(menuAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    };

    if (ellipsisButtonRef.current) {
      ellipsisButtonRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          // Center horizontally on the ellipsis
          const centeredLeft = x + width / 2 - MENU_WIDTH / 2;
          // Clamp to keep menu fully on-screen with a 12px margin
          const clampedLeft = Math.max(
            SCREEN_MARGIN,
            Math.min(centeredLeft, SCREEN_WIDTH - MENU_WIDTH - SCREEN_MARGIN)
          );
          const anchor = {
            top: y,
            left: clampedLeft,
          };
          console.log('[CategoryViewer] Ellipsis button measured, anchor:', anchor);
          doOpen(anchor);
        } else {
          console.log('[CategoryViewer] Ellipsis measure returned zero size, using fallback anchor');
          doOpen(FALLBACK_ANCHOR);
        }
      });
    } else {
      console.log('[CategoryViewer] Ellipsis ref not ready, using fallback anchor');
      doOpen(FALLBACK_ANCHOR);
    }
  }, [menuAnim, insets.top]);

  const closeMenu = useCallback(() => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      setIsMenuOpen(false);
      setMenuAnchor(null);
    });
  }, [menuAnim]);

  const handleNotePress = useCallback((noteId: string) => {
    try {
      console.log('[CategoryViewer] User tapped note:', noteId);
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('[CategoryViewer] Error navigating to note editor:', error);
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
    
    console.log('[CategoryViewer] User tapped edit button');
    setEditName(category.category_name);
    setEditDescription(category.category_search_description);
    setEditImage(category.icon_cdn_url);
    setShowEditModal(true);

    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (error) {
        console.error('[CategoryViewer] Error triggering haptic feedback:', error);
      }
    }
  };

  const handleCategoryPhotoUpload = useCallback(async (uri: string) => {
    if (!category || !user) return;
    try {
      setUploadingPhoto(true);
      console.log('[CategoryViewer] Starting category photo upload');

      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 512 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      console.log('[CategoryViewer] Image manipulated:', manipulatedImage.uri);

      const base64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('[CategoryViewer] Image converted to base64, length:', base64.length);

      const fileName = `category-${category.id}-${Date.now()}.jpg`;
      const cdnUrl = await uploadImageToCloudflare(base64, fileName, 'image/jpeg');

      if (!cdnUrl) {
        throw new Error('Failed to upload image to Cloudflare');
      }

      console.log('[CategoryViewer] Image uploaded to Cloudflare:', cdnUrl);

      const { error: updateError } = await supabase
        .from('recollection_categories')
        .update({ icon_cdn_url: cdnUrl })
        .eq('id', category.id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      console.log('[CategoryViewer] Category record updated with photo URL');

      setCategory(prev => prev ? { ...prev, icon_cdn_url: cdnUrl } : prev);

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[CategoryViewer] Error uploading category photo:', error);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [category, user]);

  const handleCategoryPhotoRemove = useCallback(async () => {
    if (!category || !user) return;
    try {
      setUploadingPhoto(true);
      console.log('[CategoryViewer] Removing category photo');

      const { error: updateError } = await supabase
        .from('recollection_categories')
        .update({ icon_cdn_url: null })
        .eq('id', category.id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      console.log('[CategoryViewer] Category photo removed');

      setCategory(prev => prev ? { ...prev, icon_cdn_url: null } : prev);

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[CategoryViewer] Error removing category photo:', error);
      Alert.alert('Error', 'Failed to remove photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [category, user]);

  const handleCategoryPhotoPress = useCallback(async () => {
    console.log('[CategoryViewer] User tapped category photo / Add/Edit Photo');
    try {
      Alert.alert(
        'Category Photo',
        'Choose an option',
        [
          {
            text: 'Take Photo',
            onPress: async () => {
              console.log('[CategoryViewer] User chose Take Photo for category');
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant camera permissions');
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.9,
              });
              if (!result.canceled && result.assets) {
                await handleCategoryPhotoUpload(result.assets[0].uri);
              }
            },
          },
          {
            text: 'Choose from Library',
            onPress: async () => {
              console.log('[CategoryViewer] User chose Choose from Library for category');
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('Permission needed', 'Please grant photo library permissions');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.9,
              });
              if (!result.canceled && result.assets) {
                await handleCategoryPhotoUpload(result.assets[0].uri);
              }
            },
          },
          ...(category?.icon_cdn_url
            ? [
                {
                  text: 'Remove Photo',
                  style: 'destructive' as const,
                  onPress: async () => {
                    await handleCategoryPhotoRemove();
                  },
                },
              ]
            : []),
          {
            text: 'Cancel',
            style: 'cancel' as const,
          },
        ]
      );
    } catch (error) {
      console.error('[CategoryViewer] Error handling category photo press:', error);
    }
  }, [category, handleCategoryPhotoUpload, handleCategoryPhotoRemove]);

  const handleSelectImage = async () => {
    try {
      console.log('[CategoryViewer] User tapped select image');
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
      console.error('[CategoryViewer] Error selecting image:', error);
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

    console.log('[CategoryViewer] User tapped save edit');
    setIsSaving(true);

    try {
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

      // Await the UPDATE — this is the only thing the user waits for
      console.log('[CategoryViewer] Updating category in DB');
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
        console.error('[CategoryViewer] Error updating category:', error);
        Alert.alert('Error', 'Failed to update category');
        // Do NOT close the dialog on failure
        return;
      }

      console.log('[CategoryViewer] Category updated successfully');

      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (hapticError) {
          console.error('[CategoryViewer] Error triggering haptic feedback:', hapticError);
        }
      }

      // Close dialog immediately — user should not wait for matching
      setShowEditModal(false);

      // Reload category header data
      await loadCategoryAndRecalls(1, false);

      // Fire-and-forget matching if description/name changed
      if (nameChanged || descriptionChanged) {
        console.log('[CategoryViewer] Description changed — firing match-recalls-to-category-async');
        setIsRematching(true);

        // 30s fallback: clear the indicator even if no realtime event arrives
        if (rematchingTimeoutRef.current) {
          clearTimeout(rematchingTimeoutRef.current);
        }
        rematchingTimeoutRef.current = setTimeout(() => {
          setIsRematching(false);
          rematchingTimeoutRef.current = null;
        }, 30000);

        Toast.show({
          type: 'success',
          text1: 'Category updated — re-matching recalls…',
          position: 'bottom',
        });

        (async () => {
          try {
            console.log('[CategoryViewer] Invoking match-recalls-to-category-async for:', category.id);
            await supabase.functions.invoke('match-recalls-to-category-async', {
              body: { categoryId: category.id, userId: user.id },
            });
          } catch (e) {
            console.error('[CategoryViewer] match-recalls-to-category-async failed:', e);
          }
        })();
      } else {
        Toast.show({
          type: 'success',
          text1: 'Category updated',
          position: 'bottom',
        });
      }
    } catch (error) {
      console.error('[CategoryViewer] Error updating category:', error);
      Alert.alert('Error', 'Failed to update category');
      // Do NOT close the dialog on failure
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePress = () => {
    console.log('[CategoryViewer] User tapped delete button');
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
      console.log('[CategoryViewer] User confirmed delete');
      setIsDeleting(true);

      // Delete all recollections for this category first
      const { error: recollectionsError } = await supabase
        .from('recollections')
        .delete()
        .eq('category_id', category.id)
        .eq('user_id', user.id);

      if (recollectionsError) {
        console.error('[CategoryViewer] Error deleting recollections:', recollectionsError);
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
        console.error('[CategoryViewer] Error deleting category:', categoryError);
        Alert.alert('Error', 'Failed to delete category');
        return;
      }

      console.log('[CategoryViewer] Category deleted successfully');

      // Haptic feedback
      if (Platform.OS !== 'web') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('[CategoryViewer] Error triggering haptic feedback:', error);
        }
      }

      // Navigate back
      router.back();
    } catch (error) {
      console.error('[CategoryViewer] Error deleting category:', error);
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

  // Render skeleton loaders for initial load
  const renderSkeletons = () => {
    return (
      <View style={styles.container}>
        <FlatList
          data={[]}
          keyExtractor={(item: any) => item.id}
          renderItem={() => null}
          ListHeaderComponent={
            <View>
              {/* Category Info Skeleton */}
              <View style={styles.categoryInfoContainer}>
                <View style={styles.categoryTopRow}>
                  {/* Category Icon Skeleton */}
                  <SkeletonLoader
                    width={88}
                    height={88}
                    borderRadius={16}
                    variant="wave"
                  />

                  {/* Category Text Skeleton */}
                  <View style={styles.categoryTextContainer}>
                    <SkeletonLoader
                      width="70%"
                      height={22}
                      borderRadius={4}
                      variant="wave"
                      style={{ marginBottom: 8 }}
                    />
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
              </View>

              {/* Note Cards Skeleton */}
              <View style={styles.notesContainer}>
                {[...Array(3)].map((_, index) => (
                  <NoteCard
                    key={`skeleton-${index}`}
                    note={{} as any}
                    onPress={() => { console.log('Skeleton card pressed'); }}
                    loading={true}
                  />
                ))}
              </View>
            </View>
          }
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        />
      </View>
    );
  };

  // Render matching placeholders when category is being matched
  const renderMatchingPlaceholders = () => {
    return (
      <View style={styles.container}>
        <FlatList
          data={[]}
          keyExtractor={(item: any) => item.id}
          renderItem={() => null}
          ListHeaderComponent={
            <View>
              {/* Category Info - Real data */}
              {category && (
                <View style={styles.categoryInfoContainer}>
                  <View style={styles.categoryTopRow}>
                    {/* Category Icon */}
                    <View style={styles.iconContainer}>
                      {category.icon_cdn_url && (
                        // cdnVariant 'thumbnail' requires the variant in Cloudflare Images dashboard.
                        // If absent, cdnVariant is a no-op — still benefits from expo-image caching.
                        <Image
                          source={{ uri: cdnVariant(category.icon_cdn_url, 'thumbnail') as string }}
                          style={styles.categoryIcon}
                          contentFit="cover"
                          transition={150}
                          cachePolicy="memory-disk"
                        />
                      )}
                    </View>

                    {/* Name, Description and Matching Status */}
                    <View style={styles.categoryTextContainer}>
                      <Text style={styles.categoryHeading} numberOfLines={2} ellipsizeMode="tail">
                        {category.category_name}
                      </Text>
                      <Text style={styles.categoryDescription} numberOfLines={3}>
                        {category.category_search_description}
                      </Text>
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
                    onPress={() => { console.log('Matching placeholder card pressed'); }}
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
            </View>
          }
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        />
      </View>
    );
  };

  const menuOpacity = menuAnim;
  const menuTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 0],
  });

  const renderNoteItem = useCallback(({ item }: { item: Note }) => (
    <View style={styles.noteCardRow}>
      <NoteCard
        note={item}
        onPress={() => handleNotePress(item.id)}
        onDelete={() => handleDeleteRecall(item.id)}
      />
    </View>
  ), [handleNotePress, handleDeleteRecall]);

  // Shared Stack.Screen options with centered branded header and back chevron
  const stackScreenOptions = {
    headerShown: true,
    headerBackVisible: false,
    headerBackTitleVisible: false,
    headerLeft: () => (
      <Pressable
        onPress={() => {
          console.log('[CategoryViewer] Back chevron tapped');
          router.back();
        }}
        style={styles.headerButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <IconSymbol name="chevron.left" size={24} color={colors.text} />
      </Pressable>
    ),
    headerTitle: () => <RecallHeader />,
    headerTitleAlign: 'center' as const,
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
    headerTintColor: colors.text,
  };

  const recallCountLabel = `${totalRecallCount} ${totalRecallCount === 1 ? 'Recall' : 'Recalls'}`;

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={stackScreenOptions} />
        {renderSkeletons()}
      </View>
    );
  }

  if (!category) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={stackScreenOptions} />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Category Not Found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={stackScreenOptions} />

      {/* Context menu popover */}
      {isMenuOpen && menuAnchor && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Backdrop */}
          <Pressable
            style={styles.menuBackdrop}
            onPress={closeMenu}
          />
          {/* Menu card — anchored to bottom-right of the ellipsis button */}
          <Animated.View
            style={[
              styles.menuCard,
              { top: menuAnchor.top, left: menuAnchor.left },
              { opacity: menuOpacity, transform: [{ translateY: menuTranslateY }] },
            ]}
          >
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              onPress={() => {
                console.log('[CategoryViewer] User tapped Add/Edit Photo from popover menu');
                closeMenu();
                handleCategoryPhotoPress();
              }}
            >
              <IconSymbol name="camera.fill" size={18} color={colors.text} />
              <Text style={styles.menuRowText}>Add/Edit Photo</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              onPress={() => {
                console.log('[CategoryViewer] User tapped Edit from popover menu');
                closeMenu();
                handleEditPress();
              }}
            >
              <IconSymbol name="pencil" size={18} color={colors.text} />
              <Text style={styles.menuRowText}>Edit</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              onPress={() => {
                console.log('[CategoryViewer] User tapped Delete from popover menu');
                closeMenu();
                handleDeletePress();
              }}
            >
              <IconSymbol name="trash" size={18} color={colors.error} />
              <Text style={[styles.menuRowText, styles.menuRowTextDestructive]}>Delete</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* Show matching placeholders if category is being matched */}
      {isMatching ? (
        renderMatchingPlaceholders()
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          renderItem={renderNoteItem}
          ListHeaderComponent={
            <View>
              {/* Two-column header: image left, name+description right */}
              <View style={styles.categoryInfoContainer}>
                <View style={styles.categoryTopRow}>
                  {/* Category Icon — tappable to add/edit photo */}
                  <Pressable
                    onPress={handleCategoryPhotoPress}
                    disabled={uploadingPhoto}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.iconContainer}
                  >
                    {category.icon_cdn_url ? (
                      // cdnVariant 'thumbnail' requires the variant in Cloudflare Images dashboard.
                      // If absent, cdnVariant is a no-op — still benefits from expo-image caching.
                      <Image
                        source={{ uri: cdnVariant(category.icon_cdn_url, 'thumbnail') as string }}
                        style={styles.categoryIcon}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[styles.categoryIcon, styles.categoryIconPlaceholder]}>
                        <IconSymbol name="camera.fill" size={28} color={colors.textTertiary} />
                      </View>
                    )}
                    {uploadingPhoto && (
                      <View style={styles.uploadingOverlay}>
                        <ActivityIndicator size="large" color={colors.primary} />
                      </View>
                    )}
                  </Pressable>

                  {/* Name + Description stacked to the right */}
                  <View style={styles.categoryTextContainer}>
                    {/* Title row: name (flex) + ellipsis button (fixed) */}
                    <View style={styles.categoryTitleRow}>
                      <Text style={[styles.categoryHeading, { flex: 1 }]} numberOfLines={2} ellipsizeMode="tail">
                        {category.category_name}
                      </Text>
                      <View ref={ellipsisButtonRef} collapsable={false}>
                        <Pressable
                          onPress={openMenu}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          style={styles.ellipsisButton}
                        >
                          <IconSymbol name="ellipsis" size={20} color={colors.text} />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.categoryDescription} numberOfLines={3}>
                      {category.category_search_description}
                    </Text>
                  </View>
                </View>

                {/* Sort pills — left-aligned, no label, no separators */}
                <View style={styles.sortContainer}>
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

                {/* Recall count — left-aligned */}
                <View style={styles.countEllipsisRow}>
                  <Text style={styles.recallCount}>
                    {recallCountLabel}
                  </Text>
                </View>
              </View>

              {/* Rematching indicator — shown while background matching is in flight */}
              {isRematching && (
                <View style={styles.rematchingBanner}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.rematchingBannerText}>matching…</Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={renderEmptyState()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          onEndReached={!loading ? handleEndReached : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.loadingMoreContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.loadingMoreText}>Loading more...</Text>
              </View>
            ) : !hasMore && notes.length > 0 ? (
              <View style={styles.endContainer}>
                <Text style={styles.endText}>You&apos;ve reached the end</Text>
              </View>
            ) : null
          }
        />
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
                  <Image source={{ uri: editImage }} style={styles.modalSelectedImage} contentFit="cover" transition={150} cachePolicy="memory-disk" />
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
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 128,
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
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 200,
  },
  menuCard: {
    position: 'absolute',
    width: 180,
    backgroundColor: colors.cardDark,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 300,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  menuRowPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  menuRowText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  menuRowTextDestructive: {
    color: colors.error,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  ellipsisButton: {
    paddingLeft: 8,
    paddingTop: 2,
  },
  categoryHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  categoryInfoContainer: {
    padding: 16,
    paddingBottom: 12,
  },
  categoryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  iconContainer: {
    position: 'relative',
  },
  categoryIcon: {
    width: 88,
    height: 88,
    borderRadius: 16,
  },
  categoryIconPlaceholder: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryTextContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  categoryDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  recallCount: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  countEllipsisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 4,
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
  rematchingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: `${colors.primary}12`,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${colors.primary}25`,
  },
  rematchingBannerText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  notesContainer: {
    paddingTop: 16,
  },
  noteCardRow: {
    paddingHorizontal: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
