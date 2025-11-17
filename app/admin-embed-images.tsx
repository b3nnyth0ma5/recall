
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { embedNullImages, embedNullImagesInBatches } from '@/utils/embedNullImages';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

interface ProcessingResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  skipped: number;
  results: {
    imageId: string;
    success: boolean;
    error?: string;
    skipped?: boolean;
    processingTimeMs?: number;
  }[];
}

export default function AdminEmbedImagesScreen() {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingMode, setProcessingMode] = useState<'single' | 'batch' | null>(null);

  const handleEmbedAll = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProcessingMode('single');

    try {
      console.log('Starting embedding process...');
      const processResult = await embedNullImages();
      setResult(processResult);
      console.log('Embedding process completed successfully');
    } catch (err) {
      console.error('Error during embedding process:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
      setProcessingMode(null);
    }
  };

  const handleEmbedInBatches = async () => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProcessingMode('batch');

    try {
      console.log('Starting batched embedding process...');
      const processResult = await embedNullImagesInBatches(10);
      setResult(processResult);
      console.log('Batched embedding process completed successfully');
    } catch (err) {
      console.error('Error during batched embedding process:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
      setProcessingMode(null);
    }
  };

  const getStatusColor = (status: 'success' | 'failed' | 'skipped') => {
    switch (status) {
      case 'success':
        return '#4CAF50';
      case 'failed':
        return '#F44336';
      case 'skipped':
        return '#FF9800';
      default:
        return colors.text;
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Embed Null Images',
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
                android_material_icon_name="arrow_back"
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
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={32}
            color={colors.primary}
          />
          <Text style={styles.infoTitle}>Image Embedding Tool</Text>
          <Text style={styles.infoText}>
            This tool processes all recall_images with NULL embeddings by invoking the
            &quot;embedding-image&quot; edge function for each image.
          </Text>
          <Text style={styles.infoText}>
            • Single Mode: Processes all images in one go
          </Text>
          <Text style={styles.infoText}>
            • Batch Mode: Processes images in batches of 10 (recommended for large datasets)
          </Text>
        </Animated.View>

        {!isProcessing && !result && !error && (
          <Animated.View entering={FadeInDown.delay(100).duration(300)} style={styles.buttonContainer}>
            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={handleEmbedAll}
            >
              <IconSymbol
                ios_icon_name="play.fill"
                android_material_icon_name="play_arrow"
                size={24}
                color="#FFFFFF"
              />
              <Text style={styles.buttonText}>Process All Images</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.secondaryButton]}
              onPress={handleEmbedInBatches}
            >
              <IconSymbol
                ios_icon_name="square.stack.3d.up.fill"
                android_material_icon_name="layers"
                size={24}
                color="#FFFFFF"
              />
              <Text style={styles.buttonText}>Process in Batches</Text>
            </Pressable>
          </Animated.View>
        )}

        {isProcessing && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.processingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingText}>
              {processingMode === 'batch' ? 'Processing images in batches...' : 'Processing images...'}
            </Text>
            <Text style={styles.processingSubtext}>
              This may take a few minutes. Check console logs for detailed progress.
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
              android_material_icon_name="check_circle"
              size={48}
              color="#4CAF50"
            />
            <Text style={styles.resultTitle}>Processing Complete</Text>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{result.totalProcessed}</Text>
                <Text style={styles.statLabel}>Total Processed</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: getStatusColor('success') }]}>
                  {result.successful}
                </Text>
                <Text style={styles.statLabel}>Successful</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: getStatusColor('failed') }]}>
                  {result.failed}
                </Text>
                <Text style={styles.statLabel}>Failed</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: getStatusColor('skipped') }]}>
                  {result.skipped}
                </Text>
                <Text style={styles.statLabel}>Skipped</Text>
              </View>
            </View>

            {result.results.length > 0 && (
              <View style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>Details</Text>
                <ScrollView style={styles.detailsList} nestedScrollEnabled>
                  {result.results.map((item, index) => (
                    <View key={index} style={styles.detailItem}>
                      <View style={styles.detailHeader}>
                        <Text style={styles.detailImageId} numberOfLines={1}>
                          {item.imageId.substring(0, 8)}...
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: item.success
                                ? item.skipped
                                  ? getStatusColor('skipped')
                                  : getStatusColor('success')
                                : getStatusColor('failed'),
                            },
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {item.success ? (item.skipped ? 'SKIPPED' : 'SUCCESS') : 'FAILED'}
                          </Text>
                        </View>
                      </View>
                      {item.error && (
                        <Text style={styles.detailError} numberOfLines={2}>
                          {item.error}
                        </Text>
                      )}
                      {item.processingTimeMs && (
                        <Text style={styles.detailTime}>{item.processingTimeMs}ms</Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <Pressable
              style={[styles.button, styles.doneButton]}
              onPress={() => {
                setResult(null);
                setError(null);
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
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: '#2196F3',
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
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
    gap: 16,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 80,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  detailsContainer: {
    width: '100%',
    marginTop: 20,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  detailsList: {
    maxHeight: 300,
  },
  detailItem: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailImageId: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.textSecondary,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailError: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
  },
  detailTime: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
