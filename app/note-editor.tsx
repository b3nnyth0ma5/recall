
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Modal,
  FlatList,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/Note';
import { IconSymbol } from '@/components/IconSymbol';
import { 
  uploadImage, 
  reverseGeocode, 
  searchLocations, 
  formatLocationName,
  LocationSearchResult,
  ImageUploadResult,
  supabase
} from '@/utils/supabase';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function NoteEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { notes, addNote, updateNote, deleteNote, refreshNotes } = useNotes();

  const [text, setText] = useState('');
  const [imageData, setImageData] = useState<ImageUploadResult[]>([]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationResults, setLocationResults] = useState<LocationSearchResult[]>([]);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const textInputRef = useRef<TextInput>(null);

  const isEditing = !!params.id;
  const existingNote = notes.find((n) => n.id === params.id);
  const canSave = text.trim().length > 0 || imageData.length > 0;

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
    };
  }, []);

  useEffect(() => {
    if (existingNote) {
      setText(existingNote.text || '');
      setImageUris(existingNote.images || []);
      if (existingNote.latitude && existingNote.longitude) {
        setLocation({
          latitude: existingNote.latitude,
          longitude: existingNote.longitude,
        });
      }
      setLocationName(existingNote.location || '');
    }
  }, [existingNote]);

  useEffect(() => {
    if (!isEditing) {
      requestLocationPermission();
    }
  }, [isEditing]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });

        const locationName = await reverseGeocode(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude
        );
        setLocationName(locationName);
        console.log('Location obtained:', locationName);
      }
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera roll permissions');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        setLoading(true);
        const newImageData: ImageUploadResult[] = [];
        const newImageUris: string[] = [];

        for (const asset of result.assets) {
          const imgData = await uploadImage(asset.uri);
          if (imgData) {
            newImageData.push(imgData);
            newImageUris.push(`data:${imgData.type};base64,${imgData.base64}`);
          }
        }

        setImageData([...imageData, ...newImageData]);
        setImageUris([...imageUris, ...newImageUris]);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant camera permissions');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        setLoading(true);
        const imgData = await uploadImage(result.assets[0].uri);
        if (imgData) {
          setImageData([...imageData, imgData]);
          setImageUris([...imageUris, `data:${imgData.type};base64,${imgData.base64}`]);
        }
        setLoading(false);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const removeImage = async (index: number) => {
    const newImageData = imageData.filter((_, i) => i !== index);
    const newImageUris = imageUris.filter((_, i) => i !== index);
    setImageData(newImageData);
    setImageUris(newImageUris);
  };

  const handleSave = async () => {
    if (!canSave) {
      Alert.alert('Empty Recall', 'Please add some text or images');
      return;
    }

    try {
      setSaving(true);

      const noteData = {
        text: text.trim(),
        imageData: imageData,
        latitude: location?.latitude,
        longitude: location?.longitude,
        location: locationName,
      };

      if (isEditing && params.id) {
        await updateNote(params.id as string, noteData);
      } else {
        await addNote(noteData);
      }

      router.back();
      setTimeout(() => {
        refreshNotes();
      }, 500);
    } catch (error) {
      console.error('Error saving recall:', error);
      Alert.alert('Error', 'Failed to save recall');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!isEditing || !params.id) return;

    Alert.alert(
      'Delete Recall',
      'Are you sure you want to delete this recall?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNote(params.id as string);
              router.back();
            } catch (error) {
              console.error('Error deleting recall:', error);
              Alert.alert('Error', 'Failed to delete recall');
            }
          },
        },
      ]
    );
  };

  const toggleKeyboard = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      textInputRef.current?.focus();
    }
  };

  const handleLocationSearch = async () => {
    if (!locationSearch.trim()) {
      Alert.alert('Error', 'Please enter a location to search');
      return;
    }

    try {
      setSearchingLocation(true);
      const results = await searchLocations(locationSearch);
      setLocationResults(results);
      
      if (results.length === 0) {
        Alert.alert('No Results', 'No locations found. Please try a different search.');
      }
      
      // Save to search history
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: existing } = await supabase
          .from('search_history')
          .select('id')
          .eq('user_id', user.id)
          .eq('search_text', locationSearch.trim())
          .single();

        if (existing) {
          await supabase
            .from('search_history')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('search_history')
            .insert([{
              user_id: user.id,
              search_text: locationSearch.trim(),
            }]);
        }
      }
    } catch (error) {
      console.error('Error searching location:', error);
      Alert.alert('Error', 'Failed to search for location');
    } finally {
      setSearchingLocation(false);
    }
  };

  const selectLocation = (result: LocationSearchResult) => {
    const latitude = parseFloat(result.lat);
    const longitude = parseFloat(result.lon);
    
    setLocation({ latitude, longitude });
    setLocationName(formatLocationName(result));
    setShowLocationModal(false);
    setLocationSearch('');
    setLocationResults([]);
  };

  const renderLocationResult = ({ item }: { item: LocationSearchResult }) => (
    <Pressable
      style={styles.locationResultItem}
      onPress={() => selectLocation(item)}
    >
      <IconSymbol name="mappin.circle.fill" size={20} color={colors.primary} />
      <View style={styles.locationResultText}>
        <Text style={styles.locationResultName}>{formatLocationName(item)}</Text>
        <Text style={styles.locationResultAddress} numberOfLines={1}>
          {item.display_name}
        </Text>
      </View>
      <IconSymbol name="chevron.right" size={16} color={colors.textTertiary} />
    </Pressable>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: isEditing ? 'Edit Recall' : 'New Recall',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={handleSave}
              disabled={saving || !canSave}
              style={[
                styles.saveButton,
                (saving || !canSave) && styles.saveButtonDisabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <View style={styles.checkmarkContainer}>
                  <IconSymbol name="checkmark" size={20} color="#FFFFFF" />
                </View>
              )}
            </Pressable>
          ),
        }}
      />

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeIn.duration(600)} style={styles.textInputContainer}>
          <TextInput
            ref={textInputRef}
            style={styles.textInput}
            placeholder="Start writing your recall..."
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus={!isEditing}
          />
        </Animated.View>
      </ScrollView>

      {/* Bottom Section */}
      <View style={styles.bottomSection}>
        {imageUris.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.imagesContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {imageUris.map((imageUri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                  <Pressable
                    onPress={() => removeImage(index)}
                    style={styles.removeImageButton}
                  >
                    <IconSymbol name="xmark.circle.fill" size={24} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {locationName && (
          <Animated.View entering={FadeIn.duration(600).delay(200)} style={styles.locationInfo}>
            <IconSymbol name="location.fill" size={16} color={colors.textSecondary} />
            <Text style={styles.locationText}>{locationName}</Text>
          </Animated.View>
        )}

        <View style={styles.toolbar}>
          <View style={styles.toolbarLeft}>
            <Pressable
              onPress={takePhoto}
              disabled={loading}
              style={styles.toolbarButton}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol name="camera.fill" size={28} color={colors.primary} />
              )}
            </Pressable>
            <Pressable
              onPress={pickImage}
              disabled={loading}
              style={styles.toolbarButton}
            >
              <IconSymbol name="photo.fill" size={28} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={() => setShowLocationModal(true)}
              style={styles.toolbarButton}
            >
              <IconSymbol name="mappin.circle.fill" size={28} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={toggleKeyboard}
              style={styles.toolbarButton}
            >
              <IconSymbol 
                name={keyboardVisible ? "keyboard.chevron.compact.down" : "keyboard"} 
                size={28} 
                color={colors.primary} 
              />
            </Pressable>
          </View>

          {isEditing && (
            <Pressable
              onPress={handleDelete}
              style={styles.toolbarButton}
            >
              <IconSymbol name="trash" size={28} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Location Search Modal */}
      <Modal
        visible={showLocationModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowLocationModal(false);
          setLocationResults([]);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable 
            style={styles.modalBackdrop} 
            onPress={() => {
              setShowLocationModal(false);
              setLocationResults([]);
            }}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Location</Text>
              <Pressable onPress={() => {
                setShowLocationModal(false);
                setLocationResults([]);
              }}>
                <IconSymbol name="xmark.circle.fill" size={28} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.modalDescription}>
              Search for an address or business to update the location
            </Text>

            <View style={styles.searchContainer}>
              <IconSymbol name="magnifyingglass" size={20} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search location..."
                placeholderTextColor={colors.textTertiary}
                value={locationSearch}
                onChangeText={setLocationSearch}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={handleLocationSearch}
              />
            </View>

            <Pressable
              onPress={handleLocationSearch}
              disabled={searchingLocation || !locationSearch.trim()}
              style={[
                styles.searchButton,
                (searchingLocation || !locationSearch.trim()) && styles.searchButtonDisabled
              ]}
            >
              {searchingLocation ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </Pressable>

            {locationResults.length > 0 && (
              <View style={styles.resultsContainer}>
                <Text style={styles.resultsTitle}>Top 5 Results:</Text>
                <FlatList
                  data={locationResults}
                  renderItem={renderLocationResult}
                  keyExtractor={(item, index) => `${item.lat}-${item.lon}-${index}`}
                  style={styles.resultsList}
                  scrollEnabled={true}
                />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
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
    padding: 16,
    paddingBottom: 20,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  checkmarkContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInputContainer: {
    minHeight: 300,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    minHeight: 300,
    textAlignVertical: 'top',
  },
  bottomSection: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  imagesContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  imageWrapper: {
    marginRight: 12,
    position: 'relative',
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  locationText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  toolbarButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalDescription: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  searchButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  resultsContainer: {
    flex: 1,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  resultsList: {
    flex: 1,
  },
  locationResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationResultText: {
    flex: 1,
  },
  locationResultName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  locationResultAddress: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
