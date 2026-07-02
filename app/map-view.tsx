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
import { useNotesContext } from '@/contexts/NotesContext';

// ─── Leaflet HTML builder ─────────────────────────────────────────────────────

type MapNote = {
  id: string;
  latitude: number;
  longitude: number;
  text: string;
  imageUrl: string | null;
};

function buildMapHtml(): string {
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
    var map = L.map('map', {
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      minZoom: 2,
      maxZoom: 19,
    }).setView([20, 0], 2);

    // Reliable mobile double-tap-to-zoom. Leaflet's built-in doubleClickZoom
    // can be flaky in mobile WebViews because the WebView may swallow the
    // dblclick event. We track tap timing manually and zoom into the tap point
    // when two clicks arrive within 300ms at roughly the same screen position.
    var lastClickTime = 0;
    var lastClickPos = null;
    map.on('click', function(e) {
      var now = Date.now();
      if (lastClickTime && (now - lastClickTime) < 300 && lastClickPos &&
          Math.abs(lastClickPos.x - e.containerPoint.x) < 30 &&
          Math.abs(lastClickPos.y - e.containerPoint.y) < 30) {
        map.setZoomAround(e.latlng, map.getZoom() + 1);
        lastClickTime = 0;
        lastClickPos = null;
      } else {
        lastClickTime = now;
        lastClickPos = e.containerPoint;
      }
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);

    var recallMarkers = [];
    var userDotMarker = null;

    // Called after data loads to render all pins
    window.updateMarkers = function(notesData) {
      recallMarkers.forEach(function(m) { map.removeLayer(m); });
      recallMarkers = [];

      notesData.forEach(function(note) {
        var html;
        if (note.imageUrl) {
          html = '<div class="recall-pin"><img src="' + note.imageUrl + '" /></div>';
        } else {
          var initials = note.text ? note.text.substring(0, 2) : '??';
          html = '<div class="recall-pin"><span class="pin-text">' + initials + '</span></div>';
        }
        var icon = L.divIcon({ html: html, className: '', iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -24] });
        var marker = L.marker([note.latitude, note.longitude], { icon: icon }).addTo(map);
        marker.on('click', function() {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerPress', noteId: note.id }));
          }
        });
        recallMarkers.push(marker);
      });
    };

    // Called when user location is known
    window.updateUserLocation = function(lat, lng) {
      if (userDotMarker) { map.removeLayer(userDotMarker); }
      var dotIcon = L.divIcon({ html: '<div class="user-dot"></div>', className: '', iconSize: [16, 16], iconAnchor: [8, 8] });
      userDotMarker = L.marker([lat, lng], { icon: dotIcon }).addTo(map);
    };

    // Called from React Native to center the map on a specific lat/lng at a given zoom.
    window.centerOnLocation = function(lat, lng, zoom) {
      map.setView([lat, lng], zoom);
    };

    // fitToMarkers: called from React Native after data loads in search mode
    window.fitToMarkers = function() {
      if (recallMarkers.length === 0) return;
      var latlngs = recallMarkers.map(function(m) { return m.getLatLng(); });
      var bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [80, 50] });
    };

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
  const { getUrlMetadataForRecall } = useNotesContext();
  const [loading, setLoading] = useState(true);
  const [mapNotes, setMapNotes] = useState<Note[]>([]);
  const [allLocationNotes, setAllLocationNotes] = useState<Note[]>([]);
  const [visibleNotes, setVisibleNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const webViewRef = useRef<WebView>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const pendingMapData = useRef<MapNote[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const overlayOpacity = useRef(new Animated.Value(1)).current;

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

  // Inject user location dot whenever location resolves and WebView is ready
  useEffect(() => {
    if (!userLocation || !webViewReady) return;
    if (__DEV__) console.log('[MapView] Injecting user location into WebView', userLocation);
    webViewRef.current?.injectJavaScript(
      `window.updateUserLocation(${userLocation.latitude}, ${userLocation.longitude}); true;`
    );
  }, [userLocation, webViewReady]);

  // In "view all" mode, center the map on the user's current location once
  // it's available. Search mode uses fitToMarkers instead.
  useEffect(() => {
    if (searchIds.length > 0) return;          // only in view-all mode
    if (!userLocation || !webViewReady) return;
    if (__DEV__) console.log('[MapView] Centering on user location for view-all mode', userLocation);
    webViewRef.current?.injectJavaScript(
      `window.centerOnLocation(${userLocation.latitude}, ${userLocation.longitude}, 13); true;`,
    );
  }, [userLocation, webViewReady, searchIds.length]);

  useEffect(() => {
    if (searchIds.length === 0 && !user?.id) return;

    async function loadNotes() {
      setLoading(true);

      const injectMarkers = (notesWithImages: Note[]) => {
        const mapData: MapNote[] = notesWithImages.map(n => ({
          id: n.id,
          latitude: n.latitude as number,
          longitude: n.longitude as number,
          text: n.text ? n.text.substring(0, 2) : '??',
          imageUrl: n.images && n.images.length > 0 ? n.images[0] : null,
        }));
        if (webViewRef.current && webViewReady) {
          if (__DEV__) console.log('[MapView] Injecting', mapData.length, 'markers into WebView');
          webViewRef.current.injectJavaScript(`window.updateMarkers(${JSON.stringify(mapData)}); true;`);
          // Signal map is ready after a short delay to let tiles start rendering
          setTimeout(() => handleMapReady(), 600);
        } else {
          if (__DEV__) console.log('[MapView] WebView not ready, queuing', mapData.length, 'markers');
          pendingMapData.current = mapData;
        }
      };

      if (searchIds.length > 0) {
        if (__DEV__) console.log('[MapView] Fetching', searchIds.length, 'search result recalls by ID (joined)');
        const { data, error } = await supabase
          .from('recalls')
          .select('id, text, latitude, longitude, location, created_at, recall_images(cdn_url)')
          .in('id', searchIds)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null);
        if (error) {
          console.error('[MapView] Error fetching search recalls:', error);
        } else {
          const notesWithImages = ((data ?? []) as any[])
            .filter(n => n.latitude != null && n.longitude != null)
            .map(n => {
              const imageUrl = (n.recall_images?.[0] as any)?.cdn_url ?? null;
              const images = imageUrl ? [imageUrl] : [];
              return { ...n, images } as Note;
            });
          if (__DEV__) console.log('[MapView] Loaded', notesWithImages.length, 'search recalls with location');
          setMapNotes(notesWithImages);
          injectMarkers(notesWithImages);
        }
      } else {
        if (__DEV__) console.log('[MapView] Fetching all location recalls for user', user!.id, '(joined)');
        const { data, error } = await supabase
          .from('recalls')
          .select('id, text, latitude, longitude, location, created_at, recall_images(cdn_url)')
          .eq('user_id', user!.id)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('created_at', { ascending: false });
        if (error) {
          console.error('[MapView] Error fetching all location recalls:', error);
        } else {
          const notesWithImages = ((data ?? []) as any[])
            .filter(n => n.latitude != null && n.longitude != null)
            .map(n => {
              const imageUrl = (n.recall_images?.[0] as any)?.cdn_url ?? null;
              const images = imageUrl ? [imageUrl] : [];
              return { ...n, images } as Note;
            });
          if (__DEV__) console.log('[MapView] Loaded', notesWithImages.length, 'total recalls with location');
          setAllLocationNotes(notesWithImages);
          setMapNotes(notesWithImages);
          setVisibleNotes(notesWithImages);
          injectMarkers(notesWithImages);
        }
      }
      setLoading(false);
    }
    loadNotes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, searchIds, handleMapReady]);

  // After search-mode data loads, fit the map to all markers
  useEffect(() => {
    if (searchIds.length === 0 || mapNotes.length === 0 || !webViewReady) return;
    const timer = setTimeout(() => {
      if (__DEV__) console.log('[MapView] Injecting fitToMarkers for', mapNotes.length, 'search pins');
      webViewRef.current?.injectJavaScript('window.fitToMarkers(); true;');
    }, 500);
    return () => clearTimeout(timer);
  }, [mapNotes, searchIds, webViewReady]);

  const handleMapReady = useCallback(() => {
    if (mapReady) return;
    if (__DEV__) console.log('[MapView] Map ready — fading in');
    setMapReady(true);
    Animated.timing(overlayOpacity, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [mapReady, overlayOpacity]);

  // When WebView becomes ready, flush any pending marker data
  const handleWebViewLoad = useCallback(() => {
    if (__DEV__) console.log('[MapView] WebView loaded and ready');
    setWebViewReady(true);
    if (pendingMapData.current) {
      const mapData = pendingMapData.current;
      pendingMapData.current = null;
      if (__DEV__) console.log('[MapView] Flushing', mapData.length, 'pending markers into WebView');
      webViewRef.current?.injectJavaScript(`window.updateMarkers(${JSON.stringify(mapData)}); true;`);
      setTimeout(() => handleMapReady(), 600);
    } else {
      // No pending markers — map is ready after a short delay
      setTimeout(() => handleMapReady(), 400);
    }
  }, [handleMapReady]);

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
        if (searchIds.length > 0) return;
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

  const mapCountText = searchIds.length > 0
    ? `${mapNotes.length} of ${searchIds.length} recalls on map`
    : `${visibleNotes.length} visible · ${allLocationNotes.length} total`;
  const headerTitle = hasSearchResults ? 'Search Results Map' : 'Recalls Map';

  const sheetThumbInitials = selectedNote?.text
    ? selectedNote.text.substring(0, 2).toUpperCase()
    : '??';
  const sheetTitle = selectedNote?.text
    ? selectedNote.text.replace(/\n/g, ' ').substring(0, 60)
    : 'Recall';
  const sheetBody = selectedNote?.text ?? null;

  const mapHtml = useMemo(() => buildMapHtml(), []);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <Pressable
        onPress={() => {
          console.log('[MapView] Floating back button pressed');
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          router.back();
        }}
        style={[styles.floatingBackButton, { top: insets.top + 8 }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <IconSymbol name="chevron.left" size={22} color={colors.text} />
      </Pressable>

      {/* WebView always renders so it loads in background */}
      {!loading && mapNotes.length > 0 && (
        <>
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            style={styles.map}
            onMessage={handleWebViewMessage}
            onLoad={handleWebViewLoad}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            geolocationEnabled={true}
            startInLoadingState={false}
          />
          <View style={styles.infoBadge}>
            <IconSymbol name="map.fill" size={16} color={colors.primary} />
            <Text style={styles.infoBadgeText}>{mapCountText}</Text>
          </View>
        </>
      )}

      {/* Empty state */}
      {!loading && mapNotes.length === 0 && (
        <View style={styles.emptyContainer}>
          <IconSymbol name="map" size={80} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No Locations Found</Text>
          <Text style={styles.emptyText}>
            {hasSearchResults
              ? 'No search results have location data'
              : 'Add location data to your recalls to see them on the map'}
          </Text>
        </View>
      )}

      {/* Loading overlay — fades out when map is ready */}
      {(!mapReady || loading) && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            styles.loadingOverlay,
            { opacity: loading ? 1 : overlayOpacity },
          ]}
          pointerEvents={mapReady ? 'none' : 'auto'}
        >
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading map...</Text>
        </Animated.View>
      )}

      {showBottomSheet && selectedNote && (
        <>
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
            <View style={styles.dragHandle} />

            <View style={styles.sheetRow}>
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

              <Pressable onPress={handleDismiss} style={styles.sheetDismiss} hitSlop={12}>
                <IconSymbol name="xmark" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>

            {sheetBody ? (
              <Text style={styles.sheetBody} numberOfLines={2}>
                {sheetBody}
              </Text>
            ) : null}

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
                  urlMeta={getUrlMetadataForRecall(selectedNote.id)}
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
  container: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1 },
  floatingBackButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.25)',
    elevation: 4,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingOverlay: {
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    gap: 16,
  },
  loadingText: { fontSize: 16, color: colors.textSecondary },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 16, color: colors.textSecondary, textAlign: 'center' },
  infoBadge: { position: 'absolute', top: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, elevation: 4 },
  infoBadgeText: { fontSize: 14, fontWeight: '600', color: colors.text },
  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#2A2A2A', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, boxShadow: '0px -4px 20px rgba(0,0,0,0.5)', elevation: 20 },
  dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#555555', alignSelf: 'center', marginBottom: 16 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  sheetThumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#1F1F1F' },
  sheetThumbFallback: { width: 72, height: 72, borderRadius: 10, backgroundColor: 'rgba(255, 107, 122, 0.15)', justifyContent: 'center', alignItems: 'center' },
  sheetThumbInitials: { fontSize: 22, fontWeight: '700', color: '#FF6B7A' },
  sheetMeta: { flex: 1, gap: 4 },
  sheetTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  sheetMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetLocation: { fontSize: 13, color: '#B0B0B0', flex: 1 },
  sheetDate: { fontSize: 12, color: '#808080' },
  sheetDismiss: { padding: 4, alignSelf: 'flex-start' },
  sheetBody: { fontSize: 14, lineHeight: 20, color: '#B0B0B0', marginBottom: 16 },
  sheetButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF6B7A', paddingVertical: 14, borderRadius: 12, marginBottom: 4 },
  sheetButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  fullRecallModal: { flex: 1, backgroundColor: '#1A1A1A' },
  fullRecallHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#3A3A3A' },
  fullRecallTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  fullRecallClose: { padding: 4 },
  fullRecallScroll: { flex: 1 },
  fullRecallContent: { padding: 16, paddingBottom: 40 },
});
