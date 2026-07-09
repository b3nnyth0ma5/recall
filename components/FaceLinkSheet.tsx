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
}

interface PersonResult {
  id: string;
  person_name: string;
  photo_url: string | null;
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
    }
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

    // Clamp to [0, 1]
    const clampedX = Math.max(0, rawX);
    const clampedY = Math.max(0, rawY);
    const clampedW = Math.min(rawW, 1 - clampedX);
    const clampedH = Math.min(rawH, 1 - clampedY);

    // Convert to pixel space
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

  const promptPhotoUpdate = useCallback((
    personId: string,
    personName: string,
    existingPhotoUrl: string | null,
    faceId: string,
    onResolved: (finalPhotoUrl: string | null) => void,
  ) => {
    if (!existingPhotoUrl) {
      Alert.alert(
        'Set profile photo?',
        `Use this face as ${personName}'s photo?`,
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => {
              console.log('[FaceLinkSheet] User chose not to set profile photo for:', personName);
              onResolved(existingPhotoUrl);
            },
          },
          {
            text: 'Set photo',
            onPress: () => {
              console.log('[FaceLinkSheet] User chose to set profile photo for:', personName);
              cropAndUpload(personId, personName, existingPhotoUrl, faceId, onResolved);
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Update profile photo?',
        `Replace ${personName}'s current photo with this face?`,
        [
          {
            text: 'Keep existing',
            style: 'cancel',
            onPress: () => {
              console.log('[FaceLinkSheet] User chose to keep existing photo for:', personName);
              onResolved(existingPhotoUrl);
            },
          },
          {
            text: 'Replace',
            onPress: () => {
              console.log('[FaceLinkSheet] User chose to replace profile photo for:', personName);
              cropAndUpload(personId, personName, existingPhotoUrl, faceId, onResolved);
            },
          },
        ]
      );
    }
  }, [cropAndUpload]);

  // Fire-and-forget: fetch the face embedding from DB and upsert it onto the person
  const saveFaceEmbeddingToPerson = useCallback(async (faceRowId: string, personId: string) => {
    console.log('[FaceLinkSheet] saveFaceEmbeddingToPerson called for face:', faceRowId, 'person:', personId);
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
      if (!embeddingValue) {
        console.log('[FaceLinkSheet] saveFaceEmbeddingToPerson: no embedding on face row, skipping');
        return;
      }
      const embeddingString = typeof embeddingValue === 'string'
        ? embeddingValue
        : JSON.stringify(embeddingValue);
      console.log('[FaceLinkSheet] saveFaceEmbeddingToPerson: calling upsert_person_face_embedding RPC');
      const { error: rpcError } = await supabase.rpc('upsert_person_face_embedding', {
        p_person_id: personId,
        new_embedding: embeddingString,
      });
      if (rpcError) {
        console.warn('[FaceLinkSheet] saveFaceEmbeddingToPerson: RPC error (non-fatal):', rpcError);
      } else {
        console.log('[FaceLinkSheet] saveFaceEmbeddingToPerson: embedding saved to person:', personId);
      }
    } catch (e) {
      console.warn('[FaceLinkSheet] saveFaceEmbeddingToPerson: exception (non-fatal):', e);
    }
  }, []);

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

      // Check if recall_people row already exists
      const { data: existingRow } = await supabase
        .from('recall_people')
        .select('recall_id')
        .eq('recall_id', recallId)
        .eq('person_id', personId)
        .maybeSingle();

      if (!existingRow && recallId) {
        const { error: recallPeopleError } = await supabase
          .from('recall_people')
          .insert({ recall_id: recallId, person_id: personId, user_id: user.id });

        if (recallPeopleError) {
          console.error('[FaceLinkSheet] recall_people insert error:', recallPeopleError);
          // Non-fatal — face is linked, just the recall tag failed
        } else {
          console.log('[FaceLinkSheet] recall_people row inserted successfully');
        }
      } else {
        console.log('[FaceLinkSheet] recall_people row already exists, skipping insert');
      }

      console.log('[FaceLinkSheet] Face linked successfully');

      // Fire-and-forget: save embedding to person for future matching
      saveFaceEmbeddingToPerson(faceRow.id, personId);

      // Capture faceId before closing (faceRow may change)
      const faceId = faceRow.id;
      onClose();

      // Prompt for photo after closing sheet; fire onLinked with the final URL
      setTimeout(() => {
        promptPhotoUpdate(personId, personName, existingPhotoUrl, faceId, (finalPhotoUrl) => {
          console.log('[FaceLinkSheet] onLinked called with final photo URL:', finalPhotoUrl);
          onLinked(faceId, personId, personName, finalPhotoUrl);
        });
      }, 400);
    } catch (e) {
      console.error('[FaceLinkSheet] linkFace exception:', e);
      Alert.alert('Error', 'Failed to link face. Please try again.');
    } finally {
      setIsLinking(false);
    }
  }, [faceRow, recallId, onLinked, onClose, promptPhotoUpdate, saveFaceEmbeddingToPerson]);

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
      await linkFace(newPerson.id, newPerson.person_name, newPerson.photo_url);
    } catch (e) {
      console.error('[FaceLinkSheet] handleCreatePerson exception:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const handlePersonSelect = (person: PersonResult) => {
    console.log('[FaceLinkSheet] User selected person:', person.id, person.person_name);
    linkFace(person.id, person.person_name, person.photo_url);
  };

  const handleCreateRowPress = () => {
    console.log('[FaceLinkSheet] User tapped Create new person');
    setShowCreateInput(true);
  };

  const isLoading = isLinking || isCreating;

  const sheetPaddingBottom = Math.max(keyboardHeight, insets.bottom + 40);

  const showSuggestionCard =
    faceRow !== null &&
    faceRow.match_confidence !== null &&
    !faceRow.confirmed_by_user &&
    faceRow.suggested_person_id !== null &&
    !suggestionDismissed;

  const confidencePct = faceRow?.match_confidence != null
    ? Math.round(faceRow.match_confidence * 100)
    : 0;

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
            style={[styles.confirmButton, (!newPersonName.trim() || isCreating) && styles.confirmButtonDisabled]}
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

            {/* Suggestion card */}
            {showSuggestionCard && faceRow && (
              <View style={styles.suggestionCard}>
                <View style={styles.suggestionRow}>
                  <PersonAvatar
                    personName={faceRow.suggested_person_name ?? ''}
                    photoUrl={faceRow.suggested_person_photo_url ?? null}
                    size={52}
                  />
                  <View style={styles.suggestionInfo}>
                    <Text style={styles.suggestionName} numberOfLines={1}>
                      {faceRow.suggested_person_name ?? ''}
                    </Text>
                    <View style={styles.confidenceBadge}>
                      <Text style={styles.confidenceBadgeText}>
                        {confidencePct}% match
                      </Text>
                    </View>
                  </View>
                </View>
                <Pressable
                  style={styles.suggestionYesButton}
                  onPress={() => {
                    console.log('[FaceLinkSheet] Suggestion accepted for person:', faceRow.suggested_person_id, faceRow.suggested_person_name);
                    linkFace(
                      faceRow.suggested_person_id!,
                      faceRow.suggested_person_name ?? '',
                      faceRow.suggested_person_photo_url ?? null,
                    );
                  }}
                  disabled={isLoading}
                >
                  <Text style={styles.suggestionYesText}>Yes, that's them</Text>
                </Pressable>
                <Pressable
                  style={styles.suggestionNoButton}
                  onPress={() => {
                    console.log('[FaceLinkSheet] Suggestion rejected for person:', faceRow.suggested_person_id);
                    setSuggestionDismissed(true);
                  }}
                  disabled={isLoading}
                >
                  <Text style={styles.suggestionNoText}>Not them</Text>
                </Pressable>
                <View style={styles.suggestionDivider} />
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
  confirmButton: {
    height: 44,
    paddingHorizontal: 18,
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
  suggestionCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border ?? '#3A3A3A',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  suggestionInfo: {
    flex: 1,
    gap: 6,
  },
  suggestionName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  confidenceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.primary}26`,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  confidenceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  suggestionYesButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  suggestionYesText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  suggestionNoButton: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border ?? '#3A3A3A',
  },
  suggestionNoText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  suggestionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border ?? '#3A3A3A',
    marginTop: 14,
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
});
