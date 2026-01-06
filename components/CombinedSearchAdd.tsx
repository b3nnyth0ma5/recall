
import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  Modal,
  Platform,
} from 'react-native';
import { useTheme } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { IconSymbol } from './IconSymbol';
import LocationSearchScreen from '@/app/location-search';
import { colors } from '@/styles/commonStyles';

interface CombinedSearchAddProps {
  onCreateRecall?: (data: {
    text: string;
    images: string[];
    location?: { latitude: number; longitude: number; name: string; primaryType?: string };
  }) => void;
  onLocationSelected?: (location: string | null) => void;
}

export function CombinedSearchAdd({ onCreateRecall, onLocationSelected }: CombinedSearchAddProps) {
  const theme = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
    name: string;
    primaryType?: string;
  } | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleCreateRecall = async () => {
    if (!text.trim() && images.length === 0) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (onCreateRecall) {
      onCreateRecall({
        text: text.trim(),
        images,
        location: selectedLocation || undefined,
      });
    }

    // Reset state
    setText('');
    setImages([]);
    setSelectedLocation(null);
    Keyboard.dismiss();
  };

  const handleSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (text.trim()) {
      router.push({
        pathname: '/search',
        params: { q: text.trim(), autoSearch: 'true' },
      });
    } else {
      router.push('/search');
    }
  };

  const handlePlusPress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Sorry, we need camera roll permissions to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newImages = result.assets.map((asset) => asset.uri);
      setImages((prev) => [...prev, ...newImages]);
    }
  };

  const handleLocationPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowLocationModal(true);
  };

  const handleLocationSelected = (location: {
    latitude: number;
    longitude: number;
    name: string;
    primaryType?: string;
    displayName: string;
    formattedAddress: string;
  }) => {
    setSelectedLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      primaryType: location.primaryType,
    });
    setShowLocationModal(false);
    
    if (onLocationSelected) {
      onLocationSelected(location.name);
    }
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.colors.card }]}>
        {/* Top Row: TextInput + Up Arrow */}
        <View style={styles.topRow}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: theme.colors.text }]}
            placeholder="Add a Recall or Search..."
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={5000}
          />
          <Pressable
            style={styles.upArrowButton}
            onPress={handleCreateRecall}
            disabled={!text.trim() && images.length === 0}
          >
            <IconSymbol
              name="arrow.up.circle.fill"
              size={32}
              color={text.trim() || images.length > 0 ? colors.primary : colors.textSecondary}
            />
          </Pressable>
        </View>

        {/* Bottom Row: Plus + Location + Search */}
        <View style={styles.bottomRow}>
          <Pressable style={styles.plusButton} onPress={handlePlusPress}>
            <IconSymbol name="plus.circle.fill" size={32} color={colors.primary} />
          </Pressable>

          <Pressable
            style={[styles.locationButton, { backgroundColor: theme.colors.background }]}
            onPress={handleLocationPress}
          >
            <IconSymbol
              name="location.fill"
              size={16}
              color={selectedLocation ? colors.primary : colors.textSecondary}
            />
            <View style={styles.locationTextContainer}>
              {selectedLocation ? (
                <View style={styles.locationText}>
                  <IconSymbol name="checkmark" size={12} color={colors.primary} />
                </View>
              ) : null}
            </View>
          </Pressable>

          <Pressable style={styles.searchButton} onPress={handleSearch}>
            <IconSymbol name="magnifyingglass.circle.fill" size={32} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={showLocationModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLocationModal(false)}
      >
        <LocationSearchScreen
          visible={showLocationModal}
          onClose={() => setShowLocationModal(false)}
          onSelectLocation={handleLocationSelected}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    minHeight: 40,
    maxHeight: 100,
    paddingRight: 8,
  },
  upArrowButton: {
    padding: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  plusButton: {
    padding: 4,
  },
  locationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 8,
    maxWidth: 200,
  },
  locationTextContainer: {
    marginLeft: 6,
  },
  locationText: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchButton: {
    padding: 4,
  },
});
