
import React, { useState, useCallback, useRef, useEffect } from 'react';

import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl, Modal, Platform, Alert, Keyboard, ScrollView } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { NoteCard } from '@/components/NoteCard';
import { useNotesContext } from '@/contexts/NotesContext';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import { CombinedSearchAdd } from '@/components/CombinedSearchAdd';
import { useCreateRecallUI } from '@/contexts/CreateRecallUIContext';
import { useScrollToTop } from '@/contexts/ScrollToTopContext';
import { supabase, uploadImageToDatabase, uploadDocumentToDatabase, triggerRecallEmbedding, getRecollectionCategories, getCategoryRecollections } from '@/utils/supabase';
import { NoteCardSkeleton } from '@/components/NoteCardSkeleton';
import { ZeroState } from '@/components/ZeroState';
import { extractUrls, processRecallUrlsAndAwaitScrape } from '@/utils/urlProcessor';
import RecallHeader from '@/components/RecallHeader';
import { Note } from '@/types/Note';
import { PillsRow } from '@/components/PillsRow';
import type { PillItem } from '@/components/PillsRow';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import Animated, {
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// Module-level scroll-position cache — survives component remounts within a session.
let homeScrollOffset = 0;

const PILL_SKELETON_WIDTHS = [80, 60, 110, 120, 70, 70, 100, 100, 80, 95];

export default function HomeScreen() {
  const { notes, loading, refreshNotes, loadMoreNotes, hasMore, isLoadingMore, refreshSingleNote, isDeletingNote, deleteNote, refreshUrlMetadata, addNoteOptimistic, patchNoteOptimistic, getUrlMetadataForRecall } = useNotesContext();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList<Note>>(null);
  const scrollPositionRef = useRef(homeScrollOffset);
  const previousNotesCountRef = useRef(notes.length);
  const isFirstFocusRef = useRef(true);
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [savingStage, setSavingStage] = useState<string>('');
  const [creatingRecallId, setCreatingRecallId] = useState<string | null>(null);
  const [categoryRefreshTrigger, setCategoryRefreshTrigger] = useState(0);
  const [combinedAddSearchEnabled, setCombinedAddSearchEnabled] = useState(true);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [hasCheckedForRecalls, setHasCheckedForRecalls] = useState(false);
  const [hasRecalls, setHasRecalls] = useState(false);
  const [userCategories, setUserCategories] = useState<PillItem[]>([]);
  const [selectedPill, setSelectedPill] = useState<string | null>(null);
  const [categoryRecalls, setCategoryRecalls] = useState<Note[]>([]);
  const [isLoadingCategoryRecalls, setIsLoadingCategoryRecalls] = useState(false);
  const [categoryPage, setCategoryPage] = useState(0);
  const [hasMoreCategoryRecalls, setHasMoreCategoryRecalls] = useState(false);
  const [isLoadingMoreCategoryRecalls, setIsLoadingMoreCategoryRecalls] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);

  const CATEGORY_PAGE_SIZE = 10;
  const insets = useSafeAreaInsets();
  const pendingImageUploadsRef = useRef<Map<string, number>>(new Map());
  const { isCreatePanelOpen, closeCreatePanel } = useCreateRecallUI();
  const { registerScrollToTop } = useScrollToTop();

  // Scroll-driven animation shared value
  const scrollY = useSharedValue(0);
  // Track whether content has been laid out so we can restore scroll position
  const contentSizeKnownRef = useRef(false);
  const pendingScrollRestoreRef = useRef(false);

  useEffect(() => {
    const unregister = registerScrollToTop('home', () => {
      console.log('[HomeScreen] Home tab tapped — preserving scroll position (no-op)');
    });
    return unregister;
  }, [registerScrollToTop]);

  useEffect(() => {
    const checkForRecalls = async () => {
      if (!user) {
        setHasCheckedForRecalls(true);
        setHasRecalls(false);
        return;
      }

      try {
        const { error, count } = await supabase
          .from('recalls')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .limit(1);

        if (error) {
          console.error('Error checking for recalls:', error);
          setHasRecalls(false);
        } else {
          setHasRecalls((count || 0) > 0);
        }
      } catch (error) {
        console.error('Exception checking for recalls:', error);
        setHasRecalls(false);
      } finally {
        setHasCheckedForRecalls(true);
      }
    };

    checkForRecalls();
  }, [user]);

  useEffect(() => {
    const loadUserPreferences = async () => {
      if (!user) {
        setLoadingPreferences(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('combined_add_search_enabled')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading user preferences:', error);
        } else if (data) {
          setCombinedAddSearchEnabled(data.combined_add_search_enabled !== false);
        }
      } catch (error) {
        console.error('Exception loading user preferences:', error);
      } finally {
        setLoadingPreferences(false);
      }
    };

    loadUserPreferences();
  }, [user]);

  useEffect(() => {
    previousNotesCountRef.current = notes.length;
  }, [notes.length]);

  const restoreScrollPosition = useCallback(() => {
    if (homeScrollOffset > 0 && listRef.current) {
      console.log('[HomeScreen] Restoring scroll position to:', homeScrollOffset);
      listRef.current.scrollToOffset({ offset: homeScrollOffset, animated: false });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[useFocusEffect] Home screen focused');

      if (!isFirstFocusRef.current) {
        const currentCount = notes.length;
        const previousCount = previousNotesCountRef.current;

        if (currentCount > previousCount) {
          console.log('[useFocusEffect] New recall detected, auto-refreshing...');
          refreshNotes();
        }
      } else {
        isFirstFocusRef.current = false;
      }

      if (homeScrollOffset > 0) {
        if (contentSizeKnownRef.current) {
          // Content already laid out — restore immediately
          setTimeout(() => {
            requestAnimationFrame(() => {
              restoreScrollPosition();
            });
          }, 50);
        } else {
          // Content not yet laid out — flag for restoration on contentSizeChange
          pendingScrollRestoreRef.current = true;
        }
      }

      return () => {
        console.log('[useFocusEffect] Home screen unfocused');
      };
    }, [notes.length, refreshNotes, restoreScrollPosition])
  );

  const handleContentSizeChange = useCallback(() => {
    contentSizeKnownRef.current = true;
    if (pendingScrollRestoreRef.current && homeScrollOffset > 0) {
      pendingScrollRestoreRef.current = false;
      console.log('[HomeScreen] onContentSizeChange — restoring deferred scroll to:', homeScrollOffset);
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: homeScrollOffset, animated: false });
      });
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setIsLoadingCategories(true);
      console.log('[HomeScreen] Loading recollection categories');
      const cats = await getRecollectionCategories();
      setUserCategories(cats.map(c => ({
        id: c.id,
        label: c.category_name,
        count: c.recollection_count,
      })));
    } catch (e) {
      console.error('[HomeScreen] Failed to load categories:', e);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handlePillSelect = useCallback(async (id: string | null) => {
    console.log('[HomeScreen] Pill selected:', id);
    if (selectedPill === id || id === null) {
      console.log('[HomeScreen] Pill deselected');
      setSelectedPill(null);
      setCategoryRecalls([]);
      setCategoryPage(0);
      setHasMoreCategoryRecalls(false);
      return;
    }
    setSelectedPill(id);
    setCategoryRecalls([]);
    setCategoryPage(0);
    setHasMoreCategoryRecalls(false);
    setIsLoadingCategoryRecalls(true);
    try {
      const recalls = await getCategoryRecollections(id, 0, CATEGORY_PAGE_SIZE);
      setCategoryRecalls(recalls);
      setHasMoreCategoryRecalls(recalls.length === CATEGORY_PAGE_SIZE);
    } catch (e) {
      console.error('[HomeScreen] Failed to load category recalls:', e);
      setCategoryRecalls([]);
    } finally {
      setIsLoadingCategoryRecalls(false);
    }
  }, [selectedPill, CATEGORY_PAGE_SIZE]);

  const handleRefresh = async () => {
    setRefreshing(true);
    console.log('[handleRefresh] Refreshing landing page data from Supabase...');
    
    try {
      console.log('[handleRefresh] Refreshing all recalls...');
      await refreshNotes();
      
      setCategoryRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('[handleRefresh] Error refreshing data:', error);
    } finally {
      setRefreshing(false);
      console.log('[handleRefresh] Refresh complete');
    }
  };

  const handleRecallIconPress = async () => {
    console.log('[handleRecallIconPress] Recall icon pressed - reloading');
    
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    
    await handleRefresh();
  };

  const handleNotePress = (noteId: string) => {
    try {
      router.push(`/note-editor?id=${noteId}`);
    } catch (error) {
      console.error('Error navigating to recall editor:', error);
    }
  };

  const handleCardPress = useCallback((noteId: string) => {
    console.log('[HomeScreen] Card pressed, navigating to note editor:', noteId);
    router.push('/note-editor?id=' + noteId);
  }, [router]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && !loading) {
      console.log('[handleEndReached] Loading more recalls...');
      loadMoreNotes();
    }
  }, [hasMore, isLoadingMore, loading, loadMoreNotes]);

  // JS-thread scroll handler — updates the module-level cache, dismisses keyboard,
  // and updates scrollY directly (shared values are writable from JS thread).
  const handleScroll = useCallback((event: any) => {
    try {
      const y = event.nativeEvent.contentOffset.y;
      scrollPositionRef.current = y;
      homeScrollOffset = y;
      scrollY.value = y;
      Keyboard.dismiss();
    } catch (error) {
      console.error('Error handling scroll:', error);
    }
  }, [scrollY]);

  const handleCreateRecallFromCombined = async (
    data: {
      text: string;
      images: string[];
      documents?: import('@/types/Document').Document[];
      location?: { latitude: number; longitude: number; name: string; primaryType?: string };
    },
    onProgress?: (stage: string) => void
  ) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a recall');
      return;
    }

    console.log('[handleCreateRecallFromCombined] Starting recall creation');
    console.log('[handleCreateRecallFromCombined] Text length:', data.text.length);
    console.log('[handleCreateRecallFromCombined] Number of images:', data.images.length);
    console.log('[handleCreateRecallFromCombined] Has location:', !!data.location);
    console.log('[handleCreateRecallFromCombined] Location primary type:', data.location?.primaryType || 'Not provided');

    try {
      setIsSaving(true);
      
      // Stage 1: Creating Recall
      if (onProgress) onProgress('Creating Recall...');
      setSavingStage('Creating Recall...');
      
      console.log('[handleCreateRecallFromCombined] Step 1: Creating recall record...');
      const recallStartTime = Date.now();
      
      const { data: recallData, error: recallError } = await supabase
        .from('recalls')
        .insert({
          text: data.text,
          user_id: user.id,
          latitude: data.location?.latitude,
          longitude: data.location?.longitude,
          location: data.location?.name,
          location_primary_type: data.location?.primaryType || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      const recallDuration = Date.now() - recallStartTime;
      console.log(`[handleCreateRecallFromCombined] Recall created in ${recallDuration}ms`);

      if (recallError) {
        console.error('[handleCreateRecallFromCombined] Error creating recall:', recallError);
        Alert.alert('Error', 'Failed to create recall');
        return;
      }

      console.log('[handleCreateRecallFromCombined] Recall created with ID:', recallData.id);
      setCreatingRecallId(recallData.id);

      // Show the card and dismiss the panel immediately — background work continues
      console.log('[handleCreateRecallFromCombined] Optimistic insert + early dismiss');
      addNoteOptimistic(recallData);
      closeCreatePanel();
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Fire-and-forget: generate the recall text embedding
      // (the create flow has no DB trigger for this, unlike OCR/people-finder)
      console.log('[handleCreateRecallFromCombined] Triggering recall embedding for:', recallData.id);
      triggerRecallEmbedding(
        recallData.id,
        recallData.text ?? undefined,
        recallData.location ?? undefined,
        recallData.location_primary_type ?? undefined,
      ).catch((err) => {
        console.warn('[handleCreateRecallFromCombined] triggerRecallEmbedding failed:', err);
      });

      // Stage 2: Scraping URL (if text contains a URL)
      const urlsInText = extractUrls(data.text);
      if (urlsInText.length > 0) {
        if (onProgress) onProgress('Scraping URL...');
        setSavingStage('Scraping URL...');
        console.log('[handleCreateRecallFromCombined] Stage: Scraping URL(s)... count:', urlsInText.length);
        await processRecallUrlsAndAwaitScrape(user.id, recallData.id, data.text, 8000);
        console.log('[handleCreateRecallFromCombined] Scraping complete');
        await refreshUrlMetadata([recallData.id]);
      }

      const totalImageCount = data.images.length;
      if (totalImageCount > 0) {
        pendingImageUploadsRef.current.set(recallData.id, totalImageCount);
        console.log(`[handleCreateRecallFromCombined] Tracking ${totalImageCount} pending image uploads for recall ${recallData.id}`);
      }

      if (data.images.length > 0) {
        // Stage 3: Detecting People (shown before image upload for better UX)
        if (onProgress) onProgress('Detecting People...');
        setSavingStage('Detecting People...');
        console.log('[handleCreateRecallFromCombined] Stage: Detecting people...');
        
        // Stage 4: Matching Categories — handled by backend; card pill shows progress
        console.log('[handleCreateRecallFromCombined] Stage: Matching categories (background)...');
        
        // NOTE: Removed "Uploading Images" stage from progress indicator for better UX
        // Images are still uploaded in the background
        
        console.log('[handleCreateRecallFromCombined] Step 2: Uploading images...');
        const imageStartTime = Date.now();
        
        console.log(`[handleCreateRecallFromCombined] Uploading first image synchronously (1/${data.images.length})...`);
        try {
          const firstImageId = await uploadImageToDatabase(data.images[0], recallData.id, 'image/jpeg');
          
          if (firstImageId) {
            console.log(`[handleCreateRecallFromCombined] First image uploaded successfully with ID:`, firstImageId);
          } else {
            console.error(`[handleCreateRecallFromCombined] First image upload failed - no ID returned`);
          }
        } catch (uploadError) {
          console.error(`[handleCreateRecallFromCombined] Exception uploading first image:`, uploadError);
        }
        
        const firstImageDuration = Date.now() - imageStartTime;
        console.log(`[handleCreateRecallFromCombined] First image uploaded in ${firstImageDuration}ms`);
        
        if (data.images.length > 1) {
          console.log(`[handleCreateRecallFromCombined] Uploading remaining ${data.images.length - 1} images asynchronously...`);
          
          (async () => {
            for (let i = 1; i < data.images.length; i++) {
              const uri = data.images[i];
              console.log(`[handleCreateRecallFromCombined] [ASYNC] Uploading image ${i + 1}/${data.images.length}...`);
              
              try {
                const imageId = await uploadImageToDatabase(uri, recallData.id, 'image/jpeg');
                
                if (imageId) {
                  console.log(`[handleCreateRecallFromCombined] [ASYNC] Image ${i + 1} uploaded successfully with ID:`, imageId);
                  
                  console.log(`[handleCreateRecallFromCombined] [ASYNC] Refreshing note ${recallData.id} after image ${i + 1} upload`);
                  await refreshSingleNote(recallData.id);
                } else {
                  console.error(`[handleCreateRecallFromCombined] [ASYNC] Image ${i + 1} upload failed - no ID returned`);
                }
                
                if (i < data.images.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (uploadError) {
                console.error(`[handleCreateRecallFromCombined] [ASYNC] Exception uploading image ${i + 1}:`, uploadError);
              }
            }
            
            console.log(`[handleCreateRecallFromCombined] [ASYNC] All remaining images uploaded`);
            
            // Stage 5: Analysing Images (async)
            console.log(`[handleCreateRecallFromCombined] [ASYNC] Analysing images...`);
            
            pendingImageUploadsRef.current.delete(recallData.id);
            console.log(`[handleCreateRecallFromCombined] [ASYNC] Cleared pending uploads tracking for recall ${recallData.id}`);
            
            console.log(`[handleCreateRecallFromCombined] [ASYNC] Final refresh of note ${recallData.id}`);
            await refreshSingleNote(recallData.id);
            
            console.log(`[handleCreateRecallFromCombined] [ASYNC] All images uploaded, background processing complete for recall ${recallData.id}`);
          })();
        } else {
          pendingImageUploadsRef.current.delete(recallData.id);
          
          // Run async processing for single image
          (async () => {
            // Stage 5: Analysing Images
            console.log(`[handleCreateRecallFromCombined] [ASYNC] Analysing image...`);
          })();
        }
      } else {
        // No images - show people detection and category matching stages
        // Stage 3: Detecting People (text-only)
        if (onProgress) onProgress('Detecting People...');
        setSavingStage('Detecting People...');
        console.log(`[handleCreateRecallFromCombined] Stage: Detecting people (text-only)...`);
        
        // Stage 4: Matching Categories — handled by backend; card pill shows progress
        // Category matching is handled by the backend after embeddings complete
        console.log(`[handleCreateRecallFromCombined] Category matching will be triggered by backend for recall ${recallData.id}`);
      }

      if (data.documents && data.documents.length > 0) {
        console.log(`[handleCreateRecallFromCombined] Uploading ${data.documents.length} documents...`);

        // Inject placeholder documents into the optimistic note so the card
        // shows a DocumentTile with an uploading spinner immediately
        console.log(`[handleCreateRecallFromCombined] Injecting ${data.documents.length} placeholder document(s) into optimistic note`);
        patchNoteOptimistic(recallData.id, {
          documents: data.documents!.map(doc => ({
            id: `pending-${doc.file_name}-${Date.now()}`,
            file_name: doc.file_name,
            content_type: doc.content_type,
            file_size: doc.file_size ?? 0,
            upload_state: 'uploading' as const,
            cdn_url: undefined,
            local_uri: doc.local_uri ?? undefined,
            local_thumbnail_uri: doc.local_thumbnail_uri ?? undefined,
            created_at: new Date().toISOString(),
            processed_at: undefined,
            page_count: undefined,
          })),
        });

        (async () => {
          for (let i = 0; i < data.documents!.length; i++) {
            const doc = data.documents![i];
            try {
              const result = await uploadDocumentToDatabase(
                recallData.id,
                doc.local_uri!,
                doc.local_thumbnail_uri,
                doc.file_name,
                doc.content_type,
                doc.file_size ?? 0
              );
              if (result?.id) {
                console.log(`[handleCreateRecallFromCombined] [ASYNC] Document ${i + 1} uploaded with ID:`, result.id);
                await refreshSingleNote(recallData.id);
              }
            } catch (uploadError) {
              console.error(`[handleCreateRecallFromCombined] [ASYNC] Document ${i + 1} upload exception:`, uploadError);
            }
          }
          console.log(`[handleCreateRecallFromCombined] [ASYNC] All documents processed`);
          // Delayed refreshes so the home card picks up processed_at once the edge function completes
          console.log(`[handleCreateRecallFromCombined] [ASYNC] Scheduling delayed refreshes for document processing`);
          setTimeout(() => {
            console.log(`[handleCreateRecallFromCombined] [ASYNC] 8s delayed refresh for recall ${recallData.id}`);
            refreshSingleNote(recallData.id);
          }, 8000);
          setTimeout(() => {
            console.log(`[handleCreateRecallFromCombined] [ASYNC] 20s delayed refresh for recall ${recallData.id}`);
            refreshSingleNote(recallData.id);
          }, 20000);
        })();
      }

      console.log('[handleCreateRecallFromCombined] Step 3: Refreshing recalls list...');
      await refreshNotes();

      console.log('[handleCreateRecallFromCombined] Background processing (OCR, people finder, category matching) will run asynchronously');
      
    } catch (error) {
      console.error('[handleCreateRecallFromCombined] Exception in recall creation:', error);
      Alert.alert('Error', 'Failed to create recall');
    } finally {
      setIsSaving(false);
      setSavingStage('');
      setCreatingRecallId(null);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    console.log('[handleDeleteNote] Deleting note:', noteId);
    try {
      await deleteNote(noteId);
      console.log('[handleDeleteNote] Note deleted successfully');
    } catch (error) {
      console.error('[handleDeleteNote] Error deleting note:', error);
      Alert.alert('Error', 'Failed to delete recall. Please try again.');
    }
  };

  const getExpectedImageCount = (noteId: string): number | undefined => {
    return pendingImageUploadsRef.current.get(noteId);
  };

  const shouldShowSkeletons = loading && (!hasCheckedForRecalls || notes.length === 0);
  const shouldShowZeroState = hasCheckedForRecalls && !hasRecalls && notes.length === 0 && !loading;

  const listData = selectedPill ? [] : (hasRecalls || notes.length > 0 ? notes : []);

  const renderItem = useCallback(({ item }: { item: Note }) => {
    const itemUrlMeta = getUrlMetadataForRecall(item.id);
    return (
      <View style={styles.noteCardRow}>
        <NoteCard
          note={item}
          urlMeta={itemUrlMeta}
          onPress={() => handleNotePress(item.id)}
          onCardPress={handleCardPress}
          onDelete={() => handleDeleteNote(item.id)}
          onPeopleUpdated={(noteId) => refreshSingleNote(noteId)}
          onPhotoAdded={(noteId) => { console.log('[NoteCard] onPhotoAdded called, refreshing note:', noteId); refreshSingleNote(noteId); }}
          onDocumentAdded={(noteId) => { console.log('[NoteCard] onDocumentAdded called, refreshing note:', noteId); refreshSingleNote(noteId); }}
          loading={false}
          expectedImageCount={getExpectedImageCount(item.id)}
          processingStage={creatingRecallId === item.id ? savingStage : undefined}
        />
      </View>
    );
  }, [creatingRecallId, savingStage, handleCardPress, getUrlMetadataForRecall]);  // eslint-disable-line react-hooks/exhaustive-deps

  const ListHeaderComponent = (
    <View>
      <View style={[styles.customHeader, { paddingTop: insets.top }]}>
        <Pressable
          onPress={handleRecallIconPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <RecallHeader />
        </Pressable>
      </View>

      {/* Category pills row */}
      {isLoadingCategories ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsSkeletonContent}
          style={styles.pillsRowWrapper}
        >
          {PILL_SKELETON_WIDTHS.map((w, i) => (
            <SkeletonLoader
              key={`pill-skeleton-${i}`}
              variant="wave"
              width={w}
              height={36}
              borderRadius={20}
            />
          ))}
        </ScrollView>
      ) : userCategories.length > 0 ? (
        <View style={styles.pillsRowWrapper}>
          <PillsRow
            items={userCategories}
            selected={selectedPill}
            onSelect={handlePillSelect}
          />
        </View>
      ) : null}

      {/* Category recalls — shown when a pill is selected */}
      {selectedPill && (
        <View style={styles.categoryRecallsContainer}>
          {isLoadingCategoryRecalls ? (
            <View style={styles.categoryLoadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.categoryLoadingText}>Loading recalls...</Text>
            </View>
          ) : categoryRecalls.length === 0 ? (
            <View style={styles.categoryEmptyContainer}>
              <Text style={styles.categoryEmptyText}>No recalls found for this category</Text>
            </View>
          ) : (
            <FlatList
              data={categoryRecalls}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => {
                const itemUrlMeta = getUrlMetadataForRecall(item.id);
                return (
                  <View style={styles.noteCardRow}>
                    <NoteCard
                      note={item}
                      urlMeta={itemUrlMeta}
                      onPress={() => handleNotePress(item.id)}
                      onCardPress={handleCardPress}
                      onDelete={() => handleDeleteNote(item.id)}
                      loading={false}
                    />
                  </View>
                );
              }}
              onEndReachedThreshold={0.3}
              onEndReached={async () => {
                if (!hasMoreCategoryRecalls || isLoadingMoreCategoryRecalls || !selectedPill) return;
                const nextPage = categoryPage + 1;
                console.log('[HomeScreen] Loading more category recalls, page:', nextPage);
                setIsLoadingMoreCategoryRecalls(true);
                try {
                  const more = await getCategoryRecollections(selectedPill, nextPage, CATEGORY_PAGE_SIZE);
                  setCategoryRecalls((prev) => [...prev, ...more]);
                  setCategoryPage(nextPage);
                  setHasMoreCategoryRecalls(more.length === CATEGORY_PAGE_SIZE);
                } catch (e) {
                  console.error('[HomeScreen] Failed to load more category recalls:', e);
                } finally {
                  setIsLoadingMoreCategoryRecalls(false);
                }
              }}
              ListFooterComponent={
                isLoadingMoreCategoryRecalls ? (
                  <View style={styles.categoryLoadingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      )}
    </View>
  );

  const ListEmptyComponent = shouldShowSkeletons ? (
    <View style={styles.allNotesSection}>
      {[...Array(3)].map((_, index) => (
        <NoteCardSkeleton key={`skeleton-${index}`} />
      ))}
    </View>
  ) : shouldShowZeroState ? (
    <ZeroState
      icon="doc.text"
      title="No Recalls Yet"
      message="Start capturing your thoughts, memories, and moments"
      animatedIcon={true}
    />
  ) : null;

  const ListFooterComponent = (isLoadingMore && !selectedPill) ? (
    <View style={styles.loadingMoreContainer}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.loadingMoreText}>Loading more...</Text>
    </View>
  ) : (!hasMore && notes.length > 0 && !selectedPill) ? (
    <View style={styles.endContainer}>
      <Text style={styles.endText}>You&apos;ve reached the end</Text>
    </View>
  ) : null;

  const contentContainerStyle = [
    styles.scrollContent,
    combinedAddSearchEnabled && styles.scrollContentWithCombined,
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <Animated.FlatList
        ref={listRef}
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
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
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        windowSize={10}
        maxToRenderPerBatch={6}
        initialNumToRender={8}
        removeClippedSubviews
        contentContainerStyle={contentContainerStyle}
        style={styles.scrollView}
      />

      {combinedAddSearchEnabled && user && !loadingPreferences && isCreatePanelOpen && (
        <CombinedSearchAdd
          onCreateRecall={handleCreateRecallFromCombined}
          userId={user.id}
          onDismiss={closeCreatePanel}
        />
      )}

      <Modal
        visible={isDeletingNote}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.deletionModalContainer}>
          <View style={styles.deletionModalContent}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.deletionModalText}>Deleting recall...</Text>
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
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    // Task 1: align gap between header bottom and search box top with search screen (8px)
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  headerIconButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 188,
  },
  scrollContentWithCombined: {
    paddingBottom: 200,
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
  notesContainer: {
    width: '100%',
  },
  allNotesSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
  noteCardRow: {
    paddingHorizontal: 16,
  },
  pillsRowWrapper: {
    marginBottom: 4,
  },
  pillsSkeletonContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  categoryRecallsContainer: {
    width: '100%',
  },
  categoryLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  categoryLoadingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  categoryEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  categoryEmptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
