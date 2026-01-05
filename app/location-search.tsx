
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
  Modal,
  Dimensions,
} from 'react-native';
import * as Location from 'expo-location';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { searchPlaces, searchNearbyPlaces, PlaceResult, extractShortLocationName, isGooglePlacesConfigured } from '@/utils/googlePlaces';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LocationSearchProps {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (location: {
    latitude: number;
    longitude: number;
    name: string;
    primaryType?: string;
    displayName: string;
    formattedAddress: string;
  }) => void;
  initialQuery?: string;
}

export default function LocationSearchScreen({ visible, onClose, onSelectLocation, initialQuery }: LocationSearchProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [apiConfigured, setApiConfigured] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const searchInputRef = React.useRef<TextInput>(null);

  const checkApiConfiguration = useCallback(() => {
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
  }, []);

  const loadNearbyPlaces = useCallback(async (location: { latitude: number; longitude: number }) => {
    if (!apiConfigured) {
      return;
    }

    try {
      setLoadingNearby(true);
      console.log('Loading nearby places for location:', location);

      const places = await searchNearbyPlaces(location);
      
      console.log('Nearby places loaded:', places.length);
      setResults(places);
    } catch (error) {
      console.error('Error loading nearby places:', error);
      setResults([]);
    } finally {
      setLoadingNearby(false);
    }
  }, [apiConfigured]);

  const getUserLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        const location = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        };
        setUserLocation(location);
        console.log('User location obtained for proximity sorting');
        
        loadNearbyPlaces(location);
      }
    } catch (error) {
      console.error('Error getting user location:', error);
    }
  }, [loadNearbyPlaces]);

  useEffect(() => {
    if (visible) {
      getUserLocation();
      checkApiConfiguration();
    }

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
  }, [visible, getUserLocation, checkApiConfiguration]);

  const performSearch = useCallback(async (searchText: string) => {
    if (!searchText.trim()) {
      if (userLocation) {
        loadNearbyPlaces(userLocation);
      } else {
        setResults([]);
      }
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
  }, [userLocation, apiConfigured, loadNearbyPlaces]);

  useEffect(() => {
    if (initialQuery && visible) {
      setSearchQuery(initialQuery);
      performSearch(initialQuery);
    }
  }, [initialQuery, visible, performSearch]);

  useEffect(() => {
    if (searchQuery.trim().length > 2) {
      const timeoutId = setTimeout(() => {
        performSearch(searchQuery);
      }, 500);

      return () => clearTimeout(timeoutId);
    } else if (searchQuery.trim().length === 0) {
      if (userLocation) {
        loadNearbyPlaces(userLocation);
      } else {
        setResults([]);
      }
    }
  }, [searchQuery, performSearch, loadNearbyPlaces, userLocation]);

  const handleSelectLocation = async (location: PlaceResult) => {
    try {
      const formattedLocationName = extractShortLocationName(
        location.displayName,
        location.suburb,
        location.locality
      );
      
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

      // FIXED: Call the callback instead of using router.setParams
      onSelectLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        name: formattedLocationName,
        primaryType: location.primaryTypeDisplayName || undefined,
        displayName: location.displayName,
        formattedAddress: location.formattedAddress,
      });

      // Close the modal
      onClose();
    } catch (error) {
      console.error('[LocationSearch] Error processing location:', error);
      Alert.alert('Error', 'Failed to process location');
    }
  };

  const handleSubmitEditing = () => {
    performSearch(searchQuery);
  };

  const toggleKeyboard = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
    } else {
      searchInputRef.current?.focus();
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={handleClose}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        style={styles.overlay}
      >
        <Pressable 
          style={StyleSheet.absoluteFill} 
          onPress={handleClose}
        />
        
        <Animated.View
          entering={SlideInDown.duration(300).springify()}
          style={styles.slideUpContainer}
        >
          <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <View style={styles.header}>
              <Pressable 
                onPress={handleClose} 
                style={styles.headerButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol name="xmark" size={24} color={colors.text} />
              </Pressable>
              
              <Text style={styles.headerTitle}>Location of your Recall</Text>
              
              <View style={styles.headerSpacer} />
            </View>

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
                    editable={apiConfigured}
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
                ) : (loading || loadingNearby) ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>
                      {loading ? 'Searching with Google Places...' : 'Finding nearby places...'}
                    </Text>
                  </View>
                ) : results.length > 0 ? (
                  <Animated.View entering={FadeInDown.duration(600)}>
                    <Text style={styles.resultsTitle}>
                      {searchQuery.trim() ? `Top ${results.length} Results` : `${results.length} Nearby Places`}
                    </Text>
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
                          onPress={() => handleSelectLocation(result)}
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
                              Will be saved as: {shortName}
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

              <View style={styles.noteContainer}>
                <IconSymbol name="info.circle" size={16} color={colors.textTertiary} />
                <Text style={styles.noteText}>
                  Powered by Google Places API
                </Text>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 2000,
  },
  slideUpContainer: {
    height: SCREEN_HEIGHT * 0.85,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 0,
    overflow: 'hidden',
    zIndex: 2001,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
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
