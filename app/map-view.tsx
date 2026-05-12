
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

// Only import react-native-maps on native platforms
let MapView: any = null;
let Marker: any = null;
let Callout: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default;
  Marker = RNMaps.Marker;
  Callout = RNMaps.Callout;
  PROVIDER_GOOGLE = RNMaps.PROVIDER_GOOGLE;
}

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#242424' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1A1A1A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#B0B0B0' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#B0B0B0' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#2A3A2A' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6B9A6B' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3A3A3A' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#2A2A2A' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4A4A4A' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#3A3A3A' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#1A2A3A' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4A6A8A' }] },
];

export default function MapViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [mapNotes, setMapNotes] = useState<Note[]>([]);
  const [allLocationNotes, setAllLocationNotes] = useState<Note[]>([]);
  const [visibleNotes, setVisibleNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const hasSearchResults = params.hasSearch === 'true';
  const idsParam = typeof params.ids === 'string' ? params.ids : '';
  const searchIds = useMemo(
    () => (idsParam ? idsParam.split(',').filter(Boolean) : []),
    [idsParam]
  );

  // Keep a ref to the latest mapNotes for use in handleMapReady (Bug 3)
  const mapNotesRef = useRef<Note[]>([]);
  useEffect(() => { mapNotesRef.current = mapNotes; }, [mapNotes]);

  useEffect(() => {
    // search mode doesn't need user — run immediately
    // browse-all mode: wait for auth to resolve, keep spinner visible
    if (searchIds.length === 0 && !user?.id) return;

    async function loadNotes() {
      setLoading(true);
      if (searchIds.length > 0) {
        console.log('[MapView] Fetching', searchIds.length, 'search result recalls by ID');
        const { data, error } = await supabase
          .from('recalls')
          .select('id, text, latitude, longitude, location, created_at, images')
          .in('id', searchIds)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);
        if (error) {
          console.error('[MapView] Error fetching search recalls:', error);
        } else {
          const valid = ((data ?? []) as any[]).filter(
            (n) => n.latitude != null && n.longitude != null
          ) as Note[];
          console.log('[MapView] Loaded', valid.length, 'search recalls with location');
          setMapNotes(valid);
        }
      } else {
        console.log('[MapView] Fetching all location recalls for user', user!.id);
        const { data, error } = await supabase
          .from('recalls')
          .select('id, text, latitude, longitude, location, created_at, images')
          .eq('user_id', user!.id)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('created_at', { ascending: false });
        if (error) {
          console.error('[MapView] Error fetching all location recalls:', error);
        } else {
          const valid = ((data ?? []) as any[]).filter(
            (n) => n.latitude != null && n.longitude != null
          ) as Note[];
          console.log('[MapView] Loaded', valid.length, 'total recalls with location');
          setAllLocationNotes(valid);
          setMapNotes(valid);
          setVisibleNotes(valid);
        }
      }
      setLoading(false);
    }
    loadNotes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, searchIds]); // re-runs when auth resolves

  // ─── Browse-all: dynamic viewport filtering ──────────────────────────────────

  const handleRegionChange = useCallback((region: any) => {
    if (searchIds.length > 0) return; // search mode — no filtering
    const { latitude, longitude, latitudeDelta, longitudeDelta } = region;
    const minLat = latitude - latitudeDelta / 2;
    const maxLat = latitude + latitudeDelta / 2;
    const minLng = longitude - longitudeDelta / 2;
    const maxLng = longitude + longitudeDelta / 2;
    const visible = allLocationNotes.filter(
      n =>
        n.latitude! >= minLat &&
        n.latitude! <= maxLat &&
        n.longitude! >= minLng &&
        n.longitude! <= maxLng
    );
    console.log('[MapView] Region changed — visible pins:', visible.length, 'of', allLocationNotes.length);
    setVisibleNotes(visible);
  }, [allLocationNotes, searchIds]);

  // ─── Web: Google Maps script injection ───────────────────────────────────────

  const addMarkers = useCallback((map: any) => {
    if (Platform.OS !== 'web' || !window.google) return;

    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const handleMarkerClick = (note: Note) => {
      setSelectedNote(note);
      setShowPreview(true);
    };

    mapNotes.forEach(note => {
      if (!note.latitude || !note.longitude) return;

      const markerDiv = document.createElement('div');
      markerDiv.style.cssText = `
        width: 48px;
        height: 48px;
        background: ${colors.primary};
        border: 3px solid #FFFFFF;
        border-radius: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.3);
        overflow: hidden;
        position: relative;
      `;

      if (note.images && note.images.length > 0) {
        const img = document.createElement('img');
        img.src = note.images[0];
        img.style.cssText = `
          width: 100%;
          height: 100%;
          object-fit: cover;
        `;
        markerDiv.appendChild(img);
      } else if (note.text) {
        const textPreview = document.createElement('div');
        textPreview.textContent = note.text.substring(0, 2);
        textPreview.style.cssText = `
          color: #FFFFFF;
          font-size: 14px;
          font-weight: bold;
          text-align: center;
        `;
        markerDiv.appendChild(textPreview);
      }

      const createCustomMarker = (position: any, div: any) => {
        const marker = new window.google.maps.OverlayView();

        marker.onAdd = function () {
          const panes = marker.getPanes();
          panes.overlayMouseTarget.appendChild(div);
          div.addEventListener('click', () => {
            handleMarkerClick(note);
          });
        };

        marker.draw = function () {
          const overlayProjection = marker.getProjection();
          const pos = overlayProjection.fromLatLngToDivPixel(position);
          if (pos) {
            div.style.left = pos.x - 24 + 'px';
            div.style.top = pos.y - 24 + 'px';
            div.style.position = 'absolute';
          }
        };

        marker.onRemove = function () {
          if (div.parentNode) {
            div.parentNode.removeChild(div);
          }
        };

        return marker;
      };

      const marker = createCustomMarker(
        { lat: note.latitude, lng: note.longitude },
        markerDiv
      );

      marker.setMap(map);
      markersRef.current.push(marker);
    });
  }, [mapNotes]);

  const initializeMap = useCallback(() => {
    if (Platform.OS !== 'web' || !window.google) return;

    const mapElement = document.getElementById('google-map');
    if (!mapElement) return;

    const center = { lat: -37.8136, lng: 144.9631 };
    const zoom = 12;

    if (mapNotes.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      mapNotes.forEach(note => {
        if (note.latitude && note.longitude) {
          bounds.extend({ lat: note.latitude, lng: note.longitude });
        }
      });

      const map = new window.google.maps.Map(mapElement, {
        center: bounds.getCenter(),
        zoom: 12,
        styles: DARK_MAP_STYLE,
      });

      mapRef.current = map;
      map.fitBounds(bounds);
      addMarkers(map);
    } else {
      const map = new window.google.maps.Map(mapElement, {
        center,
        zoom,
        styles: DARK_MAP_STYLE,
      });
      mapRef.current = map;
    }

    setLoading(false);
  }, [mapNotes, addMarkers]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setLoading(false);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? ''}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = initializeMap;
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [initializeMap]);

  useEffect(() => {
    if (mapRef.current && Platform.OS === 'web') {
      addMarkers(mapRef.current);
    }
  }, [mapNotes, addMarkers]);

  // ─── Shared handlers ─────────────────────────────────────────────────────────

  const handlePreviewPress = () => {
    if (selectedNote) {
      console.log('[MapView] Opening note from preview:', selectedNote.id);
      setShowPreview(false);
      router.push(`/note-editor?id=${selectedNote.id}`);
    }
  };

  const handleBackToSearch = () => {
    console.log('[MapView] Back to list pressed');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.back();
  };

  const handleCalloutPress = (note: Note) => {
    console.log('[MapView] Callout tapped, opening note:', note.id);
    router.push(`/note-editor?id=${note.id}`);
  };

  // ─── Native: fit map to markers ──────────────────────────────────────────────

  const handleMapReady = useCallback(() => {
    if (!mapRef.current) return;
    const notes = mapNotesRef.current;
    console.log('[MapView] Map ready, fitting to', notes.length, 'coordinates');
    if (notes.length === 0) return;

    const coordinates = notes
      .filter(n => n.latitude && n.longitude)
      .map(n => ({ latitude: n.latitude as number, longitude: n.longitude as number }));

    if (coordinates.length === 0) return;

    if (coordinates.length === 1) {
      mapRef.current.animateToRegion(
        {
          latitude: coordinates[0].latitude,
          longitude: coordinates[0].longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500
      );
    } else {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 80, right: 50, bottom: 150, left: 50 },
        animated: true,
      });
    }
  }, []); // reads from ref — no deps needed

  // Secondary fit: handles the case where map was ready before data arrived
  useEffect(() => {
    if (!mapRef.current || mapNotes.length === 0 || Platform.OS === 'web') return;
    const coordinates = mapNotes
      .filter(n => n.latitude && n.longitude)
      .map(n => ({ latitude: n.latitude as number, longitude: n.longitude as number }));
    if (coordinates.length === 0) return;
    setTimeout(() => {
      if (!mapRef.current) return;
      if (coordinates.length === 1) {
        mapRef.current.animateToRegion(
          {
            latitude: coordinates[0].latitude,
            longitude: coordinates[0].longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          500
        );
      } else {
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: { top: 80, right: 50, bottom: 150, left: 50 },
          animated: true,
        });
      }
    }, 300);
  }, [mapNotes]);

  // ─── Derived values ───────────────────────────────────────────────────────────

  const mapCountText = searchIds.length > 0
    ? `${mapNotes.length} of ${searchIds.length} recalls on map`
    : `${visibleNotes.length} visible · ${allLocationNotes.length} total`;
  const fabBottom = insets.bottom + 24;
  const headerTitle = hasSearchResults ? 'Search Results Map' : 'Recalls Map';
  const displayNotes = searchIds.length > 0 ? mapNotes : visibleNotes;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: headerTitle,
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

      {Platform.OS === 'web' ? (
        // ── Web implementation ──────────────────────────────────────────────────
        <React.Fragment>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading map...</Text>
            </View>
          ) : mapNotes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol name="map" size={80} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Locations Found</Text>
              <Text style={styles.emptyText}>
                {hasSearchResults
                  ? 'No search results have location data'
                  : 'Add location data to your recalls to see them on the map'}
              </Text>
            </View>
          ) : (
            <React.Fragment>
              <div
                id="google-map"
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: colors.background,
                }}
              />

              <View style={styles.infoBadge}>
                <IconSymbol name="map.fill" size={16} color={colors.primary} />
                <Text style={styles.infoBadgeText}>{mapCountText} on map</Text>
              </View>

              <Pressable onPress={handleBackToSearch} style={[styles.fab, { bottom: fabBottom }]}>
                <IconSymbol name="list.bullet" size={24} color="#FFFFFF" />
              </Pressable>
            </React.Fragment>
          )}

          {/* Note Preview Modal (web only) */}
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
                {selectedNote && (
                  <React.Fragment>
                    <View style={styles.previewHeader}>
                      <Text style={styles.previewTitle}>Recall Preview</Text>
                      <Pressable
                        onPress={() => setShowPreview(false)}
                        style={styles.closeButton}
                      >
                        <IconSymbol name="xmark" size={20} color={colors.text} />
                      </Pressable>
                    </View>

                    <ScrollView style={styles.previewContent}>
                      {selectedNote.images && selectedNote.images.length > 0 && (
                        <View style={styles.previewImagesContainer}>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.previewImagesScroll}
                          >
                            {selectedNote.images.map((image, index) => (
                              <Image
                                key={index}
                                source={{ uri: image }}
                                style={styles.previewImage}
                                resizeMode="cover"
                              />
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {selectedNote.text && (
                        <Text style={styles.previewText}>{selectedNote.text}</Text>
                      )}

                      {selectedNote.location && (
                        <View style={styles.previewLocationContainer}>
                          <IconSymbol name="map.fill" size={16} color={colors.textSecondary} />
                          <Text style={styles.previewLocation}>{selectedNote.location}</Text>
                        </View>
                      )}

                      <Text style={styles.previewDate}>
                        {new Date(selectedNote.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </Text>
                    </ScrollView>

                    <Pressable onPress={handlePreviewPress} style={styles.openButton}>
                      <Text style={styles.openButtonText}>Open Recall</Text>
                      <IconSymbol name="arrow.right" size={20} color="#FFFFFF" />
                    </Pressable>
                  </React.Fragment>
                )}
              </Pressable>
            </Pressable>
          </Modal>
        </React.Fragment>
      ) : (
        // ── Native implementation ───────────────────────────────────────────────
        <React.Fragment>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading map...</Text>
            </View>
          ) : mapNotes.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconSymbol name="map" size={80} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Locations Found</Text>
              <Text style={styles.emptyText}>
                {hasSearchResults
                  ? 'No search results have location data'
                  : 'Add location data to your recalls to see them on the map'}
              </Text>
            </View>
          ) : (
            <React.Fragment>
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                userInterfaceStyle="dark"
                customMapStyle={Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
                onMapReady={handleMapReady}
                onRegionChangeComplete={handleRegionChange}
                showsUserLocation={false}
                showsMyLocationButton={false}
              >
                {displayNotes.map(note => {
                  if (!note.latitude || !note.longitude) return null;
                  const textPreview = note.text ? note.text.substring(0, 80) : '';
                  const calloutText = textPreview + (note.text && note.text.length > 80 ? '…' : '');
                  return (
                    <Marker
                      key={note.id}
                      coordinate={{ latitude: note.latitude, longitude: note.longitude }}
                      pinColor={colors.primary}
                    >
                      <Callout onPress={() => handleCalloutPress(note)}>
                        <View style={styles.calloutContainer}>
                          {calloutText.length > 0 && (
                            <Text style={styles.calloutText}>{calloutText}</Text>
                          )}
                          {note.location ? (
                            <Text style={styles.calloutLocation}>{note.location}</Text>
                          ) : null}
                          <Text style={styles.calloutTapHint}>Tap to open</Text>
                        </View>
                      </Callout>
                    </Marker>
                  );
                })}
              </MapView>

              {/* Info Badge */}
              <View style={styles.infoBadge}>
                <IconSymbol name="map.fill" size={16} color={colors.primary} />
                <Text style={styles.infoBadgeText}>{mapCountText} on map</Text>
              </View>

              {/* FAB — back to list */}
              <Pressable
                onPress={handleBackToSearch}
                style={[styles.fab, { bottom: fabBottom }]}
              >
                <IconSymbol name="list.bullet" size={24} color="#FFFFFF" />
              </Pressable>
            </React.Fragment>
          )}
        </React.Fragment>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },
  headerButton: {
    padding: 8,
    marginHorizontal: 8,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 24,
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
  infoBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    elevation: 4,
  },
  infoBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  fab: {
    position: 'absolute',
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  calloutContainer: {
    width: 200,
    padding: 8,
  },
  calloutText: {
    fontSize: 13,
    color: '#1A1A1A',
    marginBottom: 4,
    lineHeight: 18,
  },
  calloutLocation: {
    fontSize: 12,
    color: '#555555',
    marginBottom: 4,
  },
  calloutTapHint: {
    fontSize: 11,
    color: '#888888',
    fontStyle: 'italic',
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
    maxHeight: '80%',
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
  previewImagesContainer: {
    marginBottom: 16,
  },
  previewImagesScroll: {
    flexDirection: 'row',
  },
  previewImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginRight: 12,
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
  },
  openButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
