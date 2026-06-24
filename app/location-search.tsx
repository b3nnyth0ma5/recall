import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import * as Location from 'expo-location';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { searchPlaces, searchNearbyPlaces, PlaceResult, extractShortLocationName, reverseGeocodeGoogle } from '@/utils/googlePlaces';

interface LocationSearchScreenProps {
  visible?: boolean;
  onClose?: () => void;
  onSelectLocation?: (selectedLocation: {
    latitude: number;
    longitude: number;
    name: string;
    primaryType?: string;
    displayName: string;
    formattedAddress: string;
  }) => void;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const MIN_DISTANCE_DELTA_KM = 0.05; // 50m — only refresh if fresh fix moves us this much

export default function LocationSearchScreen({ onClose, onSelectLocation }: LocationSearchScreenProps = {}) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentLocationPlace, setCurrentLocationPlace] = useState<PlaceResult | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const searchInputRef = React.useRef<TextInput>(null);

  const loadNearbyPlaces = useCallback(async (
    location: { latitude: number; longitude: number },
    options?: { silent?: boolean }
  ) => {
    try {
      if (!options?.silent) setLoadingNearby(true);
      console.log('[LocationSearch] Loading nearby places for location:', location);

      const places = await searchNearbyPlaces(location);

      console.log('[LocationSearch] Nearby places loaded:', places.length);
      setResults(places);
    } catch (error) {
      console.error('[LocationSearch] Error loading nearby places:', error);
      setResults([]);
    } finally {
      if (!options?.silent) setLoadingNearby(false);
    }
  }, []);

  const getUserLocation = useCallback(async () => {
    try {
      console.log('[LocationSearch] Requesting foreground location permission');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[LocationSearch] Location permission denied');
        return;
      }

      // Helper to build and set the currentLocationPlace from a lat/lng fix
      const resolveCurrentLocationPlace = async (lat: number, lng: number) => {
        try {
          const resolvedName = await reverseGeocodeGoogle(lat, lng);
          console.log('[LocationSearch] Reverse geocoded current location:', resolvedName);
          setCurrentLocationPlace({
            placeId: 'current-location',
            displayName: 'Your current location',
            formattedAddress: resolvedName,
            latitude: lat,
            longitude: lng,
            primaryTypeDisplayName: undefined,
            suburb: undefined,
            locality: undefined,
            distance: 0,
          });
        } catch (e) {
          console.error('[LocationSearch] Failed to reverse geocode current location:', e);
        }
      };

      // STAGE 1: Use cached last-known position immediately if available.
      // This typically returns in <50ms and gives us a fix accurate enough for
      // distance-ranked nearby search.
      let initialLocation: { latitude: number; longitude: number } | null = null;
      try {
        const cached = await Location.getLastKnownPositionAsync({
          maxAge: 5 * 60 * 1000, // 5 minutes
          requiredAccuracy: 200, // metres
        });
        if (cached) {
          initialLocation = {
            latitude: cached.coords.latitude,
            longitude: cached.coords.longitude,
          };
          console.log('[LocationSearch] Using cached fix — firing immediate nearby search');
          setUserLocation(initialLocation);
          // Fire the nearby search immediately — don't await
          loadNearbyPlaces(initialLocation);
          // Resolve current location name from cached fix
          resolveCurrentLocationPlace(initialLocation.latitude, initialLocation.longitude);
        } else {
          console.log('[LocationSearch] No cached fix available');
        }
      } catch (e) {
        console.log('[LocationSearch] Cached fix lookup failed, will fall back to fresh fix:', e);
      }

      // STAGE 2: Get a fresh fix in the background. Use Balanced (~100m, ~1-2s)
      // for first refresh; this is a good tradeoff between speed and accuracy
      // since Google's distance-ranked search absorbs the difference.
      try {
        const fresh = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const freshLocation = {
          latitude: fresh.coords.latitude,
          longitude: fresh.coords.longitude,
        };

        if (!initialLocation) {
          // No cached fix was available — this is the first paint. Show results now.
          console.log('[LocationSearch] First paint — firing nearby search with fresh fix');
          setUserLocation(freshLocation);
          loadNearbyPlaces(freshLocation);
          // Resolve current location name from fresh fix
          resolveCurrentLocationPlace(freshLocation.latitude, freshLocation.longitude);
        } else {
          // Compare with the cached fix; only refresh if user has moved meaningfully.
          const deltaKm = haversineKm(
            initialLocation.latitude,
            initialLocation.longitude,
            freshLocation.latitude,
            freshLocation.longitude,
          );
          if (deltaKm > MIN_DISTANCE_DELTA_KM) {
            console.log(`[LocationSearch] Fresh fix moved by ${deltaKm.toFixed(3)}km — silently refreshing list`);
            setUserLocation(freshLocation);
            loadNearbyPlaces(freshLocation, { silent: true });
            // Update current location place with more accurate fresh fix
            resolveCurrentLocationPlace(freshLocation.latitude, freshLocation.longitude);
          } else {
            console.log(`[LocationSearch] Fresh fix within ${(deltaKm * 1000).toFixed(0)}m of cached — keeping current results`);
            // Still update userLocation so subsequent typed searches use the fresh fix
            setUserLocation(freshLocation);
          }
        }
      } catch (e) {
        console.error('[LocationSearch] Failed to get fresh fix:', e);
        // If we already showed cached results, the user gets results — fine.
        // If we didn't (no cache + permission granted but GPS failed), the screen
        // will sit on the empty state. That's an edge case worth a Sentry log but
        // not a UX block.
      }
    } catch (error) {
      console.error('[LocationSearch] Error getting user location:', error);
    }
  }, [loadNearbyPlaces]);

  useEffect(() => {
    getUserLocation();

    // Listen to keyboard events
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
  }, [getUserLocation]);

  const performSearch = useCallback(async (searchText: string) => {
    if (!searchText.trim()) {
      // If search is cleared, reload nearby places
      if (userLocation) {
        loadNearbyPlaces(userLocation);
      } else {
        setResults([]);
      }
      return;
    }

    try {
      setLoading(true);
      console.log('[LocationSearch] Searching for locations with Google Places API:', searchText);

      const places = await searchPlaces(searchText, userLocation || undefined);

      console.log('[LocationSearch] Search results:', places.length);
      setResults(places);
    } catch (error) {
      console.error('[LocationSearch] Error searching location:', error);
      Alert.alert(
        'Search Error',
        'Failed to search locations. Please check your internet connection.'
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [userLocation, loadNearbyPlaces]);

  useEffect(() => {
    if (params.query && typeof params.query === 'string') {
      setSearchQuery(params.query);
      performSearch(params.query);
    }
  }, [params.query, performSearch]);

  useEffect(() => {
    if (searchQuery.trim().length > 2) {
      const timeoutId = setTimeout(() => {
        performSearch(searchQuery);
      }, 500);

      return () => clearTimeout(timeoutId);
    } else if (searchQuery.trim().length === 0) {
      // When search is cleared, reload nearby places
      if (userLocation) {
        loadNearbyPlaces(userLocation);
      } else {
        setResults([]);
      }
    }
  }, [searchQuery, performSearch, loadNearbyPlaces, userLocation]);

  const handleSelectLocation = async (location: PlaceResult) => {
    try {
      // Format location as "DisplayName, Suburb" or "DisplayName, Locality"
      // For current location, use the actual reverse-geocoded address instead of the hardcoded display name
      const formattedLocationName = location.placeId === 'current-location'
        ? location.formattedAddress
        : extractShortLocationName(location.displayName, location.suburb, location.locality);
      console.log('[LocationSearch] handleSelectLocation pressed:', { placeId: location.placeId, formattedLocationName });

      console.log('[LocationSearch] Selected location data:', {
        latitude: location.latitude,
        longitude: location.longitude,
        displayName: location.displayName,
        formattedLocationName,
        fullAddress: location.formattedAddress,
        primaryTypeDisplayName: location.primaryTypeDisplayName,
        suburb: location.suburb,
        locality: location.locality,
      });

      if (params.id) {
        const noteId = params.id as string;
        console.log('[LocationSearch] Updating location for note:', noteId);

        // Update location-related fields including primary type
        const { error } = await supabase
          .from('recalls')
          .update({
            latitude: location.latitude,
            longitude: location.longitude,
            location: formattedLocationName,
            location_primary_type: location.primaryTypeDisplayName || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', noteId);

        if (error) {
          console.error('[LocationSearch] Error updating location in database:', error);
          Alert.alert('Error', 'Failed to update location');
        } else {
          console.log('[LocationSearch] Location updated successfully in database with formatted name:', formattedLocationName);
          console.log('[LocationSearch] Primary type:', location.primaryTypeDisplayName || 'Not available');
        }
      }

      if (onSelectLocation) {
        // Embedded component mode — call the callback directly
        onSelectLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          name: formattedLocationName,
          primaryType: location.primaryTypeDisplayName || undefined,
          displayName: location.displayName,
          formattedAddress: location.formattedAddress,
        });
        if (onClose) onClose();
      } else {
        // FIXED: Navigate back first, then set params in a separate event loop tick
        router.back();

        // FIXED: Use setTimeout to break the call stack and prevent recursion
        setTimeout(() => {
          try {
            console.log('[LocationSearch] Setting location params');
            router.setParams({
              selectedLatitude: location.latitude.toString(),
              selectedLongitude: location.longitude.toString(),
              selectedLocationName: formattedLocationName,
              selectedDisplayName: location.displayName,
              selectedFullAddress: location.formattedAddress,
              selectedPrimaryType: location.primaryTypeDisplayName || '',
            });
          } catch (error) {
            console.error('[LocationSearch] Error setting params:', error);
          }
        }, 100);
      }
    } catch (error) {
      console.error('[LocationSearch] Error processing location:', error);
      Alert.alert('Error', 'Failed to process location');
    }
  };

  const handleSubmitEditing = () => {
    console.log('[LocationSearch] Submit editing — searching:', searchQuery);
    performSearch(searchQuery);
  };

  const toggleKeyboard = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      searchInputRef.current?.focus();
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Location of your Recall',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={styles.headerButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.content}>
        <Animated.View entering={FadeIn.duration(600)} style={styles.searchSection}>
          <View style={styles.searchContainer}>
            <IconSymbol name="magnifyingglass" size={20} color={colors.textSecondary} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search location..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              onSubmitEditing={handleSubmitEditing}
              selectTextOnFocus={true}
              autoFocus={false}
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
            <Pressable
              onPress={toggleKeyboard}
              style={styles.keyboardToggle}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol
                name={keyboardVisible ? "keyboard.chevron.compact.down" : "keyboard"}
                size={20}
                color={colors.primary}
              />
            </Pressable>
          </View>
          {(loading || loadingNearby) && (
            <View style={styles.searchingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.searchingText}>
                {loading ? 'Searching...' : 'Loading nearby places...'}
              </Text>
            </View>
          )}
        </Animated.View>

        <ScrollView
          style={styles.resultsContainer}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
        >
          {(loading || loadingNearby) ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>
                {loading ? 'Searching with Google Places...' : 'Finding nearby places...'}
              </Text>
            </View>
          ) : results.length > 0 || (!searchQuery.trim() && currentLocationPlace) ? (
            <Animated.View entering={FadeInDown.duration(600)}>
              {!searchQuery.trim() && currentLocationPlace ? (
                <>
                  <Text style={styles.sectionHeader}>Your current location</Text>
                  <Pressable
                    style={styles.resultItem}
                    onPress={() => {
                      console.log('[LocationSearch] User tapped current location option');
                      handleSelectLocation(currentLocationPlace);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={styles.resultIconContainer}>
                      <IconSymbol name="location.fill" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.resultTextContainer}>
                      <Text style={styles.resultTextBold} numberOfLines={1}>
                        {currentLocationPlace.displayName}
                      </Text>
                      <Text style={styles.resultText} numberOfLines={2}>
                        {currentLocationPlace.formattedAddress}
                      </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
                  </Pressable>
                  {results.length > 0 && (
                    <Text style={styles.sectionHeader}>
                      {results.length}
                      {' Nearby Places'}
                    </Text>
                  )}
                </>
              ) : (
                <Text style={styles.resultsTitle}>
                  {'Top '}
                  {results.length}
                  {' Results'}
                </Text>
              )}
              {results.map((result) => {
                const shortName = extractShortLocationName(
                  result.displayName,
                  result.suburb,
                  result.locality
                );
                return (
                  <Pressable
                    key={result.placeId}
                    style={styles.resultItem}
                    onPress={() => {
                      console.log('[LocationSearch] User tapped place result:', result.displayName);
                      handleSelectLocation(result);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={styles.resultIconContainer}>
                      <IconSymbol name="mappin.circle.fill" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.resultTextContainer}>
                      <Text style={styles.resultTextBold} numberOfLines={1}>
                        {result.displayName}
                      </Text>
                      {result.primaryTypeDisplayName && (
                        <Text style={styles.resultTypeBadge} numberOfLines={1}>
                          {result.primaryTypeDisplayName}
                        </Text>
                      )}
                      <Text style={styles.resultTextFormatted} numberOfLines={1}>
                        {'Will be saved as: '}
                        {shortName}
                      </Text>
                      <Text style={styles.resultText} numberOfLines={2}>
                        {result.formattedAddress}
                      </Text>
                      {result.distance !== undefined && (
                        <Text style={styles.distanceText}>
                          {result.distance < 1
                            ? `${Math.round(result.distance * 1000)}m away`
                            : `${result.distance.toFixed(1)}km away`}
                        </Text>
                      )}
                    </View>
                    <IconSymbol name="chevron.right" size={20} color={colors.textSecondary} />
                  </Pressable>
                );
              })}
            </Animated.View>
          ) : searchQuery.trim() && !loading ? (
            <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
              <IconSymbol name="magnifyingglass" size={60} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Results Found</Text>
              <Text style={styles.emptyText}>
                Try searching with a different location name
              </Text>
            </Animated.View>
          ) : !userLocation ? (
            <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
              <IconSymbol name="location.fill" size={60} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Getting Your Location</Text>
              <Text style={styles.emptyText}>
                Please allow location access to see nearby places
              </Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
              <IconSymbol name="location.fill" size={60} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>Search for a Location</Text>
              <Text style={styles.emptyText}>
                Enter a place name, address, or landmark
              </Text>
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  headerButton: {
    padding: 8 * 1.15,
    marginHorizontal: 8,
  },
  searchSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16 * 1.15,
    paddingVertical: 12 * 1.15,
    gap: 12,
    minHeight: 48 * 1.1,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    outlineStyle: 'none',
    minHeight: 24 * 1.1,
  },
  keyboardToggle: {
    padding: 4 * 1.15,
  },
  searchingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  searchingText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsContent: {
    padding: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 12,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 4,
    paddingBottom: 8,
    paddingTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16 * 1.15,
    marginBottom: 12,
    gap: 12,
    minHeight: 80 * 1.1,
  },
  resultIconContainer: {
    width: 40 * 1.15,
    height: 40 * 1.15,
    borderRadius: 20 * 1.15,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextContainer: {
    flex: 1,
  },
  resultTextBold: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
    marginBottom: 4,
  },
  resultTypeBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
    backgroundColor: colors.background,
    paddingHorizontal: 8 * 1.15,
    paddingVertical: 3 * 1.15,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
    overflow: 'hidden',
  },
  resultTextFormatted: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
    lineHeight: 18,
    marginBottom: 4,
  },
  resultText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  distanceText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  instructionsContainer: {
    marginTop: 24,
    padding: 16 * 1.15,
    backgroundColor: colors.card,
    borderRadius: 12,
    width: '100%',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
