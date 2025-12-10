
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Platform,
  Modal,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { supabase, getImageDataUrl } from '@/utils/supabase';
import ExpoMaps, { Marker, Region } from 'expo-maps';

interface RecallMarker {
  id: string;
  latitude: number;
  longitude: number;
  text?: string;
  location?: string;
  created_at: string;
  images?: string[];
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MapViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { notes, searchQuery } = useNotes();
  const [loading, setLoading] = useState(true);
  const [mapRecalls, setMapRecalls] = useState<RecallMarker[]>([]);
  const [selectedRecall, setSelectedRecall] = useState<RecallMarker | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const mapRef = useRef<any>(null);

  // Determine if we're showing search results or all notes
  const hasSearchResults = params.hasSearch === 'true';

  // Request location permissions and get user location
  useEffect(() => {
    (async () => {
      try {
        console.log('[MapView] Requesting location permissions...');
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          console.log('[MapView] Location permission denied');
          setLoadingLocation(false);
          // Default to Melbourne
          setRegion({
            latitude: -37.8136,
            longitude: 144.9631,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          });
          return;
        }

        console.log('[MapView] Getting current location...');
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        
        console.log('[MapView] User location:', location.coords);
        setUserLocation(location);
        
        // Set initial region to user location
        setRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
        
        setLoadingLocation(false);
      } catch (error) {
        console.error('[MapView] Error getting location:', error);
        setLoadingLocation(false);
        // Default to Melbourne
        setRegion({
          latitude: -37.8136,
          longitude: 144.9631,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        });
      }
    })();
  }, []);

  // Load recalls within 2km of user location on initial load (if no search)
  const loadNearbyRecalls = useCallback(async () => {
    if (!userLocation || hasSearchResults) {
      return;
    }

    try {
      console.log('[MapView] Loading recalls within 2km of user location...');
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[MapView] No active session');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('get-recalls-in-bounds', {
        body: {
          userLocation: {
            latitude: userLocation.coords.latitude,
            longitude: userLocation.coords.longitude,
          },
          radiusKm: 2,
        },
      });

      if (error) {
        console.error('[MapView] Error loading nearby recalls:', error);
        setLoading(false);
        return;
      }

      console.log(`[MapView] Found ${data.recalls?.length || 0} recalls within 2km`);
      
      // Load images for recalls
      const recallsWithImages = await loadImagesForRecalls(data.recalls || []);
      setMapRecalls(recallsWithImages);
      setLoading(false);
    } catch (error) {
      console.error('[MapView] Exception loading nearby recalls:', error);
      setLoading(false);
    }
  }, [userLocation, hasSearchResults]);

  // Load recalls when user location is available
  useEffect(() => {
    if (userLocation && !hasSearchResults && !loadingLocation) {
      loadNearbyRecalls();
    }
  }, [userLocation, hasSearchResults, loadingLocation, loadNearbyRecalls]);

  // Load recalls from search results
  useEffect(() => {
    if (hasSearchResults && notes.length > 0) {
      console.log('[MapView] Loading search results on map...');
      const notesWithLocation = notes.filter(
        note => note.latitude && note.longitude
      );
      
      // Convert notes to markers
      const markers = notesWithLocation.map(note => ({
        id: note.id,
        latitude: note.latitude!,
        longitude: note.longitude!,
        text: note.text,
        location: note.location,
        created_at: note.created_at,
        images: note.images,
      }));
      
      setMapRecalls(markers);
      setLoading(false);

      // Fit map to show all markers
      if (markers.length > 0 && mapRef.current) {
        // Calculate bounds
        const lats = markers.map(m => m.latitude);
        const lngs = markers.map(m => m.longitude);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        
        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;
        const latDelta = (maxLat - minLat) * 1.5; // Add padding
        const lngDelta = (maxLng - minLng) * 1.5;
        
        setRegion({
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: Math.max(latDelta, 0.01),
          longitudeDelta: Math.max(lngDelta, 0.01),
        });
      }
    } else if (!hasSearchResults) {
      setLoading(false);
    }
  }, [hasSearchResults, notes]);

  // Load images for recalls
  const loadImagesForRecalls = async (recalls: any[]): Promise<RecallMarker[]> => {
    const recallIds = recalls.map(r => r.id);
    
    // Batch fetch all images
    const { data: allImagesData, error: allImagesError } = await supabase
      .from('recall_images')
      .select('id, recall_id, cdn_url')
      .in('recall_id', recallIds)
      .order('created_at', { ascending: true });

    if (allImagesError) {
      console.error('[MapView] Error fetching images:', allImagesError);
      return recalls.map(r => ({ ...r, images: [] }));
    }

    // Group images by recall_id
    const imagesByRecallId = new Map<string, any[]>();
    (allImagesData || []).forEach(img => {
      if (!imagesByRecallId.has(img.recall_id)) {
        imagesByRecallId.set(img.recall_id, []);
      }
      imagesByRecallId.get(img.recall_id)!.push(img);
    });

    // Load first image for each recall
    const recallsWithImages = await Promise.all(
      recalls.map(async (recall) => {
        const recallImages = imagesByRecallId.get(recall.id) || [];
        
        if (recallImages.length === 0) {
          return { ...recall, images: [] };
        }

        // Load only first image for map markers
        const firstImage = recallImages[0];
        let imageUrl = '';
        
        if (firstImage.cdn_url) {
          imageUrl = firstImage.cdn_url;
        } else {
          const dataUrl = await getImageDataUrl(firstImage.id);
          imageUrl = dataUrl || '';
        }
        
        return { ...recall, images: imageUrl ? [imageUrl] : [] };
      })
    );

    return recallsWithImages;
  };

  // Handle region change (when user pans/zooms)
  const handleRegionChangeComplete = useCallback(async (newRegion: Region) => {
    console.log('[MapView] Region changed:', newRegion);
    setRegion(newRegion);

    // Don't reload if showing search results
    if (hasSearchResults) {
      return;
    }

    try {
      setLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('[MapView] No active session');
        setLoading(false);
        return;
      }

      // Calculate bounding box from region
      const northEast = {
        latitude: newRegion.latitude + newRegion.latitudeDelta / 2,
        longitude: newRegion.longitude + newRegion.longitudeDelta / 2,
      };
      const southWest = {
        latitude: newRegion.latitude - newRegion.latitudeDelta / 2,
        longitude: newRegion.longitude - newRegion.longitudeDelta / 2,
      };

      console.log('[MapView] Loading recalls in bounds:', { northEast, southWest });

      const { data, error } = await supabase.functions.invoke('get-recalls-in-bounds', {
        body: { northEast, southWest },
      });

      if (error) {
        console.error('[MapView] Error loading recalls in bounds:', error);
        setLoading(false);
        return;
      }

      console.log(`[MapView] Found ${data.recalls?.length || 0} recalls in bounds`);
      
      // Load images for recalls
      const recallsWithImages = await loadImagesForRecalls(data.recalls || []);
      setMapRecalls(recallsWithImages);
      setLoading(false);
    } catch (error) {
      console.error('[MapView] Exception loading recalls in bounds:', error);
      setLoading(false);
    }
  }, [hasSearchResults]);

  // Handle marker press
  const handleMarkerPress = useCallback((recall: RecallMarker) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    console.log('[MapView] Marker pressed:', recall.id);
    setSelectedRecall(recall);
    setShowPreview(true);
  }, []);

  // Handle preview press (navigate to note editor)
  const handlePreviewPress = useCallback(() => {
    if (selectedRecall) {
      setShowPreview(false);
      setTimeout(() => {
        try {
          router.push(`/note-editor?id=${selectedRecall.id}`);
        } catch (error) {
          console.error('[MapView] Error navigating to note editor:', error);
        }
      }, 0);
    }
  }, [selectedRecall, router]);

  // Handle back button
  const handleBack = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setTimeout(() => {
      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/search');
        }
      } catch (error) {
        console.error('[MapView] Error navigating back:', error);
      }
    }, 0);
  }, [router]);

  // Render marker with custom view
  const renderMarker = (recall: RecallMarker) => {
    return (
      <Marker
        key={recall.id}
        coordinate={{
          latitude: recall.latitude,
          longitude: recall.longitude,
        }}
        onPress={() => handleMarkerPress(recall)}
      >
        <View style={styles.markerContainer}>
          {recall.images && recall.images.length > 0 ? (
            <Image
              source={{ uri: recall.images[0] }}
              style={styles.markerImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.markerTextContainer}>
              <Text style={styles.markerText} numberOfLines={1}>
                {recall.text?.substring(0, 2) || '📍'}
              </Text>
            </View>
          )}
        </View>
      </Marker>
    );
  };

  if (loadingLocation) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            headerTitle: 'Map View',
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTintColor: colors.text,
            headerLeft: () => (
              <Pressable onPress={handleBack} style={styles.headerButton}>
                <IconSymbol name="chevron.left" size={24} color={colors.text} />
              </Pressable>
            ),
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Getting your location...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: hasSearchResults ? 'Search Results' : 'Nearby Recalls',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable onPress={handleBack} style={styles.headerButton}>
              <IconSymbol name="chevron.left" size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />

      {region && (
        <ExpoMaps
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          onRegionChangeComplete={handleRegionChangeComplete}
          showsUserLocation={true}
          showsMyLocationButton={true}
          provider="google"
        >
          {mapRecalls.map(renderMarker)}
        </ExpoMaps>
      )}

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingBadgeText}>Loading recalls...</Text>
          </View>
        </View>
      )}

      {/* Info badge */}
      <View style={styles.infoBadge}>
        <IconSymbol name="map.fill" size={16} color={colors.primary} />
        <Text style={styles.infoBadgeText}>
          {mapRecalls.length} {mapRecalls.length === 1 ? 'recall' : 'recalls'}
        </Text>
      </View>

      {/* Back to list FAB */}
      {hasSearchResults && (
        <Pressable onPress={handleBack} style={styles.fab}>
          <IconSymbol name="list.bullet" size={24} color="#FFFFFF" />
        </Pressable>
      )}

      {/* Mini recall card preview modal */}
      <Modal
        visible={showPreview}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPreview(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowPreview(false)}
        >
          <Pressable
            style={styles.previewContainer}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedRecall && (
              <React.Fragment>
                <View style={styles.previewHeader}>
                  <View style={styles.previewHeaderLeft}>
                    <IconSymbol name="mappin.circle.fill" size={24} color={colors.primary} />
                    <Text style={styles.previewTitle}>Recall</Text>
                  </View>
                  <Pressable
                    onPress={() => setShowPreview(false)}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <IconSymbol name="xmark" size={20} color={colors.text} />
                  </Pressable>
                </View>

                <ScrollView style={styles.previewContent} showsVerticalScrollIndicator={false}>
                  {/* Prioritize images */}
                  {selectedRecall.images && selectedRecall.images.length > 0 && (
                    <View style={styles.previewImageContainer}>
                      <Image
                        source={{ uri: selectedRecall.images[0] }}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  {/* Show text if available */}
                  {selectedRecall.text && (
                    <Text style={styles.previewText} numberOfLines={4}>
                      {selectedRecall.text}
                    </Text>
                  )}

                  {/* Location */}
                  {selectedRecall.location && (
                    <View style={styles.previewLocationContainer}>
                      <IconSymbol name="mappin" size={16} color={colors.textSecondary} />
                      <Text style={styles.previewLocation} numberOfLines={1}>
                        {selectedRecall.location}
                      </Text>
                    </View>
                  )}

                  {/* Date */}
                  <Text style={styles.previewDate}>
                    {new Date(selectedRecall.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </Text>
                </ScrollView>

                {/* Open button */}
                <Pressable
                  onPress={handlePreviewPress}
                  style={styles.openButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.openButtonText}>Open Recall</Text>
                  <IconSymbol name="arrow.right" size={20} color="#FFFFFF" />
                </Pressable>
              </React.Fragment>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  loadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 4,
  },
  loadingBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  infoBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 4,
  },
  infoBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 16px rgba(255, 107, 122, 0.4)',
    elevation: 8,
  },
  markerContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3)',
    elevation: 5,
  },
  markerImage: {
    width: '100%',
    height: '100%',
  },
  markerTextContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  previewContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingBottom: 32,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  previewHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 8,
  },
  previewContent: {
    padding: 20,
  },
  previewImageContainer: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  previewText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    marginBottom: 16,
  },
  previewLocationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  previewLocation: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  previewDate: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    boxShadow: '0px 4px 12px rgba(255, 107, 122, 0.3)',
    elevation: 3,
  },
  openButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
