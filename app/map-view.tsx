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
import { WebView } from 'react-native-webview';
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

// ─── Leaflet HTML builder ─────────────────────────────────────────────────────

type MapNote = {
  id: string;
  latitude: number;
  longitude: number;
  text: string;
  imageUrl: string | null;
};

function buildMapHtml(
  notes: MapNote[],
  userLocation: { latitude: number; longitude: number } | null
): string {
  const notesJson = JSON.stringify(notes);
  const centerLat = userLocation ? userLocation.latitude : 20;
  const centerLng = userLocation ? userLocation.longitude : 0;
  const initialZoom = userLocation ? 13 : 2;

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1A1A1A; }
    #map { height: 100vh; width: 100vw; }
    .recall-pin {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #FF6B7A;
      border: 1px solid #FFFFFF;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      overflow: hidden;
      position: relative;
    }
    .recall-pin img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .recall-pin .pin-text {
      color: #FFFFFF;
      font-size: 13px;
      font-weight: bold;
      text-align: center;
      line-height: 1;
    }
    .user-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #4A90E2;
      border: 3px solid #FFFFFF;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], ${initialZoom});

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);

    var notesData = ${notesJson};

    notesData.forEach(function(note) {
      var html;
      if (note.imageUrl) {
        html = '<div class="recall-pin"><img src="' + note.imageUrl + '" /></div>';
      } else {
        var initials = note.text ? note.text.substring(0, 2) : '??';
        html = '<div class="recall-pin"><span class="pin-text">' + initials + '</span></div>';
      }

      var icon = L.divIcon({
        html: html,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -24]
      });

      var marker = L.marker([note.latitude, note.longitude], { icon: icon }).addTo(map);
      marker.on('click', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', noteId: note.id }));
        }
      });
    });

    // Viewport change reporting
    map.on('moveend', function() {
      var b = map.getBounds();
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'boundsChange',
          bounds: {
            minLat: b.getSouth(),
            maxLat: b.getNorth(),
            minLng: b.getWest(),
            maxLng: b.getEast()
          }
        }));
      }
    });

    // fitToMarkers: called from React Native after data loads in search mode
    window.fitToMarkers = function() {
      if (notesData.length === 0) return;
      var latlngs = notesData.map(function(n) { return [n.latitude, n.longitude]; });
      var bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [80, 50] });
    };

    // User location blue dot
    map.locate({ watch: false, setView: false });
    map.on('locationfound', function(e) {
      var dotIcon = L.divIcon({
        html: '<div class="user-dot"></div>',
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });
      L.marker(e.latlng, { icon: dotIcon }).addTo(map);
    });
  </script>
