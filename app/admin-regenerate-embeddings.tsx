
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

interface EmbeddingStats {
  totalRecalls: number;
  recallsWithEmbeddings: number;
  recallsWithoutEmbeddings: number;
  totalImages: number;
  imagesWithEmbeddings: number;
  imagesWithoutEmbeddings: number;
}

interface ProcessingResult {
  type: 'recalls' | 'images' | 'all';
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: string[];
  processingTimeMs: number;
}

export default function AdminRegenerateEmbeddingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<EmbeddingStats | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingType, setProcessingType] = useState<'recalls' | 'images' | 'all' | null>(null);

  useEffect(() => {
    loadStats();
  }, [user, loadStats]);

  const loadStats = async () => {
    if (!user) {
      console.log('No user found, skipping stats load');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Loading embedding statistics for user:', user.id);

      // Fetch recall statistics
      const { count: totalRecalls, error: recallsCountError } = await supabase
        .from('recalls')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (recallsCountError) {
        throw new Error(`Failed to count recalls: ${recallsCountError.message}`);
      }

      const { count: recallsWithEmbeddings, error: recallsWithEmbError } = await supabase
        .from('recalls')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('recall_embedding', 'is', null);

      if (recallsWithEmbError) {
        throw new Error(`Failed to count recalls with embeddings: ${recallsWithEmbError.message}`);
      }

      // Fetch image statistics
      const { count: totalImages, error: imagesCountError } = await supabase
        .from('recall_images')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (imagesCountError) {
        throw new Error(`Failed to count images: ${imagesCountError.message}`);
      }

      const { count: imagesWithEmbeddings, error: imagesWithEmbError } = await supabase
        .from('recall_images')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('recall_image_embedding', 'is', null);

      if (imagesWithEmbError) {
        throw new Error(`Failed to count images with embeddings: ${imagesWithEmbError.message}`);
      }

      const statsData: EmbeddingStats = {
        totalRecalls: totalRecalls || 0,
        recallsWithEmbeddings: recallsWithEmbeddings || 0,
        recallsWithoutEmbeddings: (totalRecalls || 0) - (recallsWithEmbeddings || 0),
        totalImages: totalImages || 0,
        imagesWithEmbeddings: imagesWithEmbeddings || 0,
        imagesWithoutEmbeddings: (totalImages || 0) - (imagesWithEmbeddings || 0),
      };

      console.log('Embedding statistics loaded:', statsData);
      setStats(statsData);
    } catch (err) {
      console.error('Error loading stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateRecallEmbeddings = async () => {
    if (!user) {
      console.error('No user found');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProcessingType('recalls');

    const startTime = Date.now();
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      console.log('=== Starting Recall Embedding Regeneration ===');

      // Fetch all recalls for the user
      const { data: recalls, error: fetchError } = await supabase
        .from('recalls')
        .select('id, text, location, location_primary_type')
        .eq('user_id', user.id);

      if (fetchError) {
        throw new Error(`Failed to fetch recalls: ${fetchError.message}`);
      }

      if (!recalls || recalls.length === 0) {
        console.log('No recalls found for user');
        setResult({
          type: 'recalls',
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          errors: [],
          processingTimeMs: Date.now() - startTime,
        });
        return;
      }

      console.log(`Found ${recalls.length} recalls to process`);

      // Process each recall
      for (let i = 0; i < recalls.length; i++) {
        const recall = recalls[i];
        console.log(`Processing recall ${i + 1}/${recalls.length}: ${recall.id}`);

        try {
          const { error: invokeError } = await supabase.functions.invoke('embedding-recall', {
            body: {
              recall_id: recall.id,
              text: recall.text,
              location: recall.location,
              location_primary_type: recall.location_primary_type,
            },
          });

          if (invokeError) {
            throw new Error(invokeError.message);
          }

          successful++;
          console.log(`✓ Successfully processed recall ${recall.id}`);
        } catch (err) {
          failed++;
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Recall ${recall.id.substring(0, 8)}: ${errorMsg}`);
          console.error(`✗ Failed to process recall ${recall.id}:`, errorMsg);
        }

        // Add a small delay to avoid rate limiting
        if (i < recalls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const processingTime = Date.now() - startTime;
      console.log('=== Recall Embedding Regeneration Complete ===');
      console.log(`Total: ${recalls.length}, Success: ${successful}, Failed: ${failed}`);
      console.log(`Processing time: ${processingTime}ms`);

      setResult({
        type: 'recalls',
        totalProcessed: recalls.length,
        successful,
        failed,
        errors,
        processingTimeMs: processingTime,
      });

      // Reload stats
      await loadStats();
    } catch (err) {
      console.error('Error during recall embedding regeneration:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
      setProcessingType(null);
    }
  };

  const regenerateImageEmbeddings = async () => {
    if (!user) {
      console.error('No user found');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProcessingType('images');

    const startTime = Date.now();
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    try {
      console.log('=== Starting Image Embedding Regeneration ===');

      // Fetch all images for the user
      const { data: images, error: fetchError } = await supabase
        .from('recall_images')
        .select('id, ocr_text, image_explanation')
        .eq('user_id', user.id);

      if (fetchError) {
        throw new Error(`Failed to fetch images: ${fetchError.message}`);
      }

      if (!images || images.length === 0) {
        console.log('No images found for user');
        setResult({
          type: 'images',
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          errors: [],
          processingTimeMs: Date.now() - startTime,
        });
        return;
      }

      console.log(`Found ${images.length} images to process`);

      // First, clear all existing embeddings to force regeneration
      console.log('Clearing existing image embeddings...');
      const { error: clearError } = await supabase
        .from('recall_images')
        .update({ recall_image_embedding: null })
        .eq('user_id', user.id);

      if (clearError) {
        console.error('Failed to clear embeddings:', clearError);
        // Continue anyway
      } else {
        console.log('✓ Cleared all existing image embeddings');
      }

      // Process each image
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        console.log(`Processing image ${i + 1}/${images.length}: ${image.id}`);

        try {
          const { error: invokeError } = await supabase.functions.invoke('embedding-image', {
            body: {
              recall_image_id: image.id,
              ocr_text: image.ocr_text,
              image_explanation: image.image_explanation,
            },
          });

          if (invokeError) {
            throw new Error(invokeError.message);
          }

          successful++;
          console.log(`✓ Successfully processed image ${image.id}`);
        } catch (err) {
          failed++;
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Image ${image.id.substring(0, 8)}: ${errorMsg}`);
          console.error(`✗ Failed to process image ${image.id}:`, errorMsg);
        }

        // Add a small delay to avoid rate limiting
        if (i < images.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const processingTime = Date.now() - startTime;
      console.log('=== Image Embedding Regeneration Complete ===');
      console.log(`Total: ${images.length}, Success: ${successful}, Failed: ${failed}`);
      console.log(`Processing time: ${processingTime}ms`);

      setResult({
        type: 'images',
        totalProcessed: images.length,
        successful,
        failed,
        errors,
        processingTimeMs: processingTime,
      });

      // Reload stats
      await loadStats();
    } catch (err) {
      console.error('Error during image embedding regeneration:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
      setProcessingType(null);
    }
  };

  const regenerateAllEmbeddings = async () => {
    if (!user) {
      console.error('No user found');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProcessingType('all');

    const startTime = Date.now();

    try {
      console.log('=== Starting Full Embedding Regeneration (Recalls + Images) ===');

      // First regenerate recalls
      await regenerateRecallEmbeddings();

      // Then regenerate images
      await regenerateImageEmbeddings();

      const processingTime = Date.now() - startTime;
      console.log('=== Full Embedding Regeneration Complete ===');
      console.log(`Total processing time: ${processingTime}ms`);
    } catch (err) {
      console.error('Error during full embedding regeneration:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
      setProcessingType(null);
    }
  };

  const handleRegenerateRecalls = () => {
    Alert.alert(
      'Regenerate Recall Embeddings',
      `This will regenerate embeddings for all ${stats?.totalRecalls || 0} recalls. This may take several minutes. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: regenerateRecallEmbeddings },
      ]
    );
  };

  const handleRegenerateImages = () => {
    Alert.alert(
      'Regenerate Image Embeddings',
      `This will regenerate embeddings for all ${stats?.totalImages || 0} images. This may take several minutes. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: regenerateImageEmbeddings },
      ]
    );
  };

  const handleRegenerateAll = () => {
    const totalItems = (stats?.totalRecalls || 0) + (stats?.totalImages || 0);
    Alert.alert(
      'Regenerate All Embeddings',
      `This will regenerate embeddings for all ${stats?.totalRecalls || 0} recalls and ${stats?.totalImages || 0} images (${totalItems} total). This may take a long time. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: regenerateAllEmbeddings },
      ]
    );
  };

  const getPercentage = (value: number, total: number) => {
    if (total === 0) {
      return 0;
    }
    const percentageValue = (value / total) * 100;
    return Math.round(percentageValue);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Regenerate Embeddings',
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <IconSymbol
                ios_icon_name="chevron.left"
                android_material_icon_name="arrow-back"
                size={24}
                color={colors.text}
              />
            </Pressable>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Animated.View entering={FadeIn.duration(300)} style={styles.infoCard}>
          <IconSymbol
            ios_icon_name="arrow.triangle.2.circlepath"
            android_material_icon_name="sync"
            size={32}
            color={colors.primary}
          />
          <Text style={styles.infoTitle}>Embedding Regeneration Tool</Text>
          <Text style={styles.infoText}>
            This tool regenerates embeddings for recalls and images using the same format
            (base64 encoding from OpenAI, decoded to Float32Array).
          </Text>
          <Text style={styles.infoText}>
            Use this if recently created recalls or images are not matching in keyword searches.
          </Text>
        </Animated.View>

        {isLoading && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading statistics...</Text>
          </Animated.View>
        )}

        {!isLoading && stats && !isProcessing && !result && (
          <>
            <Animated.View entering={FadeInDown.delay(100).duration(300)} style={styles.statsCard}>
              <Text style={styles.statsTitle}>Current Statistics</Text>

              <View style={styles.statSection}>
                <View style={styles.statHeader}>
                  <IconSymbol
                    ios_icon_name="doc.text.fill"
                    android_material_icon_name="description"
                    size={24}
                    color={colors.primary}
                  />
                  <Text style={styles.statSectionTitle}>Recalls</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total</Text>
                  <Text style={styles.statValue}>{stats.totalRecalls}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>With Embeddings</Text>
                  <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                    {stats.recallsWithEmbeddings}
                  </Text>
                  <Text style={styles.statPercentage}>
                    ({getPercentage(stats.recallsWithEmbeddings, stats.totalRecalls)}%)
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Without Embeddings</Text>
                  <Text style={[styles.statValue, { color: '#F44336' }]}>
                    {stats.recallsWithoutEmbeddings}
                  </Text>
                  <Text style={styles.statPercentage}>
                    ({getPercentage(stats.recallsWithoutEmbeddings, stats.totalRecalls)}%)
                  </Text>
                </View>
              </View>

              <View style={styles.statSection}>
                <View style={styles.statHeader}>
                  <IconSymbol
                    ios_icon_name="photo.fill"
                    android_material_icon_name="image"
                    size={24}
                    color={colors.primary}
                  />
                  <Text style={styles.statSectionTitle}>Images</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Total</Text>
                  <Text style={styles.statValue}>{stats.totalImages}</Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>With Embeddings</Text>
                  <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                    {stats.imagesWithEmbeddings}
                  </Text>
                  <Text style={styles.statPercentage}>
                    ({getPercentage(stats.imagesWithEmbeddings, stats.totalImages)}%)
                  </Text>
                </View>
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>Without Embeddings</Text>
                  <Text style={[styles.statValue, { color: '#F44336' }]}>
                    {stats.imagesWithoutEmbeddings}
                  </Text>
                  <Text style={styles.statPercentage}>
                    ({getPercentage(stats.imagesWithoutEmbeddings, stats.totalImages)}%)
                  </Text>
                </View>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(300)} style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, styles.recallButton]}
                onPress={handleRegenerateRecalls}
                disabled={stats.totalRecalls === 0}
              >
                <IconSymbol
                  ios_icon_name="doc.text.fill"
                  android_material_icon_name="description"
                  size={24}
                  color="#FFFFFF"
                />
                <Text style={styles.buttonText}>Regenerate Recall Embeddings</Text>
              </Pressable>

              <Pressable
                style={[styles.button, styles.imageButton]}
                onPress={handleRegenerateImages}
                disabled={stats.totalImages === 0}
              >
                <IconSymbol
                  ios_icon_name="photo.fill"
                  android_material_icon_name="image"
                  size={24}
                  color="#FFFFFF"
                />
                <Text style={styles.buttonText}>Regenerate Image Embeddings</Text>
              </Pressable>

              <Pressable
                style={[styles.button, styles.allButton]}
                onPress={handleRegenerateAll}
                disabled={stats.totalRecalls === 0 && stats.totalImages === 0}
              >
                <IconSymbol
                  ios_icon_name="arrow.triangle.2.circlepath"
                  android_material_icon_name="sync"
                  size={24}
                  color="#FFFFFF"
                />
                <Text style={styles.buttonText}>Regenerate All Embeddings</Text>
              </Pressable>
            </Animated.View>
          </>
        )}

        {isProcessing && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.processingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>
              {processingType === 'recalls' && 'Regenerating recall embeddings...'}
              {processingType === 'images' && 'Regenerating image embeddings...'}
              {processingType === 'all' && 'Regenerating all embeddings...'}
            </Text>
            <Text style={styles.processingSubtext}>
              This may take several minutes. Check console logs for detailed progress.
            </Text>
          </Animated.View>
        )}

        {error && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.errorCard}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="error"
              size={32}
              color="#F44336"
            />
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={[styles.button, styles.retryButton]}
              onPress={() => {
                setError(null);
                setResult(null);
                loadStats();
              }}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </Pressable>
          </Animated.View>
        )}

        {result && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.resultCard}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check-circle"
              size={48}
              color="#4CAF50"
            />
            <Text style={styles.resultTitle}>Processing Complete</Text>
            <Text style={styles.resultSubtitle}>
              {result.type === 'recalls' && 'Recall Embeddings'}
              {result.type === 'images' && 'Image Embeddings'}
              {result.type === 'all' && 'All Embeddings'}
            </Text>

            <View style={styles.resultStatsContainer}>
              <View style={styles.resultStatItem}>
                <Text style={styles.resultStatValue}>{result.totalProcessed}</Text>
                <Text style={styles.resultStatLabel}>Total</Text>
              </View>
              <View style={styles.resultStatItem}>
                <Text style={[styles.resultStatValue, { color: '#4CAF50' }]}>
                  {result.successful}
                </Text>
                <Text style={styles.resultStatLabel}>Success</Text>
              </View>
              <View style={styles.resultStatItem}>
                <Text style={[styles.resultStatValue, { color: '#F44336' }]}>
                  {result.failed}
                </Text>
                <Text style={styles.resultStatLabel}>Failed</Text>
              </View>
            </View>

            <View style={styles.resultTimeContainer}>
              <Text style={styles.resultTimeLabel}>Processing Time</Text>
              <Text style={styles.resultTimeValue}>
                {(result.processingTimeMs / 1000).toFixed(2)}s
              </Text>
            </View>

            {result.errors.length > 0 && (
              <View style={styles.errorsContainer}>
                <Text style={styles.errorsTitle}>Errors ({result.errors.length})</Text>
                <ScrollView style={styles.errorsList} nestedScrollEnabled>
                  {result.errors.map((err, index) => (
                    <Text key={index} style={styles.errorItem}>
                      • {err}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            )}

            <Pressable
              style={[styles.button, styles.doneButton]}
              onPress={() => {
                setResult(null);
                setError(null);
                loadStats();
              }}
            >
              <Text style={styles.buttonText}>Done</Text>
            </Pressable>
          </Animated.View>
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
  backButton: {
    padding: 8,
    marginLeft: 8,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: 12,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  loadingCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.text,
    marginTop: 16,
  },
  statsCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  statSection: {
    marginBottom: 20,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  statSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
  },
  statPercentage: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  recallButton: {
    backgroundColor: '#2196F3',
  },
  imageButton: {
    backgroundColor: '#9C27B0',
  },
  allButton: {
    backgroundColor: colors.primary,
  },
  retryButton: {
    backgroundColor: colors.primary,
    marginTop: 16,
  },
  doneButton: {
    backgroundColor: '#4CAF50',
    marginTop: 20,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  processingCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  processingText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  processingSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F44336',
    marginTop: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  resultCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginTop: 12,
  },
  resultSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 20,
  },
  resultStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
    gap: 16,
  },
  resultStatItem: {
    alignItems: 'center',
    minWidth: 80,
  },
  resultStatValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
  },
  resultStatLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  resultTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  resultTimeLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  resultTimeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  errorsContainer: {
    width: '100%',
    marginTop: 20,
  },
  errorsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F44336',
    marginBottom: 12,
  },
  errorsList: {
    maxHeight: 200,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
  },
  errorItem: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
    lineHeight: 18,
  },
});
