import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Keyboard,
  Switch,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/utils/supabase';
import { uploadImageToCloudflare } from '@/utils/cloudflareCDN';
import { PersonAvatar } from '@/components/PersonAvatar';
import { IconSymbol } from '@/components/IconSymbol';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';

const CROP_DISPLAY_SIZE = 100;
const CROP_ZOOM = 2.5;

export interface FaceRow {
  id: string;
  face_uuid: string;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  person_id: string | null;
  person_name: string | null;
  photo_url: string | null;
  confirmed_by_user: boolean;
  // Auto-match fields (populated by upload flow)
  match_confidence: number | null;
  suggested_person_id: string | null;
  suggested_person_name: string | null;
  suggested_person_photo_url: string | null;
  // Top-3 candidates
  suggested_person_id_2: string | null;
  suggested_person_name_2: string | null;
  suggested_person_photo_url_2: string | null;
  match_confidence_2: number | null;
  suggested_person_id_3: string | null;
  suggested_person_name_3: string | null;
  suggested_person_photo_url_3: string | null;
  match_confidence_3: number | null;
  skipped_by_user: boolean;
}

interface PersonResult {
  id: string;
  person_name: string;
  photo_url: string | null;
}

interface CandidateItem {
  personId: string;
  personName: string;
  photoUrl: string | null;
  confidence: number;
}

interface FaceLinkSheetProps {
  visible: boolean;
  faceRow: FaceRow | null;
  imageUrl: string;
  recallId?: string;
  naturalWidth: number;
  naturalHeight: number;
  onClose: () => void;
  onLinked: (faceId: string, personId: string, personName: string, photoUrl: string | null) => void;
}

function CandidateCard({
  candidate,
  onPress,
}: {
  candidate: CandidateItem;
  onPress: () => void;
}) {
  const confidencePct = Math.round(candidate.confidence * 100);
  const isStrong = confidencePct >= 85;
  const pillLabel = isStrong ? 'Strong match' : 'Possible match';
  const pillStyle = isStrong ? styles.confidencePillGreen : styles.confidencePillAmber;
  const pillTextColor = isStrong ? '#22C55E' : '#F59E0B';

  return (
    <Pressable style={styles.candidateCard} onPress={() => {
      console.log('[FaceLinkSheet] Candidate card tapped:', candidate.personId, candidate.personName);
      onPress();
    }}>
      <PersonAvatar personName={candidate.personName} photoUrl={candidate.photoUrl} size={48} />
      <Text style={styles.candidateName} numberOfLines={1}>{candidate.personName}</Text>
      <View style={pillStyle}>
        <Text style={[styles.confidencePillText, { color: pillTextColor }]}>{pillLabel}</Text>
      </View>
    </Pressable>
  );
}