</body>
</html>`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

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
  const webViewRef = useRef<WebView>(null);

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

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

  useEffect(() => {
    if (searchIds.length === 0 && !user?.id) return;

    async function loadNotes() {
      setLoading(true);
      if (searchIds.length > 0) {
        if (__DEV__) console.log('[MapView] Fetching', searchIds.length, 'search result recalls by ID');
        const { data, error } = await supabase
          .from('recalls')
          .select('id, text, latitude, longitude, location, created_at')
          .in('id', searchIds)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);
        if (error) {
          console.error('[MapView] Error fetching search recalls:', error);
        } else {
          const valid = ((data ?? []) as any[]).filter(
            (n) => n.latitude != null && n.longitude != null
          ) as Note[];
          if (__DEV__) console.log('[MapView] Loaded', valid.length, 'search recalls with location');

          const recallIds = valid.map(n => n.id);
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('recall_id, cdn_url')
            .in('recall_id', recallIds);
          console.log('[MapView] Fetched images for search recalls, count:', (imagesData ?? []).length);

          const imageMap = new Map<string, string>();
          (imagesData ?? []).forEach((img: any) => {
            if (!imageMap.has(img.recall_id) && img.cdn_url) {
              imageMap.set(img.recall_id, img.cdn_url);
            }
          });

          const notesWithImages = valid.map(n => ({
            ...n,
            images: imageMap.has(n.id) ? [imageMap.get(n.id)!] : [],
          }));
          setMapNotes(notesWithImages as Note[]);
        }
      } else {
        if (__DEV__) console.log('[MapView] Fetching all location recalls for user', user!.id);
        const { data, error } = await supabase
          .from('recalls')
          .select('id, text, latitude, longitude, location, created_at')
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
          if (__DEV__) console.log('[MapView] Loaded', valid.length, 'total recalls with location');

          const recallIds = valid.map(n => n.id);
          const { data: imagesData } = await supabase
            .from('recall_images')
            .select('recall_id, cdn_url')
            .in('recall_id', recallIds);
          console.log('[MapView] Fetched images for browse recalls, count:', (imagesData ?? []).length);

          const imageMap = new Map<string, string>();
          (imagesData ?? []).forEach((img: any) => {
            if (!imageMap.has(img.recall_id) && img.cdn_url) {
              imageMap.set(img.recall_id, img.cdn_url);
            }
          });

          const notesWithImages = valid.map(n => ({
            ...n,
            images: imageMap.has(n.id) ? [imageMap.get(n.id)!] : [],
          }));
          setAllLocationNotes(notesWithImages as Note[]);
          setMapNotes(notesWithImages as Note[]);
          setVisibleNotes(notesWithImages as Note[]);
        }
      }
      setLoading(false);
    }
    loadNotes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, searchIds]);

  // After search-mode data loads, fit the map to all markers
  useEffect(() => {
    if (searchIds.length === 0 || mapNotes.length === 0) return;
    const timer = setTimeout(() => {
      if (__DEV__) console.log('[MapView] Injecting fitToMarkers for', mapNotes.length, 'search pins');
      webViewRef.current?.injectJavaScript('window.fitToMarkers(); true;');
    }, 500);
    return () => clearTimeout(timer);
  }, [mapNotes, searchIds]);

  // ─── WebView message handler ──────────────────────────────────────────────

  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'markerPress') {
        const note = mapNotes.find(n => n.id === msg.noteId);
        if (note) {
          if (__DEV__) console.log('[MapView] Marker pressed via WebView, note id:', note.id);
          handleMarkerPress(note);
        }
      } else if (msg.type === 'boundsChange') {
        if (searchIds.length > 0) return; // search mode — no filtering
        const { minLat, maxLat, minLng, maxLng } = msg.bounds;
        const visible = allLocationNotes.filter(
          n =>
            n.latitude! >= minLat &&
            n.latitude! <= maxLat &&
            n.longitude! >= minLng &&
            n.longitude! <= maxLng
        );
        if (__DEV__) console.log('[MapView] Bounds changed — visible pins:', visible.length, 'of', allLocationNotes.length);
        setVisibleNotes(visible);
      }
    } catch (e) {
      console.error('[MapView] Failed to parse WebView message:', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapNotes, allLocationNotes, searchIds]);

  // ─── Marker press / bottom sheet ─────────────────────────────────────────

  const handleMarkerPress = useCallback((note: Note) => {
    if (__DEV__) console.log('[MapView] Marker pressed, note id:', note.id);
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
    if (__DEV__) console.log('[MapView] Bottom sheet dismissed');
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setShowBottomSheet(false);
      setSelectedNote(null);
    });
  }, [slideAnim]);

  const handleBackToSearch = () => {
    if (__DEV__) console.log('[MapView] Back to list pressed');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.back();
  };

  // ─── Derived values ───────────────────────────────────────────────────────

  const mapCountText = searchIds.length > 0
    ? `${mapNotes.length} of ${searchIds.length} recalls on map`
    : `${visibleNotes.length} visible · ${allLocationNotes.length} total`;
  const fabBottom = insets.bottom + 24;
  const headerTitle = hasSearchResults ? 'Search Results Map' : 'Recalls Map';

  const sheetThumbInitials = selectedNote?.text
    ? selectedNote.text.substring(0, 2).toUpperCase()
    : '??';
  const sheetTitle = selectedNote?.text
    ? selectedNote.text.replace(/\n/g, ' ').substring(0, 60)
    : 'Recall';
  const sheetBody = selectedNote?.text ?? null;

  // ─── Build Leaflet HTML ───────────────────────────────────────────────────

  const mapHtml = useMemo(() => {
    const notes: MapNote[] = mapNotes
      .filter(n => n.latitude != null && n.longitude != null)
      .map(n => ({
        id: n.id,
        latitude: n.latitude as number,
        longitude: n.longitude as number,
        text: n.text ? n.text.substring(0, 2) : '??',
        imageUrl: n.images && n.images.length > 0 ? n.images[0] : null,
      }));
    return buildMapHtml(notes, userLocation);
  }, [mapNotes, userLocation]);

  // ─── Render ───────────────────────────────────────────────────────────────

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
        <>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            style={styles.map}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            geolocationEnabled={true}
            startInLoadingState={false}
          />

          {/* Info Badge */}
          <View style={styles.infoBadge}>
            <IconSymbol name="map.fill" size={16} color={colors.primary} />
            <Text style={styles.infoBadgeText}>{mapCountText}</Text>
          </View>

          {/* FAB — back to list */}
          <Pressable
            onPress={handleBackToSearch}
            style={[styles.fab, { bottom: fabBottom }]}
          >
            <IconSymbol name="list.bullet" size={24} color="#FFFFFF" />
          </Pressable>
        </>
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
                if (__DEV__) console.log('[MapView] Open Recall pressed, note id:', selectedNote.id);
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
          if (__DEV__) console.log('[MapView] Full recall modal closed');
          setFullRecallVisible(false);
        }}
      >
        <View style={styles.fullRecallModal}>
          {/* Header */}
          <View style={styles.fullRecallHeader}>
            <Text style={styles.fullRecallTitle}>Recall</Text>
            <Pressable
              onPress={() => {
                if (__DEV__) console.log('[MapView] Full recall modal close button pressed');
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
