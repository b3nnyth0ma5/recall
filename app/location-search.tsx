
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
} from 'react-native';
import * as Location from 'expo-location';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { searchPlaces, PlaceResult, extractShortLocationName, isGooglePlacesConfigured } from '@/utils/googlePlaces';

export default function LocationSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [apiConfigured, setApiConfigured] = useState(true);

  useEffect(() => {
    getUserLocation();
    checkApiConfiguration();
  }, []);

  const checkApiConfiguration = () => {
    const configured = isGooglePlacesConfigured();
    setApiConfigured(configured);
    
    if (!configured) {
      Alert.alert(
        'Google Places API Not Configured',
        'Please add your Google Places API key in utils/googlePlaces.ts to use location search.\n\n' +
        'Steps:\n' +
        '1. Go to Google Cloud Console\n' +
        '2. Enable Places API (New) and Geocoding API\n' +
        '3. Create an API key\n' +
        '4. Add the key to utils/googlePlaces.ts',
        [{ text: 'OK' }]
      );
    }
  };

  const performSearch = useCallback(async (searchText: string) => {
    if (!searchText.trim()) {
      setResults([]);
      return;
    }

    if (!apiConfigured) {
      Alert.alert('API Not Configured', 'Please configure your Google Places API key first.');
      return;
    }

    try {
      setLoading(true);
      console.log('Searching for locations with Google Places API:', searchText);

      const places = await searchPlaces(searchText, userLocation || undefined);
      
      console.log('Search results:', places.length);
      setResults(places);
    } catch (error) {
      console.error('Error searching location:', error);
      Alert.alert(
        'Search Error',
        'Failed to search locations. Please check your API key and internet connection.'
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [userLocation, apiConfigured]);

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

  const handleSelectLocation = async (location: PlaceResult) => {
    try {
      const formattedLocationName = extractShortLocationName(location.formattedAddress);
      
      console.log('Selected location data:', {
        latitude: location.latitude,
        longitude: location.longitude,
        formattedLocationName,
        fullAddress: location.formattedAddress,
      });

      if (params.id) {
        const noteId = params.id as string;
        console.log('Updating location for note:', noteId);

        const { error } = await supabase
          .from('recalls')
          .update({
            latitude: location.latitude,
            longitude: location.longitude,
            location: formattedLocationName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', noteId);

        if (error) {
          console.error('Error updating location in database:', error);
          Alert.alert('Error', 'Failed to update location');
        } else {
          console.log('Location updated successfully in database with formatted name:', formattedLocationName);
        }
      }

      router.back();
      
      setTimeout(() => {
        router.setParams({
          selectedLatitude: location.latitude.toString(),
          selectedLongitude: location.longitude.toString(),
          selectedLocationName: location.formattedAddress,
        });
      }, 100);
    } catch (error) {
      console.error('Error processing location:', error);
      Alert.alert('Error', 'Failed to process location');
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
              placeholder="Search location..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleSubmitEditing}
              editable={apiConfigured}
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
          {!apiConfigured ? (
            <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
              <IconSymbol name="exclamationmark.triangle" size={60} color={colors.error} />
              <Text style={styles.emptyTitle}>API Not Configured</Text>
              <Text style={styles.emptyText}>
                Please configure your Google Places API key in utils/googlePlaces.ts
              </Text>
              <View style={styles.instructionsContainer}>
                <Text style={styles.instructionsTitle}>Setup Instructions:</Text>
                <Text style={styles.instructionsText}>
                  1. Go to Google Cloud Console{'\n'}
                  2. Enable Places API (New){'\n'}
                  3. Enable Geocoding API{'\n'}
                  4. Create an API key{'\n'}
                  5. Add key to utils/googlePlaces.ts
                </Text>
              </View>
            </Animated.View>
          ) : loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Searching with Google Places...</Text>
            </View>
          ) : results.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(600)}>
              <Text style={styles.resultsTitle}>Top {results.length} Results</Text>
              {results.map((result) => {
                const shortName = extractShortLocationName(result.formattedAddress);
                return (
                  <Pressable
                    key={result.placeId}
                    style={styles.resultItem}
                    onPress={() => handleSelectLocation(result)}
                  >
                    <View style={styles.resultIconContainer}>
                      <IconSymbol name="mappin.circle.fill" size={24} color={colors.primary} />
                    </View>
                    <View style={styles.resultTextContainer}>
                      <Text style={styles.resultTextBold} numberOfLines={1}>
                        {result.displayName}
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

        <View style={styles.noteContainer}>
          <IconSymbol name="info.circle" size={16} color={colors.textTertiary} />
          <Text style={styles.noteText}>
            Powered by Google Places API
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
    lineHeight: 22,
  },
  instructionsContainer: {
    marginTop: 24,
    padding: 16,
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
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
