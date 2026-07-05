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
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/utils/supabase';
import { uploadImageToCloudflare } from '@/utils/cloudflareCDN';
import { PersonAvatar } from '@/components/PersonAvatar';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.6;
const FULL_HEIGHT = Dimensions.get('window').height;

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
  recallId: string;
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
  const [isExpanded, setIsExpanded] = useState(false);

  const animatedHeight = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  // Reset state when sheet opens/closes
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setSearchResults([]);
      setIsCreating(false);
      setNewPersonName('');
      setShowCreateInput(false);
      setIsLinking(false);
      setIsExpanded(false);
      animatedHeight.setValue(SHEET_HEIGHT);
    } else {
      setIsExpanded(false);
    }
  // animatedHeight is a stable Animated.Value ref — safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const expandSheet = useCallback(() => {
    setIsExpanded(true);
    Animated.timing(animatedHeight, {
      toValue: FULL_HEIGHT,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [animatedHeight]);

  const collapseSheet = useCallback(() => {
    setIsExpanded(false);
    Animated.timing(animatedHeight, {
      toValue: SHEET_HEIGHT,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [animatedHeight]);

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

    try {
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUrl,
        [{ crop: { originX: pixelX, originY: pixelY, width: pixelW, height: pixelH } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );

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

  const linkFace = useCallback(async (
    personId: string,
    personName: string,
    existingPhotoUrl: string | null,
  ) => {
    if (!faceRow) return;
    console.log('[FaceLinkSheet] Linking face', faceRow.id, 'to person', personId, personName);
    setIsLinking(true);
    try {
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

      // Upsert recall_people join
      const { error: recallPeopleError } = await supabase
        .from('recall_people')
        .upsert(
          { recall_id: recallId, person_id: personId },
          { ignoreDuplicates: true }
        );

      if (recallPeopleError) {
        console.warn('[FaceLinkSheet] recall_people upsert error (non-fatal):', recallPeopleError);
      }

      console.log('[FaceLinkSheet] Face linked successfully');

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
  }, [faceRow, recallId, onLinked, onClose, promptPhotoUpdate]);

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

  const borderRadius = isExpanded ? 0 : 24;

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
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetWrapper}
      >
        <Animated.View style={[
          styles.sheet,
          {
            height: animatedHeight,
            borderTopLeftRadius: borderRadius,
            borderTopRightRadius: borderRadius,
          },
        ]}>
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

          {/* Search input */}
          <View style={styles.searchContainer}>
            <IconSymbol name="magnifyingglass" size={16} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search people..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onFocus={() => {
                console.log('[FaceLinkSheet] Search input focused — expanding sheet');
                expandSheet();
              }}
              onBlur={() => {
                if (!searchQuery.trim()) {
                  console.log('[FaceLinkSheet] Search input blurred with empty query — collapsing sheet');
                  collapseSheet();
                }
              }}
              onChangeText={(text) => {
                console.log('[FaceLinkSheet] Search query changed:', text);
                setSearchQuery(text);
                if (text.trim() && !isExpanded) {
                  expandSheet();
                }
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
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.card,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
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
