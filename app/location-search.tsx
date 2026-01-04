
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Keyboard,
  Modal,
  Dimensions,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/utils/supabase';
import * as Location from 'expo-location';
import { searchPlaces, searchNearbyPlaces, PlaceResult, extractShortLocationName, isGooglePlacesConfigured } from '@/utils/googlePlaces';
import { colors } from '@/styles/commonStyles';
import React, { useState, useEffect, useCallback } from 'react';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 10000,
  },
  slideUpContainer: {
    height: SCREEN_HEIGHT * 0.85,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: colors.text,
  },
  clearButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  currentLocationIcon: {
    marginRight: 12,
  },
  currentLocationText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.secondaryBackground,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  locationIcon: {
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    padding: 16,
    margin: 16,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

export default function LocationSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [apiConfigured, setApiConfigured] = useState(true);

  useEffect(() => {
    getUserLocation();
    checkApiConfiguration();
  }, []);

  const checkApiConfiguration = async () => {
    const configured = await isGooglePlacesConfigured();
    setApiConfigured(configured);
  };

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting user location:', error);
    }
  };

  const loadNearbyPlaces = useCallback(async () => {
    if (!userLocation || !apiConfigured) return;

    setIsLoadingNearby(true);
    try {
      const places = await searchNearbyPlaces(userLocation.latitude, userLocation.longitude);
      setNearbyPlaces(places);
    } catch (error) {
      console.error('Error loading nearby places:', error);
    } finally {
      setIsLoadingNearby(false);
    }
  }, [userLocation, apiConfigured]);

  useEffect(() => {
    if (userLocation && apiConfigured) {
      loadNearbyPlaces();
    }
  }, [userLocation, apiConfigured, loadNearbyPlaces]);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || !apiConfigured) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchPlaces(query, userLocation);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching places:', error);
      Alert.alert('Error', 'Failed to search locations. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [userLocation, apiConfigured]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, performSearch]);

  useEffect(() => {
    if (params.query) {
      setSearchQuery(params.query as string);
      performSearch(params.query as string);
    }
  }, [params.query, performSearch]);

  const handleSelectLocation = (location: PlaceResult) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const shortName = extractShortLocationName(location.name, location.address);
    
    router.setParams({
      selectedLatitude: location.latitude.toString(),
      selectedLongitude: location.longitude.toString(),
      selectedLocationName: shortName,
      selectedPrimaryType: location.primaryType || '',
    });
    
    handleClose();
  };

  const handleSubmitEditing = () => {
    Keyboard.dismiss();
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    }
  };

  const toggleKeyboard = () => {
    Keyboard.dismiss();
  };

  const handleClose = () => {
    router.back();
  };

  return (
    <Modal
      visible={true}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View 
        entering={SlideInDown.duration(300)} 
        style={styles.modalContainer}
      >
        <Pressable style={{ flex: 1 }} onPress={handleClose} />
        <View style={styles.slideUpContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <IconSymbol 
                ios_icon_name="xmark" 
                android_material_icon_name="close" 
                size={24} 
                color={colors.text} 
              />
            </Pressable>
            <Text style={styles.headerTitle}>Search Location</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <IconSymbol 
                ios_icon_name="magnifyingglass" 
                android_material_icon_name="search" 
                size={20} 
                color={colors.textSecondary} 
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a location..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSubmitEditing}
                returnKeyType="search"
                autoFocus={true}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton}>
                  <IconSymbol 
                    ios_icon_name="xmark.circle.fill" 
                    android_material_icon_name="cancel" 
                    size={20} 
                    color={colors.textSecondary} 
                  />
                </Pressable>
              )}
            </View>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            {!apiConfigured && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  Location search is not configured. Please add your Google Places API key to enable this feature.
                </Text>
              </View>
            )}

            {apiConfigured && (
              <>
                {/* Current Location Button */}
                {userLocation && (
                  <Pressable 
                    style={styles.currentLocationButton}
                    onPress={async () => {
                      if (userLocation) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.setParams({
                          selectedLatitude: userLocation.latitude.toString(),
                          selectedLongitude: userLocation.longitude.toString(),
                          selectedLocationName: 'Current Location',
                        });
                        handleClose();
                      }
                    }}
                  >
                    <IconSymbol 
                      ios_icon_name="location.fill" 
                      android_material_icon_name="my-location" 
                      size={24} 
                      color={colors.primary} 
                      style={styles.currentLocationIcon}
                    />
                    <Text style={styles.currentLocationText}>Use Current Location</Text>
                  </Pressable>
                )}

                {/* Search Results */}
                {isSearching && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Searching...</Text>
                  </View>
                )}

                {!isSearching && searchQuery.trim() && searchResults.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Search Results</Text>
                    {searchResults.map((location, index) => (
                      <Pressable
                        key={index}
                        style={styles.locationItem}
                        onPress={() => handleSelectLocation(location)}
                      >
                        <IconSymbol 
                          ios_icon_name="location" 
                          android_material_icon_name="location-on" 
                          size={24} 
                          color={colors.textSecondary} 
                          style={styles.locationIcon}
                        />
                        <View style={styles.locationInfo}>
                          <Text style={styles.locationName}>{location.name}</Text>
                          <Text style={styles.locationAddress} numberOfLines={1}>
                            {location.address}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                )}

                {!isSearching && searchQuery.trim() && searchResults.length === 0 && (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No locations found</Text>
                  </View>
                )}

                {/* Nearby Places */}
                {!searchQuery.trim() && nearbyPlaces.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Nearby Places</Text>
                    {nearbyPlaces.map((location, index) => (
                      <Pressable
                        key={index}
                        style={styles.locationItem}
                        onPress={() => handleSelectLocation(location)}
                      >
                        <IconSymbol 
                          ios_icon_name="location" 
                          android_material_icon_name="location-on" 
                          size={24} 
                          color={colors.textSecondary} 
                          style={styles.locationIcon}
                        />
                        <View style={styles.locationInfo}>
                          <Text style={styles.locationName}>{location.name}</Text>
                          <Text style={styles.locationAddress} numberOfLines={1}>
                            {location.address}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                )}

                {!searchQuery.trim() && isLoadingNearby && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading nearby places...</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}
