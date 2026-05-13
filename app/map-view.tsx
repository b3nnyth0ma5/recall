
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
  Animated,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import * as Location from 'expo-location';
import { TimeAgo } from '@/components/TimeAgo';
import { NoteCard } from '@/components/NoteCard';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Only import react-native-maps on native platforms
let MapView: any = null;
let Marker: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default;
  Marker = RNMaps.Marker;
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
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Bottom sheet animation state
  const slideAnim = useRef(new Animated.Value(300)).current;
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [fullRecallVisible, setFullRecallVisible] = useState(false);

  const hasSearchResults = params.hasSearch === 'true';
  const idsParam = typeof params.ids === 'string' ? params.ids : '';
  const searchIds = useMemo(
    () => (idsParam ? idsParam.split(',').filter(Boolean) : []),
    [idsParam]
  );

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Keep a ref to the latest mapNotes for use in handleMapReady (Bug 3)
  const mapNotesRef = useRef<Note[]>([]);
  useEffect(() => { mapNotesRef.current = mapNotes; }, [mapNotes]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

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

  // ─── Marker press handlers ────────────────────────────────────────────────────

  const handleMarkerPress = useCallback((note: Note) => {
    console.log('[MapView] Marker pressed, note id:', note.id);
    setSelectedNote(note);
    setShowBottomSheet(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [slideAnim]);

  const handleDismiss = useCallback(() => {
    console.log('[MapView] Bottom sheet dismissed');
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setShowBottomSheet(false);
      setSelectedNote(null);
    });
  }, [slideAnim]);

  // ─── Web: Google Maps script injection ───────────────────────────────────────

  const addMarkers = useCallback((map: any) => {
    if (Platform.OS !== 'web' || !window.google) return;

    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

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
            handleMarkerPress(note);
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
  }, [mapNotes, handleMarkerPress]);

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

  const handleBackToSearch = () => {
    console.log('[MapView] Back to list pressed');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.back();
  };

  // ─── Native: fit map to markers ──────────────────────────────────────────────

  const handleMapReady = useCallback(() => {
    if (!mapRef.current) return;
    if (searchIds.length === 0) return; // browse-all: initialRegion handles centering
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
  }, [searchIds]); // searchIds guards browse-all mode

  // Secondary fit: handles the case where map was ready before data arrived
  useEffect(() => {
    if (!mapRef.current || mapNotes.length === 0 || Platform.OS === 'web') return;
    if (searchIds.length === 0) return; // browse-all: don't override user-location initialRegion
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
  }, [mapNotes, searchIds.length]);

  // ─── Derived values ───────────────────────────────────────────────────────────

  const mapCountText = searchIds.length > 0
    ? `${mapNotes.length} of ${searchIds.length} recalls on map`
    : `${visibleNotes.length} visible · ${allLocationNotes.length} total`;
  const fabBottom = insets.bottom + 24;
  const headerTitle = hasSearchResults ? 'Search Results Map' : 'Recalls Map';
  const displayNotes = searchIds.length > 0 ? mapNotes : visibleNotes;

  // ─── Derived display values ───────────────────────────────────────────────────

  const sheetThumbInitials = selectedNote?.text
    ? selectedNote.text.substring(0, 2).toUpperCase()
    : '??';
  const sheetTitle = selectedNote?.text
    ? selectedNote.text.replace(/\n/g, ' ').substring(0, 60)
    : 'Recall';
  const sheetBody = selectedNote?.text ?? null;

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
                showsUserLocation={true}
                showsMyLocationButton={true}
                initialRegion={
                  searchIds.length === 0 && userLocation
                    ? {
                        latitude: userLocation.latitude,
                        longitude: userLocation.longitude,
                        latitudeDelta: 0.1,
                        longitudeDelta: 0.1,
                      }
                    : undefined
                }
              >
                {displayNotes.map(note => {
                  if (!note.latitude || !note.longitude) return null;
                  return (
                    <Marker
                      key={note.id}
                      coordinate={{ latitude: note.latitude as number, longitude: note.longitude as number }}
                      pinColor={colors.primary}
                      onPress={() => handleMarkerPress(note)}
                    />
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

      {/* ── Pin preview bottom sheet ── */}
      {showBottomSheet && selectedNote && (
        <>
          {/* Scrim — tap to dismiss */}
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={handleDismiss}
          />
          <Animated.View
            style={[
              styles.bottomSheet,
              { paddingBottom: insets.bottom + 16 },
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            {/* Drag handle */}
            <View style={styles.dragHandle} />

            {/* Content row: thumbnail + meta */}
            <View style={styles.sheetRow}>
              {/* Thumbnail */}
              {selectedNote.images && selectedNote.images.length > 0 ? (
                <Image
                  source={{ uri: selectedNote.images[0] }}
                  style={styles.sheetThumb}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.sheetThumbFallback}>
                  <Text style={styles.sheetThumbInitials}>
                    {sheetThumbInitials}
                  </Text>
                </View>
              )}

              {/* Meta */}
              <View style={styles.sheetMeta}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {sheetTitle}
                </Text>
                {selectedNote.location ? (
                  <View style={styles.sheetMetaRow}>
                    <IconSymbol name="location.fill" size={12} color={colors.primary} />
                    <Text style={styles.sheetLocation} numberOfLines={1}>
                      {selectedNote.location}
                    </Text>
                  </View>
                ) : null}
                <TimeAgo date={selectedNote.created_at} style={styles.sheetDate} />
              </View>

              {/* Dismiss X */}
              <Pressable onPress={handleDismiss} style={styles.sheetDismiss} hitSlop={12}>
                <IconSymbol name="xmark" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>

            {/* Body text preview */}
            {sheetBody ? (
              <Text style={styles.sheetBody} numberOfLines={2}>
                {sheetBody}
              </Text>
            ) : null}

            {/* CTA */}
            <Pressable
              style={styles.sheetButton}
              onPress={() => {
                console.log('[MapView] Open Recall pressed, note id:', selectedNote.id);
                setFullRecallVisible(true);
              }}
            >
              <Text style={styles.sheetButtonText}>Open Recall</Text>
              <IconSymbol name="arrow.right" size={18} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        </>
      )}

      {/* ── Full recall modal ── */}
      <Modal
        visible={fullRecallVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          console.log('[MapView] Full recall modal closed');
          setFullRecallVisible(false);
        }}
      >
        <View style={styles.fullRecallModal}>
          {/* Header */}
          <View style={styles.fullRecallHeader}>
            <Text style={styles.fullRecallTitle}>Recall</Text>
            <Pressable
              onPress={() => {
                console.log('[MapView] Full recall modal close button pressed');
                setFullRecallVisible(false);
              }}
              style={styles.fullRecallClose}
            >
              <IconSymbol name="xmark.circle.fill" size={28} color={colors.textTertiary} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.fullRecallScroll}
            contentContainerStyle={styles.fullRecallContent}
          >
            {selectedNote && (
              <GestureHandlerRootView>
                <NoteCard
                  note={selectedNote}
                  onPress={() => {}}
                />
              </GestureHandlerRootView>
            )}
          </ScrollView>
        </View>
      </Modal>
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
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#2A2A2A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#555555',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  sheetThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#1F1F1F',
  },
  sheetThumbFallback: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 122, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetThumbInitials: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FF6B7A',
  },
  sheetMeta: {
    flex: 1,
    gap: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sheetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sheetLocation: {
    fontSize: 13,
    color: '#B0B0B0',
    flex: 1,
  },
  sheetDate: {
    fontSize: 12,
    color: '#808080',
  },
  sheetDismiss: {
    padding: 4,
    alignSelf: 'flex-start',
  },
  sheetBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#B0B0B0',
    marginBottom: 16,
  },
  sheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF6B7A',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  sheetButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  fullRecallModal: {
    flex: 1,
    backgroundColor: '#1A1A1A',
  },
  fullRecallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3A',
  },
  fullRecallTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fullRecallClose: {
    padding: 4,
  },
  fullRecallScroll: {
    flex: 1,
  },
  fullRecallContent: {
    padding: 16,
    paddingBottom: 40,
  },
});
