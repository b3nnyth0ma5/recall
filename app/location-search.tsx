
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
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Location from 'expo-location';
import { supabase } from '@/utils/supabase';

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
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    getUserLocation();
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance;
  };

  const performSearch = useCallback(async (searchText: string) => {
    if (!searchText.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      console.log('Searching for locations in Australia:', searchText);

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

        if (userLocation) {
          resultsWithDistance.sort((a, b) => {
            const distA = a.distance || Infinity;
            const distB = b.distance || Infinity;
            return distA - distB;
          });
          console.log('Results sorted by proximity to user location');
        }

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
  }, [userLocation]);

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
      setResults([]);
    }
  }, [searchQuery, performSearch]);

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

  const extractLocationFromSelection = (displayName: string): string => {
    const parts = displayName.split(',').map(p => p.trim());
    
    if (parts.length < 2) {
      return displayName;
    }

    const firstPart = parts[0];
    const secondPart = parts[1];
		const thirdPart = parts[2];
		const fourthPart = parts[3];
    
    // If first part is a street number, use second and third parts
    if (firstPart && /^\d/.test(firstPart)) {
      if (parts.length >= 3) {
        return `${secondPart}, ${thirdPart}`;
      }
      return secondPart;
    }
    
    // Otherwise use first and third parts
    return `${firstPart}, ${thirdPart}`;
  };

  const handleSelectLocation = async (location: LocationResult) => {
    try {
      const latitude = parseFloat(location.lat);
      const longitude = parseFloat(location.lon);
      const formattedLocationName = extractLocationFromSelection(location.display_name);
      
      console.log('Selected location data:', {
        latitude,
        longitude,
        formattedLocationName,
        fullDisplayName: location.display_name
      });

      if (params.id) {
        const noteId = params.id as string;
        console.log('Updating location for note:', noteId);

        const { error } = await supabase
          .from('recalls')
          .update({
            latitude: latitude,
            longitude: longitude,
            location: formattedLocationName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', noteId);

        if (error) {
          console.error('Error updating location in database:', error);
        } else {
          console.log('Location updated successfully in database with formatted name:', formattedLocationName);
        }
      }

      router.back();
      
      setTimeout(() => {
        router.setParams({
          selectedLatitude: latitude.toString(),
          selectedLongitude: longitude.toString(),
          selectedLocationName: location.display_name,
        });
      }, 100);
    } catch (error) {
      console.error('Error processing location:', error);
    }
  };

  const handleSubmitEditing = () => {
    performSearch(searchQuery);
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
              placeholder="Search location in Australia..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleSubmitEditing}
              editable={true}
              selectTextOnFocus={true}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <IconSymbol name="xmark.circle.fill" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
          {loading && (
            <View style={styles.searchingIndicator}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.searchingText}>Searching...</Text>
            </View>
          )}
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
              {results.map((result) => {
                const formattedName = extractLocationFromSelection(result.display_name);
                return (
                  <Pressable
                    key={result.place_id}
                    style={styles.resultItem}
                    onPress={() => handleSelectLocation(result)}
                  >
                    <View style={styles.resultIconContainer}>
                      <IconSymbol name="mappin.circle.fill" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.resultTextContainer}>
                      <Text style={styles.resultTextBold} numberOfLines={1}>
                        {formattedName}
                      </Text>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    outlineStyle: 'none',
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
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
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
  resultTextBold: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 22,
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
