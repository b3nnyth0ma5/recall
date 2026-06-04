
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, Alert, Platform, RefreshControl, Animated, Dimensions } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { IconSymbol } from '@/components/IconSymbol';
import { PersonAvatar } from '@/components/PersonAvatar';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import { supabase, getImageDataUrl } from '@/utils/supabase';
import { uploadImageToCloudflare } from '@/utils/cloudflareCDN';
import { useAuth } from '@/contexts/AuthContext';
import { Note } from '@/types/Note';
import { peopleCache, imageCache, CostCalculator } from '@/utils/memoryCache';
import { useNotes } from '@/hooks/useNotes';
import { useNotesContext } from '@/contexts/NotesContext';

export default function PersonRecallsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { getCachedNote } = useNotes();
  const { refreshUrlMetadata } = useNotesContext();
  const [recalls, setRecalls] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [personName, setPersonName] = useState<string>('');
  const [personPhotoUrl, setPersonPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingPersonInfo, setLoadingPersonInfo] = useState(true);
  const [photoUpdateTrigger, setPhotoUpdateTrigger] = useState(0);
  const [totalRecallCount, setTotalRecallCount] = useState<number | null>(null);

  const personId = params.personId as string;
  const ITEMS_PER_PAGE = 10;

  // Ellipsis menu state
  const [isManageMenuOpen, setIsManageMenuOpen] = useState(false);
  const manageMenuFade = useRef(new Animated.Value(0)).current;
  const manageMenuScale = useRef(new Animated.Value(0.9)).current;
  const ellipsisButtonRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);

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
        .select('recall_id, person_id, persons!inner(id, person_name, photo_url)')
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
            photo_url: rp.persons.photo_url,
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

      // First, get the person's name and photo (only on first load)
      if (pageNum === 1) {
        setLoadingPersonInfo(true);
        const { data: personData, error: personError } = await supabase
          .from('persons')
          .select('person_name, photo_url')
          .eq('id', personId)
          .eq('user_id', user?.id)
          .single();

        if (personError) {
          console.error('[PersonRecalls] Error loading person:', personError);
          setLoadingPersonInfo(false);
          return;
        }

        setPersonName(personData.person_name);
        setPersonPhotoUrl(personData.photo_url || null);
        setLoadingPersonInfo(false);
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
          setTotalRecallCount(0);
        }
        return;
      }

      // Fetch true total count on first page load only
      if (pageNum === 1) {
        supabase
          .from('recall_people')
          .select('recall_id', { count: 'exact', head: true })
          .eq('person_id', personId)
          .eq('user_id', user?.id)
          .then(({ count, error }) => {
            if (!error && count !== null) {
              console.log(`[PersonRecalls] Total recall count for person: ${count}`);
              setTotalRecallCount(count);
            }
          });
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
          console.log(`[PersonRecalls] Using cached Recall for ${recallId}`);
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
          .select('id, user_id, text, latitude, longitude, location, location_primary_type, created_at, updated_at')
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
        // Prevent duplicates by filtering out Recalls that already exist
        setRecalls(prevRecalls => {
          const existingIds = new Set(prevRecalls.map(recall => recall.id));
          const newUniqueRecalls = transformedNotes.filter(recall => !existingIds.has(recall.id));
          console.log(`[PersonRecalls] Adding ${newUniqueRecalls.length} new unique recalls (filtered ${transformedNotes.length - newUniqueRecalls.length} duplicates)`);
          return [...prevRecalls, ...newUniqueRecalls];
        });
      } else {
        setRecalls(transformedNotes);
      }

      // Fire-and-forget: populate URL metadata so NoteCard can render URL previews
      const loadedIds = transformedNotes.map(n => n.id);
      if (loadedIds.length > 0) {
        console.log('[PersonRecalls] Refreshing URL metadata for', loadedIds.length, 'recalls');
        refreshUrlMetadata(loadedIds);
      }
    } catch (error) {
      console.error('[PersonRecalls] Error loading recalls for person:', error);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [personId, user, getCachedNote, loadImagesForRecalls, refreshUrlMetadata]);

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

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && !loading) {
      console.log('[PersonRecalls] onEndReached — loading more recalls...');
      loadMoreRecalls();
    }
  }, [hasMore, isLoadingMore, loading, loadMoreRecalls]);

  const handleRefresh = useCallback(async () => {
    console.log('[PersonRecalls] Pull-to-refresh triggered');
    setRefreshing(true);
    
    // Reset pagination
    setPage(1);
    setHasMore(true);
    
    // Reload first page
    await loadRecallsForPerson(1, false);
    
    setRefreshing(false);
    
    // Haptic feedback on refresh complete
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [loadRecallsForPerson]);

  const handleNotePress = useCallback((noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to Recall editor:', error);
    }
  }, [router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const openManageMenu = useCallback(() => {
    console.log('[PersonRecalls] User tapped ellipsis menu button');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    const SCREEN_WIDTH = Dimensions.get('window').width;
    const FALLBACK_ANCHOR = { top: 200, right: 16 };

    const doOpen = (anchor: { top: number; right: number }) => {
      setMenuAnchor(anchor);
      setIsManageMenuOpen(true);
      manageMenuFade.setValue(0);
      manageMenuScale.setValue(0.9);
      Animated.parallel([
        Animated.timing(manageMenuFade, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(manageMenuScale, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    };

    if (ellipsisButtonRef.current) {
      ellipsisButtonRef.current.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          const anchor = {
            top: y + height + 6,
            right: SCREEN_WIDTH - (x + width),
          };
          doOpen(anchor);
        } else {
          doOpen(FALLBACK_ANCHOR);
        }
      });
    } else {
      doOpen(FALLBACK_ANCHOR);
    }
  }, [manageMenuFade, manageMenuScale]);

  const closeManageMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(manageMenuFade, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(manageMenuScale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsManageMenuOpen(false);
      setMenuAnchor(null);
    });
  }, [manageMenuFade, manageMenuScale]);

  const handlePhotoUpload = useCallback(async (uri: string) => {
    try {
      setUploadingPhoto(true);
      console.log('[PersonRecalls] Starting photo upload process');

      // Manipulate image - resize and compress
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [
          { resize: { width: 512 } } // Resize to 512px width for avatar
        ],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      console.log('[PersonRecalls] Image manipulated:', manipulatedImage.uri);

      // Convert to base64
      const base64 = await FileSystem.readAsStringAsync(manipulatedImage.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log('[PersonRecalls] Image converted to base64, length:', base64.length);

      // Upload to Cloudflare
      const fileName = `person-${personId}-${Date.now()}.jpg`;
      const cdnUrl = await uploadImageToCloudflare(base64, fileName, 'image/jpeg');

      if (!cdnUrl) {
        throw new Error('Failed to upload image to Cloudflare');
      }

      console.log('[PersonRecalls] Image uploaded to Cloudflare:', cdnUrl);

      // Update person record with photo URL
      const { error: updateError } = await supabase
        .from('persons')
        .update({ photo_url: cdnUrl })
        .eq('id', personId)
        .eq('user_id', user?.id);

      if (updateError) {
        throw updateError;
      }

      console.log('[PersonRecalls] Person record updated with photo URL');

      // Update local state
      setPersonPhotoUrl(cdnUrl);

      // Clear people cache to ensure updated photo is reflected everywhere
      console.log('[PersonRecalls] Clearing people cache to update photo everywhere');
      peopleCache.clear();

      // Force re-render of all Recall cards by incrementing trigger
      console.log('[PersonRecalls] Forcing avatar refresh on all Recall cards');
      setPhotoUpdateTrigger(prev => prev + 1);

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Don't show success modal - just haptic feedback
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

      // Update person record to remove photo URL
      const { error: updateError } = await supabase
        .from('persons')
        .update({ photo_url: null })
        .eq('id', personId)
        .eq('user_id', user?.id);

      if (updateError) {
        throw updateError;
      }

      console.log('[PersonRecalls] Person photo removed');

      // Update local state
      setPersonPhotoUrl(null);

      // Clear people cache to ensure updated photo is reflected everywhere
      console.log('[PersonRecalls] Clearing people cache to update photo everywhere');
      peopleCache.clear();

      // Force re-render of all Recall cards by incrementing trigger
      console.log('[PersonRecalls] Forcing avatar refresh on all Recall cards');
      setPhotoUpdateTrigger(prev => prev + 1);

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Don't show success modal - just haptic feedback
    } catch (error) {
      console.error('[PersonRecalls] Error removing photo:', error);
      Alert.alert('Error', 'Failed to remove photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  }, [personId, user]);

  const handlePhotoPress = useCallback(async () => {
    try {
      // Show action sheet
      Alert.alert(
        'Person Photo',
        'Choose an option',
        [
          {
            text: 'Take Photo',
            onPress: async () => {
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
            },
          },
          {
            text: 'Choose from Library',
            onPress: async () => {
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
            },
          },
          ...(personPhotoUrl ? [{
            text: 'Remove Photo',
            style: 'destructive' as const,
            onPress: async () => {
              await handlePhotoRemove();
            },
          }] : []),
          {
            text: 'Cancel',
            style: 'cancel' as const,
          },
        ]
      );
    } catch (error) {
      console.error('Error handling photo press:', error);
    }
  }, [personPhotoUrl, handlePhotoUpload, handlePhotoRemove]);

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

  // Render skeleton for person info section
  const renderPersonInfoSkeleton = () => {
    return (
      <View style={styles.avatarSection}>
        <View style={styles.avatarPressable}>
          <SkeletonLoader 
            width={100} 
            height={100} 
            borderRadius={50}
            style={{ marginBottom: 0 }}
          />
        </View>
      </View>
    );
  };

  const listRef = useRef<FlatList<Note>>(null);

  const renderRecallItem = useCallback(({ item }: { item: Note }) => (
    <NoteCard
      key={`${item.id}-${photoUpdateTrigger}`}
      note={item}
      onPress={() => handleNotePress(item.id)}
      loading={false}
    />
  ), [photoUpdateTrigger, handleNotePress]);

  const ListHeaderComponent = (
    <View>
      {/* Person Avatar Section with Skeleton - UPDATED: Reduced gaps by 10% */}
      {loadingPersonInfo ? (
        renderPersonInfoSkeleton()
      ) : (
        <View style={styles.avatarSection}>
          {/* Row: spacer (left) + avatar (center) + ellipsis (right) */}
          <View style={styles.avatarRow}>
            <View style={styles.avatarRowSpacer} />
            <Pressable
              onPress={handlePhotoPress}
              disabled={uploadingPhoto}
              style={styles.avatarPressable}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <PersonAvatar
                key={`person-avatar-${photoUpdateTrigger}`}
                personName={personName}
                photoUrl={personPhotoUrl}
                size={100}
              />
              {uploadingPhoto && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              )}
              <View style={styles.cameraIconContainer}>
                <IconSymbol name="camera.fill" size={20} color="#FFFFFF" />
              </View>
            </Pressable>
            <View style={styles.avatarRowSpacer}>
              <View ref={ellipsisButtonRef} collapsable={false}>
                <Pressable
                  onPress={openManageMenu}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={styles.ellipsisButton}
                >
                  <IconSymbol name="ellipsis" size={20} color={colors.text} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}

      {!loading && recalls.length > 0 && (
        <View style={styles.recallsContainer}>
          <Text style={styles.countText}>
            {(totalRecallCount ?? recalls.length)} {(totalRecallCount ?? recalls.length) === 1 ? 'Recall' : 'Recalls'} mentioning {personName}
          </Text>
        </View>
      )}
    </View>
  );

  const ListEmptyComponent = loading ? (
    renderSkeletonLoaders()
  ) : (
    <View style={styles.emptyContainer}>
      <IconSymbol
        ios_icon_name="person.fill.questionmark"
        android_material_icon_name="person_search"
        size={80}
        color={colors.textTertiary}
      />
      <Text style={styles.emptyTitle}>No Recalls Found</Text>
      <Text style={styles.emptyText}>
        No Recalls mention {personName}
      </Text>
    </View>
  );

  const ListFooterComponent = isLoadingMore ? (
    <View style={styles.loadingMoreContainer}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.loadingMoreText}>Loading more...</Text>
    </View>
  ) : !hasMore && recalls.length > 0 ? (
    <View style={styles.endContainer}>
      <Text style={styles.endText}>You&apos;ve reached the end</Text>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      {/* Ellipsis menu popover */}
      {isManageMenuOpen && menuAnchor && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Backdrop */}
          <Pressable
            style={styles.menuBackdrop}
            onPress={closeManageMenu}
          />
          {/* Menu card */}
          <Animated.View
            style={[
              styles.menuCard,
              { top: menuAnchor.top, right: menuAnchor.right },
              { opacity: manageMenuFade, transform: [{ scale: manageMenuScale }] },
            ]}
          >
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
              onPress={() => {
                console.log('[PersonRecalls] User tapped "Add/Edit Photo" from ellipsis menu');
                closeManageMenu();
                handlePhotoPress();
              }}
            >
              <IconSymbol name="camera.fill" size={18} color={colors.text} />
              <Text style={styles.menuRowText}>Add/Edit Photo</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}

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

      <FlatList
        ref={listRef}
        data={recalls}
        keyExtractor={(item) => item.id}
        renderItem={renderRecallItem}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
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
        windowSize={10}
        maxToRenderPerBatch={6}
        initialNumToRender={8}
        removeClippedSubviews
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      />
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
    paddingBottom: 128,
    paddingHorizontal: 16,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 19.2, // Reduced by 10% from 24 to 21.6, rounded to 19.2
    paddingTop: 28.8, // Reduced by 10% from 32 to 28.8
  },
  avatarPressable: {
    position: 'relative',
    marginBottom: 0, // Removed gap - was 12, now 0
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background,
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
    paddingTop: 14.4, // Reduced by 10% from 16 to 14.4
  },
  countText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 14.4, // Reduced by 10% from 16 to 14.4
    textAlign: 'center',
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  avatarRowSpacer: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 16,
  },
  ellipsisButton: {
    paddingLeft: 8,
    paddingTop: 2,
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
