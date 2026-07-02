import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import RecallHeader from '@/components/RecallHeader';

import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { IconSymbol } from '@/components/IconSymbol';
import { PersonAvatar } from '@/components/PersonAvatar';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, getImageDataUrl } from '@/utils/supabase';
import { uploadImageToCloudflare } from '@/utils/cloudflareCDN';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { useNotes } from '@/hooks/useNotes';
import { useNotesContext } from '@/contexts/NotesContext';
import { peopleCache, imageCache, CostCalculator } from '@/utils/memoryCache';
import { debounce } from '@/utils/debounce';
import { PillsRow } from '@/components/PillsRow';
import { NoteEditorSlideUp } from '@/components/NoteEditorSlideUp';

type SortOrder = 'Newest' | 'Oldest' | 'Best match';

export default function PersonRecallsScreen() {
  const router = useRouter();
  const { personId } = useLocalSearchParams<{ personId: string }>();
  const { user } = useAuth();
  const { getCachedNote } = useNotes();
  const { refreshUrlMetadata, getUrlMetadataForRecall } = useNotesContext();
  const insets = useSafeAreaInsets();

  // Person data
  const [personName, setPersonName] = useState<string>('');
  const [personPhotoUrl, setPersonPhotoUrl] = useState<string | null>(null);
  const [personNotFound, setPersonNotFound] = useState(false);

  // Recalls list
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalRecallCount, setTotalRecallCount] = useState(0);
  const [sortOrder, setSortOrder] = useState<SortOrder>('Newest');

  // Slide-up editor
  const [slideUpNoteId, setSlideUpNoteId] = useState<string | null>(null);
  const [slideUpVisible, setSlideUpVisible] = useState(false);

  // Sort loading (separate from main loading to avoid full-screen skeleton on sort change)
  const [isSortLoading, setIsSortLoading] = useState(false);
  const prevSortOrderRef = useRef<SortOrder>(sortOrder);

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUpdateTrigger, setPhotoUpdateTrigger] = useState(0);

  // Photo menu (ellipsis menu removed — photo button opens photo menu directly)
  const [isPhotoMenuOpen, setIsPhotoMenuOpen] = useState(false);
  const photoMenuAnim = useRef(new Animated.Value(0)).current;
  const photoMenuScaleAnim = useRef(new Animated.Value(0.95)).current;
  const photoButtonRef = useRef<View>(null);
  const [photoMenuAnchor, setPhotoMenuAnchor] = useState<{ top: number; left: number } | null>(null);

  const ITEMS_PER_PAGE = 10;

  // ─── People batch loader ────────────────────────────────────────────────────
  const loadPeopleForRecalls = useCallback(async (recallIds: string[]) => {
    if (!recallIds || recallIds.length === 0) return {};

    try {
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
        console.log(`[PersonRecalls] All people data cached for ${recallIds.length} recalls`);
        return result;
      }

      const { data: recallPeopleData, error: recallPeopleError } = await supabase
        .from('recall_people')
        .select('recall_id, person_id, persons!inner(id, person_name, photo_url)')
        .in('recall_id', uncachedIds);

      if (recallPeopleError) {
        console.error('[PersonRecalls] Error loading recall_people:', recallPeopleError);
        return result;
      }

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

      uncachedIds.forEach(rid => {
        const people = peopleByRecallId[rid] || [];
        const cost = CostCalculator.forPeople(people);
        peopleCache.set(rid, people, cost);
        result[rid] = people;
      });

      console.log(`[PersonRecalls] Loaded people for ${Object.keys(peopleByRecallId).length} recalls (${uncachedIds.length} from DB, ${recallIds.length - uncachedIds.length} from cache)`);
      return result;
    } catch (error) {
      console.error('[PersonRecalls] Error loading people for recalls:', error);
      return {};
    }
  }, []);

  // ─── Image + people loader ──────────────────────────────────────────────────
  const loadImagesForRecalls = useCallback(async (recalls: any[]) => {
    const recallIds = recalls.map(r => r.id);
    const peopleByRecallId = await loadPeopleForRecalls(recallIds);

    const { data: allImagesData, error: allImagesError } = await supabase
      .from('recall_images')
      .select('id, recall_id, cdn_url')
      .in('recall_id', recallIds)
      .order('created_at', { ascending: true });

    if (allImagesError) {
      console.error('[PersonRecalls] Error fetching images:', allImagesError);
    }

    const imagesByRecallId = new Map<string, any[]>();
    (allImagesData || []).forEach(img => {
      if (!imagesByRecallId.has(img.recall_id)) {
        imagesByRecallId.set(img.recall_id, []);
      }
      imagesByRecallId.get(img.recall_id)!.push(img);
    });

    const processedNotes = await Promise.all(
      recalls.map(async (recall) => {
        try {
          const recallImages = imagesByRecallId.get(recall.id) || [];

          const imageResults = await Promise.all(
            recallImages.map(async (img, index) => {
              try {
                if (index < 2) {
                  const cachedImage = imageCache.get(img.id);
                  if (cachedImage) return { url: cachedImage, id: img.id };

                  if (img.cdn_url) {
                    const cost = CostCalculator.forImage(img.cdn_url);
                    imageCache.set(img.id, img.cdn_url, cost);
                    return { url: img.cdn_url, id: img.id };
                  }

                  const dataUrl = await getImageDataUrl(img.id);
                  if (dataUrl) {
                    const cost = CostCalculator.forImage(dataUrl);
                    imageCache.set(img.id, dataUrl, cost);
                    return { url: dataUrl, id: img.id };
                  }
                  return { url: '', id: img.id };
                } else {
                  return { url: '', id: img.id };
                }
              } catch (error) {
                console.error(`[PersonRecalls] Exception processing image ${img.id}:`, error);
                return { url: '', id: img.id };
              }
            })
          );

          const validImageUrls = imageResults.map(r => r.url);
          const imageIds = imageResults.map(r => r.id);
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
          console.error(`[PersonRecalls] Exception processing recall ${recall.id}:`, error);
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
            match_score: 0,
          };
        }
      })
    );

    return processedNotes;
  }, [loadPeopleForRecalls]);

  // ─── Main data loader ───────────────────────────────────────────────────────
  const loadPersonAndRecalls = useCallback(async (pageNum: number = 1, append: boolean = false, options?: { sortChange?: boolean }) => {
    if (!personId || !user) {
      console.log('[PersonRecalls] No personId or user');
      setLoading(false);
      return;
    }

    try {
      if (!append) {
        if (options?.sortChange) {
          setIsSortLoading(true);
        } else {
          setLoading(true);
        }
      } else {
        setIsLoadingMore(true);
      }

      console.log(`[PersonRecalls] Loading person and recalls page ${pageNum} for:`, personId, 'sortOrder:', sortOrder);

      // Fetch person details on first load
      if (pageNum === 1) {
        const { data: personData, error: personError } = await supabase
          .from('persons')
          .select('person_name, photo_url')
          .eq('id', personId)
          .eq('user_id', user.id)
          .single();

        if (personError || !personData) {
          console.error('[PersonRecalls] Error loading person:', personError);
          setPersonNotFound(true);
          setLoading(false);
          return;
        }

        setPersonName(personData.person_name);
        setPersonPhotoUrl(personData.photo_url || null);
        setPersonNotFound(false);
        console.log('[PersonRecalls] Person loaded:', personData.person_name);
      }

      // Fetch total count on first load
      if (pageNum === 1) {
        const { count, error: countError } = await supabase
          .from('recall_people')
          .select('recall_id', { count: 'exact', head: true })
          .eq('person_id', personId)
          .eq('user_id', user.id);

        if (countError) {
          console.error('[PersonRecalls] Error fetching total recall count:', countError);
          setTotalRecallCount(0);
        } else {
          setTotalRecallCount(count || 0);
          console.log('[PersonRecalls] Total recall count:', count);
        }
      }

      const from = (pageNum - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // For date sorting: fetch all recall IDs, sort by recall created_at, then paginate
      if (sortOrder === 'Newest' || sortOrder === 'Oldest' || sortOrder === 'Best match') {
        // Get all recall IDs for this person
        const { data: allRecallPeopleData, error: allRecallPeopleError } = await supabase
          .from('recall_people')
          .select('recall_id')
          .eq('person_id', personId)
          .eq('user_id', user.id);

        if (allRecallPeopleError) {
          console.error('[PersonRecalls] Error fetching all recall_people:', allRecallPeopleError);
          if (!append) setNotes([]);
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        if (!allRecallPeopleData || allRecallPeopleData.length === 0) {
          console.log('[PersonRecalls] No recalls found for this person');
          setHasMore(false);
          if (!append) setNotes([]);
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        const allRecallIds = allRecallPeopleData.map(r => r.recall_id);

        // Fetch created_at for all recalls to sort
        const { data: allRecallsData, error: allRecallsError } = await supabase
          .from('recalls')
          .select('id, created_at')
          .in('id', allRecallIds)
          .eq('user_id', user.id);

        if (allRecallsError || !allRecallsData || allRecallsData.length === 0) {
          console.error('[PersonRecalls] Error fetching recalls for sorting:', allRecallsError);
          if (!append) setNotes([]);
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        // Sort by created_at (Best match falls back to Newest)
        const sortedRecalls = allRecallsData.sort((a, b) => {
          const dateA = new Date(a.created_at).getTime();
          const dateB = new Date(b.created_at).getTime();
          if (sortOrder === 'Oldest') {
            return dateA - dateB;
          }
          return dateB - dateA; // Newest and Best match both sort newest-first
        });

        console.log(`[PersonRecalls] Sorted ${sortedRecalls.length} recalls by ${sortOrder}`);

        const paginatedRecalls = sortedRecalls.slice(from, to + 1);

        if (paginatedRecalls.length < ITEMS_PER_PAGE) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }

        if (paginatedRecalls.length === 0) {
          setHasMore(false);
          if (!append) setNotes([]);
          setLoading(false);
          setIsLoadingMore(false);
          return;
        }

        const paginatedRecallIds = paginatedRecalls.map(r => r.id);

        // Check cache first
        const cachedNotes: Note[] = [];
        const uncachedRecallIds: string[] = [];

        paginatedRecallIds.forEach(recallId => {
          const cachedNote = getCachedNote(recallId);
          if (cachedNote) {
            console.log(`[PersonRecalls] Using cached note for ${recallId}`);
            cachedNotes.push(cachedNote);
          } else {
            uncachedRecallIds.push(recallId);
          }
        });

        let transformedNotes: Note[] = [...cachedNotes];

        if (uncachedRecallIds.length > 0) {
          console.log(`[PersonRecalls] Fetching ${uncachedRecallIds.length} uncached recalls from DB`);

          const { data: recallsData, error: recallsError } = await supabase
            .from('recalls')
            .select('id, user_id, text, latitude, longitude, location, location_primary_type, created_at, updated_at')
            .in('id', uncachedRecallIds)
            .eq('user_id', user.id);

          if (recallsError) {
            console.error('[PersonRecalls] Error fetching recalls:', recallsError);
          } else if (recallsData) {
            const processedNotes = await loadImagesForRecalls(recallsData);
            transformedNotes = [...transformedNotes, ...processedNotes];
          }
        }

        // Preserve sort order
        const orderedNotes = paginatedRecallIds
          .map(nid => transformedNotes.find(note => note.id === nid))
          .filter((note): note is Note => note !== undefined);

        console.log(`[PersonRecalls] Loaded ${orderedNotes.length} recalls (${cachedNotes.length} from cache, ${uncachedRecallIds.length} from DB)`);

        if (append) {
          setNotes(prevNotes => {
            const existingIds = new Set(prevNotes.map(note => note.id));
            const newUniqueNotes = orderedNotes.filter(note => !existingIds.has(note.id));
            console.log(`[PersonRecalls] Adding ${newUniqueNotes.length} new unique notes (filtered ${orderedNotes.length - newUniqueNotes.length} duplicates)`);
            return [...prevNotes, ...newUniqueNotes];
          });
        } else {
          setNotes(orderedNotes);
        }

        const noteIds = orderedNotes.map(n => n.id);
        if (noteIds.length > 0) {
          refreshUrlMetadata(noteIds);
        }
      }
    } catch (error) {
      console.error('[PersonRecalls] Error loading data:', error);
      Alert.alert('Error', 'Failed to load person data');
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
      setIsSortLoading(false);
    }
  }, [personId, user, getCachedNote, loadImagesForRecalls, sortOrder, refreshUrlMetadata]);

  // ─── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    console.log('[PersonRecalls] useEffect triggered - personId:', personId, 'sortOrder:', sortOrder);
    const isSortChange = prevSortOrderRef.current !== sortOrder;
    prevSortOrderRef.current = sortOrder;
    loadPersonAndRecalls(1, false, isSortChange ? { sortChange: true } : undefined);
    setPage(1);
    setHasMore(true);
  }, [personId, sortOrder, loadPersonAndRecalls]);

  // Realtime subscription for recall_people changes
  useEffect(() => {
    if (!personId || !user) return;

    const channelName = `realtime:${user.id}:recall_people:${personId}:${Math.random().toString(36).slice(2, 8)}`;

    const debouncedRefresh = debounce(() => {
      console.log('[PersonRecalls] Realtime: recall_people changed, refreshing recalls');
      loadPersonAndRecalls(1, false);
    }, 300);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recall_people',
          filter: `person_id=eq.${personId}`,
        },
        debouncedRefresh,
      )
      .subscribe();

    return () => {
      debouncedRefresh.cancel();
      supabase.removeChannel(channel);
    };
  }, [personId, user, loadPersonAndRecalls]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    console.log('[PersonRecalls] User initiated refresh');
    setRefreshing(true);
    peopleCache.clear();
    imageCache.clear();
    setPage(1);
    setHasMore(true);

    if (personId && user) {
      const { count, error: countError } = await supabase
        .from('recall_people')
        .select('recall_id', { count: 'exact', head: true })
        .eq('person_id', personId)
        .eq('user_id', user.id);

      if (!countError) {
        setTotalRecallCount(count || 0);
        console.log('[PersonRecalls] Total recall count refreshed:', count);
      }
    }

    await loadPersonAndRecalls(1, false);
    setRefreshing(false);
  };

  const loadMoreRecalls = useCallback(() => {
    if (!isLoadingMore && hasMore && !loading) {
      const nextPage = page + 1;
      console.log('[PersonRecalls] Loading more recalls, page:', nextPage);
      setPage(nextPage);
      loadPersonAndRecalls(nextPage, true);
    }
  }, [page, hasMore, isLoadingMore, loading, loadPersonAndRecalls]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && !loading) {
      console.log('[PersonRecalls] onEndReached — loading more recalls...');
      loadMoreRecalls();
    }
  }, [hasMore, isLoadingMore, loading, loadMoreRecalls]);

  const openPhotoMenu = useCallback(() => {
    console.log('[PersonRecalls] User tapped person photo button');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    const SCREEN_WIDTH = Dimensions.get('window').width;
    const SCREEN_HEIGHT = Dimensions.get('window').height;
    const MENU_WIDTH = 220;
    const centeredLeft = (SCREEN_WIDTH - MENU_WIDTH) / 2;
    // Position near bottom of screen, above safe area
    const anchor = { top: SCREEN_HEIGHT - 220 - insets.bottom - 24, left: centeredLeft };
    setPhotoMenuAnchor(anchor);
    setIsPhotoMenuOpen(true);
    photoMenuAnim.setValue(0);
    photoMenuScaleAnim.setValue(0.95);
    Animated.parallel([
      Animated.timing(photoMenuAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(photoMenuScaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [photoMenuAnim, photoMenuScaleAnim, insets.bottom]);

  const closePhotoMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(photoMenuAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      Animated.timing(photoMenuScaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setIsPhotoMenuOpen(false);
      setPhotoMenuAnchor(null);
    });
  }, [photoMenuAnim, photoMenuScaleAnim]);

  const handleNotePress = useCallback((noteId: string) => {
    console.log('[PersonRecalls] User tapped note, opening slide-up editor:', noteId);
    setSlideUpNoteId(noteId);
    setSlideUpVisible(true);
  }, []);

  // ─── Photo upload flow ───────────────────────────────────────────────────────
  const handlePhotoUpload = useCallback(async (uri: string) => {
    try {
      setUploadingPhoto(true);
      console.log('[PersonRecalls] Starting photo upload process');

      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 512 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      console.log('[PersonRecalls] Image manipulated:', manipulatedImage.uri);

      const base64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('[PersonRecalls] Image converted to base64, length:', base64.length);

      const fileName = `person-${personId}-${Date.now()}.jpg`;
      const cdnUrl = await uploadImageToCloudflare(base64, fileName, 'image/jpeg');

      if (!cdnUrl) {
        throw new Error('Failed to upload image to Cloudflare');
      }

      console.log('[PersonRecalls] Image uploaded to Cloudflare:', cdnUrl);

      const { error: updateError } = await supabase
        .from('persons')
        .update({ photo_url: cdnUrl })
        .eq('id', personId)
        .eq('user_id', user?.id);

      if (updateError) throw updateError;

      console.log('[PersonRecalls] Person record updated with photo URL');

      setPersonPhotoUrl(cdnUrl);
      peopleCache.clear();
      console.log('[PersonRecalls] Clearing people cache to update photo everywhere');
      setPhotoUpdateTrigger(prev => prev + 1);

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[PersonRecalls] Error uploading photo:', error);
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [personId, user]);

  const handlePhotoRemove = useCallback(async () => {
    try {
      setUploadingPhoto(true);
      console.log('[PersonRecalls] Removing person photo');

      const { error: updateError } = await supabase
        .from('persons')
        .update({ photo_url: null })
        .eq('id', personId)
        .eq('user_id', user?.id);

      if (updateError) throw updateError;

      console.log('[PersonRecalls] Person photo removed');

      setPersonPhotoUrl(null);
      peopleCache.clear();
      console.log('[PersonRecalls] Clearing people cache to update photo everywhere');
      setPhotoUpdateTrigger(prev => prev + 1);

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[PersonRecalls] Error removing photo:', error);
      Alert.alert('Error', 'Failed to remove photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [personId, user]);

  const handlePhotoPress = useCallback(async () => {
    openPhotoMenu();
  }, [openPhotoMenu]);

  const handleTakePhoto = useCallback(async () => {
    console.log('[PersonRecalls] User chose Take Photo');
    closePhotoMenu();
    try {
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
        await handlePhotoUpload(result.assets[0].uri);
      }
    } catch (error) {
      console.error('[PersonRecalls] Error taking photo:', error);
    }
  }, [closePhotoMenu, handlePhotoUpload]);

  const handleChooseFromLibrary = useCallback(async () => {
    console.log('[PersonRecalls] User chose Choose from Library');
    closePhotoMenu();
    try {
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
        await handlePhotoUpload(result.assets[0].uri);
      }
    } catch (error) {
      console.error('[PersonRecalls] Error choosing from library:', error);
    }
  }, [closePhotoMenu, handlePhotoUpload]);

  const handleRemovePhotoAction = useCallback(async () => {
    console.log('[PersonRecalls] User chose Remove Photo');
    closePhotoMenu();
    await handlePhotoRemove();
  }, [closePhotoMenu, handlePhotoRemove]);

  // ─── Render helpers ──────────────────────────────────────────────────────────
  const renderSkeletons = () => (
    <View style={styles.container}>
      <FlatList
        data={[]}
        keyExtractor={(item: any) => item.id}
        renderItem={() => null}
        ListHeaderComponent={
          <View>
            <View style={styles.titleInfoContainer}>
              <View style={styles.titleTopRow}>
                <SkeletonLoader width={88} height={88} borderRadius={16} variant="wave" />
                <View style={styles.titleTextContainer}>
                  <SkeletonLoader width="70%" height={22} borderRadius={4} variant="wave" style={{ marginBottom: 8 }} />
                </View>
              </View>
            </View>
            <View style={styles.notesContainer}>
              {[...Array(3)].map((_, index) => (
                <NoteCard
                  key={`skeleton-${index}`}
                  note={{} as any}
                  onPress={() => { console.log('[PersonRecalls] Skeleton card pressed'); }}
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

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <IconSymbol
          ios_icon_name="person.fill.questionmark"
          android_material_icon_name="person_search"
          size={64}
          color={colors.textTertiary}
        />
      </View>
      <Text style={styles.emptyTitle}>No Recalls Yet</Text>
      <Text style={styles.emptyText}>
        No recalls mention {personName || 'this person'} yet. Create new recalls and tag them to see them here.
      </Text>
    </View>
  );

  const renderNoteItem = useCallback(({ item }: { item: Note }) => {
    const itemUrlMeta = getUrlMetadataForRecall(item.id);
    return (
      <View style={styles.noteCardRow}>
        <NoteCard
          key={`${item.id}-${photoUpdateTrigger}`}
          note={item}
          urlMeta={itemUrlMeta}
          onPress={() => { console.log('[PersonRecalls] NoteCard onPress:', item.id); setSlideUpNoteId(item.id); setSlideUpVisible(true); }}
          onCardPress={(id) => { console.log('[PersonRecalls] NoteCard onCardPress:', id); setSlideUpNoteId(id); setSlideUpVisible(true); }}
          loading={false}
        />
      </View>
    );
  }, [photoUpdateTrigger, getUrlMetadataForRecall]);

  // ─── Stack.Screen options ────────────────────────────────────────────────────
  const stackScreenOptions = {
    headerShown: true,
    headerBackVisible: false,
    headerBackTitleVisible: false,
    headerLeft: () => (
      <Pressable
        onPress={() => {
          console.log('[PersonRecalls] Back chevron tapped');
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/(home)');
          }
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

  // ─── Loading state ───────────────────────────────────────────────────────────
  if (loading && !isSortLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={stackScreenOptions} />
        {renderSkeletons()}
      </View>
    );
  }

  // ─── Person not found ────────────────────────────────────────────────────────
  if (personNotFound) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={stackScreenOptions} />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Person Not Found</Text>
          <Text style={styles.emptyText}>This person could not be found.</Text>
        </View>
      </View>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Stack.Screen options={stackScreenOptions} />

      {/* Photo menu popover */}
      {isPhotoMenuOpen && photoMenuAnchor && (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}>
          <Pressable style={styles.menuBackdrop} onPress={closePhotoMenu} />
          <Animated.View
            style={[
              styles.menuCard,
              { top: photoMenuAnchor.top, left: photoMenuAnchor.left, width: 220 },
              { opacity: photoMenuAnim, transform: [{ scale: photoMenuScaleAnim }] },
            ]}
          >
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              onPress={handleTakePhoto}
            >
              <IconSymbol name="camera.fill" size={18} color={colors.text} />
              <Text style={styles.menuRowText}>Take Photo</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              onPress={handleChooseFromLibrary}
            >
              <IconSymbol
                name="photo.on.rectangle"
                size={18}
                color={colors.text}
              />
              <Text style={styles.menuRowText}>Choose from Library</Text>
            </Pressable>
            {personPhotoUrl && (
              <Pressable
                style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                onPress={handleRemovePhotoAction}
              >
                <IconSymbol name="trash.fill" size={18} color="#FF3B30" />
                <Text style={[styles.menuRowText, { color: '#FF3B30' }]}>Remove Photo</Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      )}

      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        renderItem={renderNoteItem}
        ListHeaderComponent={
          <View>
            {/* Title row: 88×88 image left, name right, ellipsis top-right */}
            <View style={styles.titleInfoContainer}>
              <View style={styles.titleTopRow}>
                {/* Person photo / avatar */}
                <View ref={photoButtonRef} collapsable={false}>
                  <Pressable
                    onPress={handlePhotoPress}
                    disabled={uploadingPhoto}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.titleImageWrapper}
                  >
                    {personPhotoUrl ? (
                      <PersonAvatar
                        key={`person-avatar-${photoUpdateTrigger}`}
                        personName={personName}
                        photoUrl={personPhotoUrl}
                        size={88}
                        style={styles.titleImage}
                      />
                    ) : (
                      <PersonAvatar
                        key={`person-avatar-${photoUpdateTrigger}`}
                        personName={personName}
                        photoUrl={null}
                        size={88}
                        style={styles.titleImage}
                      />
                    )}
                    {!personPhotoUrl && !uploadingPhoto && (
                      <View style={styles.clickToEditOverlay}>
                        <Text style={styles.clickToEditText}>Click to edit</Text>
                      </View>
                    )}
                    {uploadingPhoto && (
                      <View style={styles.uploadingOverlay}>
                        <ActivityIndicator size="large" color={colors.primary} />
                      </View>
                    )}
                  </Pressable>
                </View>

                {/* Name column */}
                <View style={styles.titleTextContainer}>
                  <View style={styles.titleNameRow}>
                    <Text style={[styles.titleHeading, { flex: 1 }]} numberOfLines={2} ellipsizeMode="tail">
                      {personName}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Sort pills */}
              <View style={styles.sortContainer}>
                <PillsRow
                  items={[
                    { id: 'Newest', label: 'Newest' },
                    { id: 'Oldest', label: 'Oldest' },
                    { id: 'Best match', label: 'Best match' },
                  ]}
                  selected={sortOrder}
                  onSelect={(id) => {
                    if (id) {
                      console.log('[PersonRecalls] Sort order changed to:', id);
                      setSortOrder(id as SortOrder);
                    }
                  }}
                />
              </View>
              {isSortLoading && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />
              )}

              {/* Count row */}
              <View style={styles.countEllipsisRow}>
                <Text style={styles.recallCount}>
                  {recallCountLabel}
                </Text>
              </View>
            </View>
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
        windowSize={10}
        maxToRenderPerBatch={6}
        initialNumToRender={8}
        removeClippedSubviews
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      />

      <NoteEditorSlideUp
        noteId={slideUpNoteId ?? undefined}
        visible={slideUpVisible}
        onClose={() => setSlideUpVisible(false)}
      />
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
  // ─── Title row (mirrors categoryInfoContainer / categoryTopRow) ──────────────
  titleInfoContainer: {
    padding: 16,
    paddingBottom: 12,
  },
  titleTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  titleImageWrapper: {
    position: 'relative',
  },
  titleImage: {
    width: 88,
    height: 88,
    borderRadius: 16,
  },
  titleTextContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  titleNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  titleHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  clickToEditOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingVertical: 4,
    alignItems: 'center',
  },
  clickToEditText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ─── Sort pills wrapper ───────────────────────────────────────────────────────
  sortContainer: {
    marginHorizontal: -16,
  },
  // ─── Count row (mirrors countEllipsisRow / recallCount) ──────────────────────
  countEllipsisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 4,
  },
  recallCount: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  // ─── Note card row ────────────────────────────────────────────────────────────
  notesContainer: {
    paddingTop: 16,
  },
  noteCardRow: {
    paddingHorizontal: 16,
  },
  // ─── Loading more / end ───────────────────────────────────────────────────────
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
  // ─── Empty state ──────────────────────────────────────────────────────────────
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
  // ─── Ellipsis menu popover (mirrors menuBackdrop / menuCard / menuRow) ────────
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
    boxShadow: '0px 4px 8px rgba(0,0,0,0.4)',
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
});
