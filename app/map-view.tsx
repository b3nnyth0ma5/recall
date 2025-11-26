
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
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useNotes } from '@/hooks/useNotes';
import { Note } from '@/types/Note';
import * as Haptics from 'expo-haptics';

export default function MapViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { notes, searchQuery } = useNotes();
  const [loading, setLoading] = useState(true);
  const [mapNotes, setMapNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  // Determine if we're showing search results or all notes
  const hasSearchResults = params.hasSearch === 'true';

  // Filter notes that have location data
  useEffect(() => {
    const notesWithLocation = notes.filter(
      note => note.latitude && note.longitude
    );
    setMapNotes(notesWithLocation);
    setLoading(false);
  }, [notes]);

  // Initialize Google Map
  const initializeMap = useCallback(() => {
    if (Platform.OS !== 'web' || !window.google) return;

    const mapElement = document.getElementById('google-map');
    if (!mapElement) return;

    // Calculate center and zoom based on notes
    let center = { lat: -37.8136, lng: 144.9631 }; // Default: Melbourne
    let zoom = 12;

    if (mapNotes.length > 0) {
      // Calculate bounds to fit all markers
      const bounds = new window.google.maps.LatLngBounds();
      mapNotes.forEach(note => {
        if (note.latitude && note.longitude) {
          bounds.extend({ lat: note.latitude, lng: note.longitude });
        }
      });

      // Create map
      const map = new window.google.maps.Map(mapElement, {
        center: bounds.getCenter(),
        zoom: 12,
        styles: [
          {
            elementType: 'geometry',
            stylers: [{ color: '#242424' }],
          },
          {
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#1A1A1A' }],
          },
          {
            elementType: 'labels.text.fill',
            stylers: [{ color: '#B0B0B0' }],
          },
          {
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#FFFFFF' }],
          },
          {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#B0B0B0' }],
          },
          {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{ color: '#2A3A2A' }],
          },
          {
            featureType: 'poi.park',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#6B9A6B' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#3A3A3A' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#2A2A2A' }],
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry',
            stylers: [{ color: '#4A4A4A' }],
          },
          {
            featureType: 'road.highway',
            elementType: 'geometry.stroke',
            stylers: [{ color: '#3A3A3A' }],
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#1A2A3A' }],
          },
          {
            featureType: 'water',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#4A6A8A' }],
          },
        ],
      });

      mapRef.current = map;

      // Fit bounds after map is loaded
      map.fitBounds(bounds);

      // Add markers
      addMarkers(map);
    } else {
      // No notes with location, show default map
      const map = new window.google.maps.Map(mapElement, {
        center,
        zoom,
        styles: [
          {
            elementType: 'geometry',
            stylers: [{ color: '#242424' }],
          },
          {
            elementType: 'labels.text.stroke',
            stylers: [{ color: '#1A1A1A' }],
          },
          {
            elementType: 'labels.text.fill',
            stylers: [{ color: '#B0B0B0' }],
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#1A2A3A' }],
          },
        ],
      });

      mapRef.current = map;
    }

    setLoading(false);
  }, [mapNotes]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setLoading(false);
      return;
    }

    // Load Google Maps script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyBWBDKiE0TRgWvmXtKcsgD_VgE2Xe68y48&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = initializeMap;
    document.head.appendChild(script);

    return () => {
      // Cleanup
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [initializeMap]);

  // Add markers to map
  const addMarkers = useCallback((map: any) => {
    if (Platform.OS !== 'web' || !window.google) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const handleMarkerClick = (note: Note) => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      setSelectedNote(note);
      setShowPreview(true);
    };

    mapNotes.forEach(note => {
      if (!note.latitude || !note.longitude) return;

      // Create custom marker with preview
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

      // Add preview content
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

      // Create custom overlay
      class CustomMarker extends window.google.maps.OverlayView {
        position: any;
        div: any;

        constructor(position: any, div: any) {
          super();
          this.position = position;
          this.div = div;
        }

        onAdd() {
          const panes = this.getPanes();
          panes.overlayMouseTarget.appendChild(this.div);

          // Add click listener
          this.div.addEventListener('click', () => {
            handleMarkerClick(note);
          });
        }

        draw() {
          const overlayProjection = this.getProjection();
          const position = overlayProjection.fromLatLngToDivPixel(this.position);
          
          if (position) {
            this.div.style.left = (position.x - 24) + 'px';
            this.div.style.top = (position.y - 24) + 'px';
            this.div.style.position = 'absolute';
          }
        }

        onRemove() {
          if (this.div.parentNode) {
            this.div.parentNode.removeChild(this.div);
          }
        }
      }

      const marker = new CustomMarker(
        { lat: note.latitude, lng: note.longitude },
        markerDiv
      );

      marker.setMap(map);
      markersRef.current.push(marker);
    });
  }, [mapNotes]);

  // Re-add markers when mapNotes changes
  useEffect(() => {
    if (mapRef.current && Platform.OS === 'web') {
      addMarkers(mapRef.current);
    }
  }, [mapNotes, addMarkers]);

  const handlePreviewPress = () => {
    if (selectedNote) {
      setShowPreview(false);
      router.push(`/note-editor?id=${selectedNote.id}`);
    }
  };

  const handleBackToSearch = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.back();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: hasSearchResults ? 'Search Results Map' : 'Recalls Map',
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

              {/* Info Badge */}
              <View style={styles.infoBadge}>
                <IconSymbol name="map.fill" size={16} color={colors.primary} />
                <Text style={styles.infoBadgeText}>
                  {mapNotes.length} {mapNotes.length === 1 ? 'recall' : 'recalls'} on map
                </Text>
              </View>

              {/* Back to Search List FAB */}
              <Pressable onPress={handleBackToSearch} style={styles.fab}>
                <IconSymbol name="list.bullet" size={24} color="#FFFFFF" />
              </Pressable>
            </React.Fragment>
          )}

          {/* Note Preview Modal */}
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

                    <Pressable
                      onPress={handlePreviewPress}
                      style={styles.openButton}
                    >
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
        <View style={styles.notSupportedContainer}>
          <IconSymbol name="map" size={80} color={colors.textTertiary} />
          <Text style={styles.notSupportedTitle}>Map View coming soon...</Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back to Search</Text>
          </Pressable>
        </View>
      )}
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
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3)',
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
  notSupportedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  notSupportedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  notSupportedText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
