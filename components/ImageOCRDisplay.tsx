
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { getImageOCRResults, triggerOCRProcessing, retryOCRProcessing } from '@/utils/supabase';

interface ImageOCRDisplayProps {
  imageId: string;
  autoLoad?: boolean;
  compact?: boolean; // Show compact version with expandable sections
}

/**
 * Component to display OCR results and image explanations
 * 
 * Features:
 * - Automatic loading of OCR results
 * - Manual trigger for OCR processing
 * - Retry functionality for failed processing
 * - Loading states and error handling
 * - Expandable sections for better UX
 */
export default function ImageOCRDisplay({ imageId, autoLoad = true, compact = false }: ImageOCRDisplayProps) {
  const [ocrText, setOcrText] = useState<string | undefined>();
  const [explanation, setExplanation] = useState<string | undefined>();
  const [processedAt, setProcessedAt] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [showOcrText, setShowOcrText] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);

  const loadOCRResults = useCallback(async () => {
    if (!imageId) {
      console.log('No imageId provided to ImageOCRDisplay');
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      console.log('Loading OCR results for image:', imageId);
      const results = await getImageOCRResults(imageId);

      if (results) {
        setOcrText(results.ocrText);
        setExplanation(results.explanation);
        setProcessedAt(results.processedAt);
        setIsProcessing(results.isProcessing || false);

        if (results.isProcessing) {
          console.log('Image is still being processed, will retry in 3 seconds');
          // Retry after a delay if still processing
          setTimeout(() => {
            loadOCRResults();
          }, 3000);
        }
      } else {
        setError('Failed to load OCR results');
      }
    } catch (err) {
      console.error('Error loading OCR results:', err);
      setError('An error occurred while loading OCR results');
    } finally {
      setIsLoading(false);
    }
  }, [imageId]);

  const handleProcessImage = async () => {
    setIsLoading(true);
    setError(undefined);
    setIsProcessing(true);

    try {
      console.log('Manually triggering OCR processing for image:', imageId);
      const result = await triggerOCRProcessing(imageId);

      if (result.success) {
        console.log('OCR processing triggered successfully');
        // Wait a bit then reload results
        setTimeout(() => {
          loadOCRResults();
        }, 2000);
      } else {
        setError(result.error || 'Failed to trigger OCR processing');
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('Error triggering OCR processing:', err);
      setError('An error occurred while processing the image');
      setIsProcessing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    setIsLoading(true);
    setError(undefined);
    setIsProcessing(true);

    try {
      console.log('Retrying OCR processing for image:', imageId);
      const result = await retryOCRProcessing(imageId);

      if (result.success) {
        console.log('OCR retry triggered successfully');
        // Wait a bit then reload results
        setTimeout(() => {
          loadOCRResults();
        }, 2000);
      } else {
        setError(result.error || 'Failed to retry OCR processing');
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('Error retrying OCR processing:', err);
      setError('An error occurred while retrying');
      setIsProcessing(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad && imageId) {
      loadOCRResults();
    }
  }, [imageId, autoLoad, loadOCRResults]);

  // If no results and not processing, show process button
  if (!ocrText && !explanation && !isProcessing && !isLoading) {
    return (
      <Animated.View entering={FadeIn} style={styles.container}>
        <Pressable
          style={styles.processButton}
          onPress={handleProcessImage}
        >
          <IconSymbol name="sparkles" size={20} color={colors.primary} />
          <Text style={styles.processButtonText}>Analyze Image with AI</Text>
        </Pressable>
      </Animated.View>
    );
  }

  // Show loading state
  if (isLoading || isProcessing) {
    return (
      <Animated.View entering={FadeIn} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>
            {isProcessing ? 'Processing image with AI...' : 'Loading results...'}
          </Text>
        </View>
      </Animated.View>
    );
  }

  // Show error state
  if (error) {
    return (
      <Animated.View entering={FadeIn} style={styles.container}>
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle" size={20} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  // Show results
  return (
    <Animated.View entering={FadeInDown} style={styles.container}>
      {/* OCR Text Section */}
      {ocrText && ocrText !== 'No text detected.' && (
        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() => setShowOcrText(!showOcrText)}
          >
            <View style={styles.sectionHeaderLeft}>
              <IconSymbol name="doc.text" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Extracted Text</Text>
            </View>
            <IconSymbol
              name={showOcrText ? 'chevron.up' : 'chevron.down'}
              size={16}
              color={colors.textSecondary}
            />
          </Pressable>
          {showOcrText && (
            <Animated.View entering={FadeIn} style={styles.sectionContent}>
              <ScrollView
                style={compact ? styles.compactScrollView : undefined}
                nestedScrollEnabled
              >
                <Text style={styles.ocrText}>{ocrText}</Text>
              </ScrollView>
            </Animated.View>
          )}
        </View>
      )}

      {/* Explanation Section */}
      {explanation && (
        <View style={styles.section}>
          <Pressable
            style={styles.sectionHeader}
            onPress={() => setShowExplanation(!showExplanation)}
          >
            <View style={styles.sectionHeaderLeft}>
              <IconSymbol name="sparkles" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>AI Explanation</Text>
            </View>
            <IconSymbol
              name={showExplanation ? 'chevron.up' : 'chevron.down'}
              size={16}
              color={colors.textSecondary}
            />
          </Pressable>
          {showExplanation && (
            <Animated.View entering={FadeIn} style={styles.sectionContent}>
              <Text style={styles.explanationText}>{explanation}</Text>
            </Animated.View>
          )}
        </View>
      )}

      {/* Metadata */}
      {processedAt && (
        <View style={styles.metadata}>
          <IconSymbol name="clock" size={14} color={colors.textSecondary} />
          <Text style={styles.metadataText}>
            Processed {new Date(processedAt).toLocaleString()}
          </Text>
        </View>
      )}

      {/* Retry button */}
      <Pressable style={styles.retrySmallButton} onPress={handleRetry}>
        <IconSymbol name="arrow.clockwise" size={14} color={colors.primary} />
        <Text style={styles.retrySmallButtonText}>Reprocess</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  processButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  processButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  errorContainer: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginTop: 8,
  },
  retryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionContent: {
    marginTop: 8,
  },
  compactScrollView: {
    maxHeight: 150,
  },
  ocrText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  explanationText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metadataText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  retrySmallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    marginTop: 8,
  },
  retrySmallButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '500',
  },
});
