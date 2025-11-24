
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, triggerOCRProcessing } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface UnprocessedImage {
  id: string;
  recall_id: string;
  created_at: string;
  cdn_url: string | null;
}

/**
 * Admin utility to process unprocessed images
 * This screen allows manually triggering OCR processing for images that were not processed
 */
export default function AdminProcessImagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [unprocessedImages, setUnprocessedImages] = useState<UnprocessedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, { success: boolean; error?: string }>>(new Map());

  const loadUnprocessedImages = useCallback(async () => {
    if (!user) {
      console.log('No user logged in');
      return;
    }

    setLoading(true);
    try {
      console.log('Loading unprocessed images...');
      
      const { data, error } = await supabase
        .from('recall_images')
        .select('id, recall_id, created_at, cdn_url')
        .eq('user_id', user.id)
        .is('processed_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading unprocessed images:', error);
        return;
      }

      console.log(`Found ${data?.length || 0} unprocessed images`);
      setUnprocessedImages(data || []);
    } catch (error) {
      console.error('Exception loading unprocessed images:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const processImage = async (imageId: string) => {
    console.log('Processing image:', imageId);
    
    setProcessing(prev => new Set(prev).add(imageId));
    
    try {
      const result = await triggerOCRProcessing(imageId);
      
      setResults(prev => new Map(prev).set(imageId, result));
      
      if (result.success) {
        console.log('Image processed successfully:', imageId);
        // Remove from unprocessed list after a delay
        setTimeout(() => {
          setUnprocessedImages(prev => prev.filter(img => img.id !== imageId));
        }, 2000);
      } else {
        console.error('Failed to process image:', imageId, result.error);
      }
    } catch (error) {
      console.error('Exception processing image:', imageId, error);
      setResults(prev => new Map(prev).set(imageId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    } finally {
      setProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(imageId);
        return newSet;
      });
    }
  };

  const processAllImages = async () => {
    console.log('Processing all unprocessed images...');
    
    for (const image of unprocessedImages) {
      await processImage(image.id);
      // Add a small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('All images processed');
  };

  React.useEffect(() => {
    loadUnprocessedImages();
  }, [loadUnprocessedImages]);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Process Unprocessed Images',
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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Unprocessed Images</Text>
          <Text style={styles.subtitle}>
            {unprocessedImages.length} image{unprocessedImages.length !== 1 ? 's' : ''} need processing
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading unprocessed images...</Text>
          </View>
        ) : (
          <React.Fragment>
            {unprocessedImages.length > 0 && (
              <View style={styles.actionsContainer}>
                <Pressable
                  style={styles.processAllButton}
                  onPress={processAllImages}
                  disabled={processing.size > 0}
                >
                  <IconSymbol name="play.fill" size={20} color="#FFFFFF" />
                  <Text style={styles.processAllButtonText}>Process All Images</Text>
                </Pressable>
                
                <Pressable
                  style={styles.refreshButton}
                  onPress={loadUnprocessedImages}
                  disabled={loading}
                >
                  <IconSymbol name="arrow.clockwise" size={20} color={colors.primary} />
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </Pressable>
              </View>
            )}

            {unprocessedImages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol name="checkmark.circle.fill" size={64} color={colors.success} />
                <Text style={styles.emptyTitle}>All Images Processed!</Text>
                <Text style={styles.emptySubtitle}>
                  There are no unprocessed images at the moment.
                </Text>
              </View>
            ) : (
              <View style={styles.imagesList}>
                {unprocessedImages.map((image, index) => {
                  const isProcessing = processing.has(image.id);
                  const result = results.get(image.id);
                  
                  return (
                    <View key={image.id} style={styles.imageCard}>
                      <View style={styles.imageCardHeader}>
                        <View style={styles.imageCardInfo}>
                          <Text style={styles.imageCardTitle}>Image {index + 1}</Text>
                          <Text style={styles.imageCardSubtitle}>
                            Created: {new Date(image.created_at).toLocaleString()}
                          </Text>
                          <Text style={styles.imageCardId} numberOfLines={1}>
                            ID: {image.id}
                          </Text>
                          {!image.cdn_url && (
                            <Text style={styles.warningText}>⚠️ No CDN URL</Text>
                          )}
                        </View>
                        
                        {isProcessing ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : result ? (
                          result.success ? (
                            <IconSymbol name="checkmark.circle.fill" size={24} color={colors.success} />
                          ) : (
                            <IconSymbol name="xmark.circle.fill" size={24} color={colors.error} />
                          )
                        ) : (
                          <Pressable
                            style={styles.processButton}
                            onPress={() => processImage(image.id)}
                          >
                            <IconSymbol name="play.fill" size={16} color="#FFFFFF" />
                          </Pressable>
                        )}
                      </View>
                      
                      {result && !result.success && (
                        <View style={styles.errorContainer}>
                          <Text style={styles.errorText}>{result.error}</Text>
                        </View>
                      )}
                      
                      {result && result.success && (
                        <View style={styles.successContainer}>
                          <Text style={styles.successText}>✓ Processing triggered successfully</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </React.Fragment>
        )}
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  processAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  processAllButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  imagesList: {
    gap: 12,
  },
  imageCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  imageCardInfo: {
    flex: 1,
    marginRight: 12,
  },
  imageCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  imageCardSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  imageCardId: {
    fontSize: 12,
    color: colors.textTertiary,
    fontFamily: 'monospace',
  },
  warningText: {
    fontSize: 12,
    color: colors.warning,
    marginTop: 4,
  },
  processButton: {
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.errorLight,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
  },
  successContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.successLight,
    borderRadius: 8,
  },
  successText: {
    fontSize: 14,
    color: colors.success,
  },
});
