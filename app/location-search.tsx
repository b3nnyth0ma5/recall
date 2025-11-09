
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { reverseGeocode } from '@/utils/supabase';
import * as Location from 'expo-location';

interface LocationResult {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  distance?: number;
}

export default function LocationSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationResult | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    // Get user's current location for proximity sorting
    getUserLocation();
  }, []);

  useEffect(() => {
    // Auto-search if query is provided
    if (params.query && typeof params.query === 'string') {
      setSearchQuery(params.query);
      handleSearch(params.query);
    }
  }, [params.query]);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });
        console.log('User location obtained for proximity sorting');
      }
    } catch (error) {
      console.error('Error getting user location:', error);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    // Haversine formula to calculate distance between two points
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
  };

  const handleSearch = async (query?: string) => {
    const searchText = query || searchQuery;
    
    if (!searchText.trim()) {
      return;
    }

    try {
      setLoading(true);
      console.log('Searching for location in Australia:', searchText);

      // Restrict search to Australia by adding countrycodes parameter
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchText)}&countrycodes=au&limit=10`,
        {
          headers: {
            'User-Agent': 'RecallsApp/1.0',
          },
        }
      );

      const data = await response.json();
      console.log('Search results (Australia only):', data.length);

      if (data && data.length > 0) {
        // Calculate distance from user's location if available
        let resultsWithDistance = data.map((result: LocationResult) => {
          if (userLocation) {
            const distance = calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              parseFloat(result.lat),
              parseFloat(result.lon)
            );
            return { ...result, distance };
          }
          return result;
        });

        // Sort by proximity if user location is available
        if (userLocation) {
          resultsWithDistance.sort((a, b) => {
            const distA = a.distance || Infinity;
            const distB = b.distance || Infinity;
            return distA - distB;
          });
          console.log('Results sorted by proximity to user location');
        }

        // Limit to top 5 results
        setResults(resultsWithDistance.slice(0, 5));
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error('Error searching location:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLocation = async (location: LocationResult) => {
    setSelectedLocation(location);
    
    try {
      const latitude = parseFloat(location.lat);
      const longitude = parseFloat(location.lon);

      // Get a cleaner location name
      const locationName = await reverseGeocode(latitude, longitude);

      // Navigate back with the selected location
      router.back();
      
      // Pass the location data back via router params
      if (router.canGoBack()) {
        router.setParams({
          selectedLatitude: latitude.toString(),
          selectedLongitude: longitude.toString(),
          selectedLocationName: locationName,
        });
      }
    } catch (error) {
      console.error('Error processing location:', error);
    }
  };

  const handleSubmitEditing = () => {
    handleSearch();
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
          headerTitle: 'Update Location',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={styles.headerButton}>
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
              style={styles.searchInput}
              placeholder="Search location..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleSubmitEditing}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>

          <Pressable
            onPress={() => handleSearch()}
            style={[styles.searchButton, loading && styles.searchButtonDisabled]}
            disabled={loading || !searchQuery.trim()}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </Pressable>
        </Animated.View>

        <ScrollView
          style={styles.resultsContainer}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : results.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(600)}>
              <Text style={styles.resultsTitle}>Top {results.length} Results (Australia)</Text>
              {results.map((result, index) => (
                <Pressable
                  key={result.place_id}
                  style={[
                    styles.resultItem,
                    selectedLocation?.place_id === result.place_id && styles.resultItemSelected,
                  ]}
                  onPress={() => handleSelectLocation(result)}
                >
                  <View style={styles.resultIconContainer}>
                    <IconSymbol name="mappin.circle.fill" size={24} color={colors.primary} />
                  </View>
                  <View style={styles.resultTextContainer}>
                    <Text style={styles.resultText} numberOfLines={2}>
                      {result.display_name}
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
              ))}
            </Animated.View>
          ) : searchQuery.trim() && !loading ? (
            <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
              <IconSymbol name="magnifyingglass" size={60} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Results Found</Text>
              <Text style={styles.emptyText}>
                Try searching with a different location name
              </Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
            </Animated.View>
          )}
        </ScrollView>

        <View style={styles.noteContainer}>
          <Text style={styles.noteText}>
            Note: react-native-maps is not supported in Natively. Location search uses OpenStreetMap&apos;s Nominatim service.
          </Text>
        </View>
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
    padding: 8,
    marginHorizontal: 8,
  },
  searchSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    marginBottom: 16,
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
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  resultItemSelected: {
    backgroundColor: colors.cardHover,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  resultIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextContainer: {
    flex: 1,
  },
  resultText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 20,
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
  },
  noteContainer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noteText: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