export function FaceLinkSheet({
  visible,
  faceRow,
  imageUrl,
  recallId,
  naturalWidth,
  naturalHeight,
  onClose,
  onLinked,
}: FaceLinkSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [recentPeople, setRecentPeople] = useState<PersonResult[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [useAsPhoto, setUseAsPhoto] = useState(true);
  const [pendingPerson, setPendingPerson] = useState<PersonResult | null>(null);

  const insets = useSafeAreaInsets();

  // Reset state when sheet opens/closes
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setSearchResults([]);
      setIsCreating(false);
      setNewPersonName('');
      setShowCreateInput(false);
      setIsLinking(false);
      setSuggestionDismissed(false);
      setPendingPerson(null);
      setUseAsPhoto(true);
      loadRecentPeople();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Keyboard listeners for paddingBottom adjustment
  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Search persons as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchPersons(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadRecentPeople = async () => {
    setLoadingRecent(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('recall_images_people')
        .select('person_id, persons!inner(id, person_name, photo_url)')
        .eq('user_id', user.id)
        .eq('confirmed_by_user', true)
        .not('person_id', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (data) {
        const seen = new Set<string>();
        const recent: PersonResult[] = [];
        for (const row of data) {
          const p = (row as any).persons;
          if (p && !seen.has(p.id)) {
            seen.add(p.id);
            recent.push({ id: p.id, person_name: p.person_name, photo_url: p.photo_url });
            if (recent.length >= 6) break;
          }
        }
        setRecentPeople(recent);
      }
    } catch (e) {
      console.warn('[FaceLinkSheet] loadRecentPeople error:', e);
    } finally {
      setLoadingRecent(false);
    }
  };

  const searchPersons = async (query: string) => {
    console.log('[FaceLinkSheet] Searching persons for query:', query);
    setIsSearching(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('persons')
        .select('id, person_name, photo_url')
        .ilike('person_name', `%${query}%`)
        .eq('user_id', user.id)
        .limit(10);

      if (error) {
        console.error('[FaceLinkSheet] Search error:', error);
        return;
      }
      console.log('[FaceLinkSheet] Search results count:', data?.length ?? 0);
      setSearchResults(data ?? []);
    } catch (e) {
      console.error('[FaceLinkSheet] Search exception:', e);
    } finally {
      setIsSearching(false);
    }
  };

  const cropAndUpload = useCallback(async (
    personId: string,
    personName: string,
    existingPhotoUrl: string | null,
    faceId: string,
    onResolved: (finalPhotoUrl: string | null) => void,
  ) => {
    if (!faceRow || !imageUrl || naturalWidth === 0 || naturalHeight === 0) {
      onResolved(existingPhotoUrl);
      return;
    }

    console.log('[FaceLinkSheet] cropAndUpload called for person:', personName);

    const PADDING = 0.2;
    const rawX = faceRow.bbox_x - PADDING * faceRow.bbox_w;
    const rawY = faceRow.bbox_y - PADDING * faceRow.bbox_h;
    const rawW = faceRow.bbox_w * (1 + 2 * PADDING);
    const rawH = faceRow.bbox_h * (1 + 2 * PADDING);

    const clampedX = Math.max(0, rawX);
    const clampedY = Math.max(0, rawY);
    const clampedW = Math.min(rawW, 1 - clampedX);
    const clampedH = Math.min(rawH, 1 - clampedY);

    const pixelX = Math.round(clampedX * naturalWidth);
    const pixelY = Math.round(clampedY * naturalHeight);
    const pixelW = Math.round(clampedW * naturalWidth);
    const pixelH = Math.round(clampedH * naturalHeight);

    console.log('[FaceLinkSheet] Crop region (pixels):', { pixelX, pixelY, pixelW, pixelH });

    const localUri = `${FileSystem.cacheDirectory}face-crop-${Date.now()}.jpg`;
    try {
      console.log('[FaceLinkSheet] Downloading remote image to local cache:', localUri);
      const downloadResult = await FileSystem.downloadAsync(imageUrl, localUri);
      const localImageUri = downloadResult.uri;
      console.log('[FaceLinkSheet] Download complete, local URI:', localImageUri);

      let manipResult: ImageManipulator.ImageResult;
      try {
        manipResult = await ImageManipulator.manipulateAsync(
          localImageUri,
          [{ crop: { originX: pixelX, originY: pixelY, width: pixelW, height: pixelH } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
        );
      } finally {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      }

      console.log('[FaceLinkSheet] Crop result URI:', manipResult.uri);

      const base64 = await FileSystem.readAsStringAsync(manipResult.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileName = `face-${personId}-${Date.now()}.jpg`;
      console.log('[FaceLinkSheet] Uploading face crop to CDN:', fileName);
      const cdnUrl = await uploadImageToCloudflare(base64, fileName, 'image/jpeg');

      if (!cdnUrl) {
        console.warn('[FaceLinkSheet] Face crop upload returned null');
        onResolved(existingPhotoUrl);
        return;
      }

      console.log('[FaceLinkSheet] Face crop CDN URL:', cdnUrl);

      const { error: updateError } = await supabase
        .from('persons')
        .update({ photo_url: cdnUrl })
        .eq('id', personId);

      if (updateError) {
        console.error('[FaceLinkSheet] Failed to update person photo_url:', updateError);
        onResolved(existingPhotoUrl);
      } else {
        console.log('[FaceLinkSheet] Person photo_url updated successfully');
        onResolved(cdnUrl);
      }
    } catch (e) {
      console.error('[FaceLinkSheet] cropAndUpload error:', e);
      onResolved(existingPhotoUrl);
    }
  }, [faceRow, imageUrl, naturalWidth, naturalHeight]);

  // Fire-and-forget: fetch the face embedding from DB and upsert it onto the person
  const saveFaceEmbeddingToPerson = useCallback(async (faceRowId: string, personId: string) => {
    console.log('[FaceLinkSheet] saveFaceEmbeddingToPerson called for face:', faceRowId, 'person:', personId);
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 1000;

    let embeddingString: string | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { data: faceData, error: fetchError } = await supabase
          .from('recall_images_people')
          .select('face_embedding')
          .eq('id', faceRowId)
          .maybeSingle();

        if (fetchError) {
          console.warn('[FaceLinkSheet] saveFaceEmbeddingToPerson: fetch error (non-fatal):', fetchError);
          return;
        }

        const embeddingValue = (faceData as any)?.face_embedding;
        if (embeddingValue) {
          embeddingString = typeof embeddingValue === 'string'
            ? embeddingValue
            : JSON.stringify(embeddingValue);
          console.log('[FaceLinkSheet] saveFaceEmbeddingToPerson: got embedding on attempt', attempt);
          break;
        }

        if (attempt < MAX_RETRIES) {
          console.log(`[FaceLinkSheet] saveFaceEmbeddingToPerson: embedding not ready, retrying in ${RETRY_DELAY_MS}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      } catch (e) {
        console.warn('[FaceLinkSheet] saveFaceEmbeddingToPerson: exception on attempt', attempt, e);
        return;
      }
    }

    if (!embeddingString) {
      console.warn('[FaceLinkSheet] saveFaceEmbeddingToPerson: embedding still null after', MAX_RETRIES, 'attempts, giving up');
      return;
    }

    try {
      console.log('[FaceLinkSheet] saveFaceEmbeddingToPerson: calling upsert_person_face_embedding RPC');
      const { error: rpcError } = await supabase.rpc('upsert_person_face_embedding', {
        p_person_id: personId,
        new_embedding: embeddingString,
        p_source_face_id: faceRowId,
      });
      if (rpcError) {
        console.warn('[FaceLinkSheet] saveFaceEmbeddingToPerson: RPC error (non-fatal):', rpcError);
      } else {
        console.log('[FaceLinkSheet] saveFaceEmbeddingToPerson: embedding saved to person_face_embeddings for person:', personId);
      }
    } catch (e) {
      console.warn('[FaceLinkSheet] saveFaceEmbeddingToPerson: RPC exception (non-fatal):', e);
    }
  }, []);

  const handleRejectSuggestion = async (rejectedPersonId: string) => {
    console.log('[FaceLinkSheet] Suggestion rejected for person:', rejectedPersonId);
    setSuggestionDismissed(true);
    if (!faceRow) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('rejected_face_matches').upsert({
        face_row_id: faceRow.id,
        rejected_person_id: rejectedPersonId,
        user_id: user.id,
      }, { onConflict: 'face_row_id,rejected_person_id', ignoreDuplicates: true });
    } catch (e) {
      console.warn('[FaceLinkSheet] handleRejectSuggestion error (non-fatal):', e);
    }
  };

  const handleSkip = async () => {
    console.log('[FaceLinkSheet] Skip button pressed — marking face as unknown');
    if (!faceRow) return;
    setIsLinking(true);
    try {
      await supabase
        .from('recall_images_people')
        .update({ skipped_by_user: true })
        .eq('id', faceRow.id);
      onClose();
    } catch (e) {
      console.warn('[FaceLinkSheet] handleSkip error:', e);
    } finally {
      setIsLinking(false);
    }
  };

  const linkFace = useCallback(async (
    personId: string,
    personName: string,
    existingPhotoUrl: string | null,
  ) => {
    if (!faceRow) return;
    console.log('[FaceLinkSheet] Linking face', faceRow.id, 'to person', personId, personName);
    setIsLinking(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'Not signed in.');
        return;
      }

      // Update recall_images_people
      const { error: updateError } = await supabase
        .from('recall_images_people')
        .update({ person_id: personId, confirmed_by_user: true })
        .eq('id', faceRow.id);

      if (updateError) {
        console.error('[FaceLinkSheet] Failed to update recall_images_people:', updateError);
        Alert.alert('Error', 'Failed to link face. Please try again.');
        return;
      }

      // Only tag the recall if we have a recallId
      if (recallId) {
        const { data: existingRow } = await supabase
          .from('recall_people')
          .select('recall_id')
          .eq('recall_id', recallId)
          .eq('person_id', personId)
          .maybeSingle();

        if (!existingRow) {
          const { error: recallPeopleError } = await supabase
            .from('recall_people')
            .insert({ recall_id: recallId, person_id: personId, user_id: user.id });

          if (recallPeopleError) {
            console.error('[FaceLinkSheet] recall_people insert error:', recallPeopleError);
          } else {
            console.log('[FaceLinkSheet] recall_people row inserted successfully');
          }
        } else {
          console.log('[FaceLinkSheet] recall_people row already exists, skipping insert');
        }
      }

      console.log('[FaceLinkSheet] Face linked successfully');

      // Fire-and-forget: save embedding to person for future matching
      saveFaceEmbeddingToPerson(faceRow.id, personId);

      const faceId = faceRow.id;

      // Handle photo update inline using useAsPhoto toggle
      if (useAsPhoto) {
        console.log('[FaceLinkSheet] useAsPhoto=true, running cropAndUpload');
        cropAndUpload(personId, personName, existingPhotoUrl, faceId, (finalPhotoUrl) => {
          console.log('[FaceLinkSheet] onLinked called with final photo URL:', finalPhotoUrl);
          onLinked(faceId, personId, personName, finalPhotoUrl);
        });
      } else {
        console.log('[FaceLinkSheet] useAsPhoto=false, skipping crop');
        onLinked(faceId, personId, personName, existingPhotoUrl);
      }

      onClose();
    } catch (e) {
      console.error('[FaceLinkSheet] linkFace exception:', e);
      Alert.alert('Error', 'Failed to link face. Please try again.');
    } finally {
      setIsLinking(false);
    }
  }, [faceRow, recallId, onLinked, onClose, saveFaceEmbeddingToPerson, cropAndUpload, useAsPhoto]);

  const handleCreatePerson = async () => {
    const name = newPersonName.trim();
    if (!name) return;
    console.log('[FaceLinkSheet] Creating new person:', name);
    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: newPerson, error: createError } = await supabase
        .from('persons')
        .insert([{ person_name: name, user_id: user.id }])
        .select('id, person_name, photo_url')
        .single();

      if (createError || !newPerson) {
        console.error('[FaceLinkSheet] Create person error:', createError);
        Alert.alert('Error', 'Failed to create person. Please try again.');
        return;
      }

      console.log('[FaceLinkSheet] Created person:', newPerson.id, newPerson.person_name);
      setPendingPerson({ id: newPerson.id, person_name: newPerson.person_name, photo_url: newPerson.photo_url });
    } catch (e) {
      console.error('[FaceLinkSheet] handleCreatePerson exception:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePersonSelect = (person: PersonResult) => {
    console.log('[FaceLinkSheet] User selected person:', person.id, person.person_name);
    setPendingPerson(person);
  };

  const handleCreateRowPress = () => {
    console.log('[FaceLinkSheet] User tapped Create new person');
    setShowCreateInput(true);
  };

  const isLoading = isLinking || isCreating;

  const sheetPaddingBottom = Math.max(keyboardHeight, insets.bottom + 40);

  // Build candidates array from faceRow
  const candidates: CandidateItem[] = [];
  if (faceRow?.suggested_person_id && !suggestionDismissed) {
    candidates.push({
      personId: faceRow.suggested_person_id,
      personName: faceRow.suggested_person_name ?? '',
      photoUrl: faceRow.suggested_person_photo_url ?? null,
      confidence: faceRow.match_confidence ?? 0,
    });
  }
  if (faceRow?.suggested_person_id_2 && !suggestionDismissed) {
    candidates.push({
      personId: faceRow.suggested_person_id_2,
      personName: faceRow.suggested_person_name_2 ?? '',
      photoUrl: faceRow.suggested_person_photo_url_2 ?? null,
      confidence: faceRow.match_confidence_2 ?? 0,
    });
  }
  if (faceRow?.suggested_person_id_3 && !suggestionDismissed) {
    candidates.push({
      personId: faceRow.suggested_person_id_3,
      personName: faceRow.suggested_person_name_3 ?? '',
      photoUrl: faceRow.suggested_person_photo_url_3 ?? null,
      confidence: faceRow.match_confidence_3 ?? 0,
    });
  }

  const faceCenterX = faceRow ? faceRow.bbox_x + faceRow.bbox_w / 2 : 0;
  const faceCenterY = faceRow ? faceRow.bbox_y + faceRow.bbox_h / 2 : 0;
  const cropTranslateX = -faceCenterX * CROP_DISPLAY_SIZE * CROP_ZOOM + CROP_DISPLAY_SIZE / 2;
  const cropTranslateY = -faceCenterY * CROP_DISPLAY_SIZE * CROP_ZOOM + CROP_DISPLAY_SIZE / 2;

  const listEmptyComponent = searchQuery.trim() && !isSearching ? (
    <View>
      {!showCreateInput ? (
        <Pressable
          style={styles.createRow}
          onPress={handleCreateRowPress}
        >
          <View style={styles.createIconCircle}>
            <IconSymbol name="plus" size={16} color={colors.primary} />
          </View>
          <Text style={styles.createRowText}>Create new person</Text>
        </Pressable>
      ) : (
        <View style={styles.createInputRow}>
          <TextInput
            style={styles.createInput}
            placeholder="Enter name..."
            placeholderTextColor={colors.textSecondary}
            value={newPersonName}
            onChangeText={setNewPersonName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreatePerson}
          />
          <Pressable
            style={[styles.createConfirmButton, (!newPersonName.trim() || isCreating) && styles.confirmButtonDisabled]}
            onPress={() => {
              console.log('[FaceLinkSheet] Confirm create person pressed');
              handleCreatePerson();
            }}
            disabled={!newPersonName.trim() || isCreating}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.confirmButtonText}>Create</Text>
            )}
          </Pressable>
        </View>
      )}
      <Text style={styles.emptyText}>No people found</Text>
    </View>
  ) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {/* Dark backdrop */}
        <Pressable style={styles.overlay} onPress={onClose} />

        {/* Sheet — full screen from insets.top to bottom */}
        <View style={[
          styles.sheet,
          {
            position: 'absolute',
            top: insets.top,
            bottom: 0,
            left: 0,
            right: 0,
          },
        ]}>
          {/* Inner content wrapper — carries keyboard-aware paddingBottom */}
          <View style={[styles.sheetInner, { paddingBottom: sheetPaddingBottom }]}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Who is this?</Text>
              <Pressable
                onPress={() => {
                  console.log('[FaceLinkSheet] Close button pressed');
                  onClose();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol name="xmark" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Face crop preview */}
            {faceRow && imageUrl ? (
              <View style={styles.faceCropContainer}>
                <Image
                  source={{ uri: imageUrl }}
                  style={[
                    styles.faceCropImage,
                    {
                      transform: [
                        { translateX: cropTranslateX },
                        { translateY: cropTranslateY },
                        { scale: CROP_ZOOM },
                      ],
                    },
                  ]}
                  contentFit="cover"
                />
              </View>
            ) : null}

            {/* Multi-candidate suggestion cards */}
            {candidates.length > 0 && (
              <View style={styles.candidatesRow}>
                <Text style={styles.sectionLabel}>Suggested</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 4 }}
                >
                  {candidates.map((c) => (
                    <CandidateCard
                      key={c.personId}
                      candidate={c}
                      onPress={() => setPendingPerson({ id: c.personId, person_name: c.personName, photo_url: c.photoUrl })}
                    />
                  ))}
                </ScrollView>
                <Pressable
                  style={styles.notThemButton}
                  onPress={() => {
                    if (candidates[0]) {
                      handleRejectSuggestion(candidates[0].personId);
                    }
                  }}
                  disabled={isLoading}
                >
                  <Text style={styles.notThemText}>Not them</Text>
                </Pressable>
              </View>
            )}

            {/* Search input */}
            <View style={styles.searchContainer}>
              <IconSymbol name="magnifyingglass" size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search people..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                autoFocus
                onChangeText={(text) => {
                  console.log('[FaceLinkSheet] Search query changed:', text);
                  setSearchQuery(text);
                }}
                returnKeyType="search"
              />
              {isSearching && <ActivityIndicator size="small" color={colors.primary} />}
            </View>

            {/* Recently linked people (shown when search is empty) */}
            {!searchQuery.trim() && recentPeople.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={styles.sectionLabel}>Recent</Text>
                <FlatList
                  horizontal
                  data={recentPeople}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.recentPersonChip}
                      onPress={() => {
                        console.log('[FaceLinkSheet] Recent person tapped:', item.id, item.person_name);
                        setPendingPerson(item);
                      }}
                    >
                      <PersonAvatar personName={item.person_name} photoUrl={item.photo_url} size={36} />
                      <Text style={styles.recentPersonName} numberOfLines={1}>{item.person_name}</Text>
                    </Pressable>
                  )}
                />
              </View>
            )}

            {/* Results list */}
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              style={styles.resultsList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.personRow}
                  onPress={() => {
                    console.log('[FaceLinkSheet] Person row pressed:', item.person_name);
                    handlePersonSelect(item);
                  }}
                  disabled={isLoading}
                >
                  <PersonAvatar
                    personName={item.person_name}
                    photoUrl={item.photo_url}
                    size={40}
                  />
                  <Text style={styles.personName}>{item.person_name}</Text>
                  {isLinking && <ActivityIndicator size="small" color={colors.primary} />}
                </Pressable>
              )}
              ListEmptyComponent={listEmptyComponent}
            />

            {/* Pending person confirmation panel */}
            {pendingPerson && (
              <View style={styles.confirmPanel}>
                <View style={styles.confirmPanelRow}>
                  <PersonAvatar personName={pendingPerson.person_name} photoUrl={pendingPerson.photo_url} size={40} />
                  <Text style={styles.confirmPanelName}>{pendingPerson.person_name}</Text>
                  <Pressable onPress={() => {
                    console.log('[FaceLinkSheet] Pending person cancelled');
                    setPendingPerson(null);
                  }} style={styles.confirmPanelCancel}>
                    <IconSymbol name="xmark" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <View style={styles.confirmPanelPhotoRow}>
                  <Text style={styles.confirmPanelPhotoLabel}>Use as profile photo</Text>
                  <Switch
                    value={useAsPhoto}
                    onValueChange={(val) => {
                      console.log('[FaceLinkSheet] useAsPhoto toggled:', val);
                      setUseAsPhoto(val);
                    }}
                    trackColor={{ true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                <Pressable
                  style={[styles.confirmButton, isLoading && styles.confirmButtonDisabled]}
                  onPress={() => {
                    if (!pendingPerson) return;
                    console.log('[FaceLinkSheet] Confirm button pressed for person:', pendingPerson.id, pendingPerson.person_name);
                    linkFace(pendingPerson.id, pendingPerson.person_name, pendingPerson.photo_url);
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.confirmButtonText}>Confirm</Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* Skip button */}
            <Pressable style={styles.skipButton} onPress={handleSkip} disabled={isLoading}>
              <Text style={styles.skipButtonText}>Skip — unknown person</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sheetInner: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  faceCropContainer: {
    width: CROP_DISPLAY_SIZE,
    height: CROP_DISPLAY_SIZE,
    borderRadius: 50,
    overflow: 'hidden',
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  faceCropImage: {
    width: '100%',
    height: '100%',
  },
  candidatesRow: {
    marginBottom: 8,
  },
  candidateCard: {
    width: 110,
    alignItems: 'center',
    padding: 10,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.border ?? '#3A3A3A',
  },
  candidateName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  confidencePillGreen: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#22C55E20',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  confidencePillAmber: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#F59E0B20',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  confidencePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  notThemButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    marginBottom: 4,
  },
  notThemText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  recentSection: {
    marginBottom: 8,
  },
  recentPersonChip: {
    alignItems: 'center',
    marginRight: 14,
    width: 60,
  },
  recentPersonName: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  createIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  createRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  createInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  createInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border ?? '#E0E0E0',
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  createConfirmButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  confirmPanel: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border ?? '#3A3A3A',
  },
  confirmPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  confirmPanelName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  confirmPanelCancel: {
    padding: 4,
  },
  confirmPanelPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  confirmPanelPhotoLabel: {
    fontSize: 15,
    color: colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border ?? '#E0E0E0',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  resultsList: {
    flex: 1,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border ?? '#E0E0E0',
  },
  personName: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
    paddingVertical: 20,
  },
  skipButton: {
    alignSelf: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  skipButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});
