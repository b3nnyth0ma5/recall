
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView, LayoutAnimation, Platform, UIManager } from 'react-native';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { getImageOCRResults, triggerOCRProcessing, retryOCRProcessing, getDocumentAnalysis } from '@/utils/supabase';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUCCESS_GREEN = '#34C759';

interface ImageOCRDisplayProps {
  imageId?: string;
  documentId?: string;
  mode?: 'image' | 'document';
  autoLoad?: boolean;
  compact?: boolean; // Show compact version with expandable sections
}

/**
 * Component to display OCR results and image/document explanations
 *
 * Features:
 * - Automatic loading of OCR results
 * - Manual trigger for OCR processing (image mode only)
 * - Retry functionality for failed processing
 * - Loading states and error handling
 * - Expandable sections for better UX
 * - Auto-triggers OCR if processed_at is NULL (image mode only)
 * - Document mode: reads extracted_text + doc_explanation from recall_documents
 */
export default function ImageOCRDisplay({
  imageId,
  documentId,
  mode = 'image',
  autoLoad = true,
  compact = false,
}: ImageOCRDisplayProps) {
  const [ocrText, setOcrText] = useState<string | undefined>();
  const [explanation, setExplanation] = useState<string | undefined>();
  const [processedAt, setProcessedAt] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [showOcrText, setShowOcrText] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);
  const [autoTriggered, setAutoTriggered] = useState(false);

  // Copy-to-clipboard state
  const [ocrTextCopied, setOcrTextCopied] = useState(false);
  const [explanationCopied, setExplanationCopied] = useState(false);
  const ocrTextCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explanationCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (ocrTextCopyTimer.current) clearTimeout(ocrTextCopyTimer.current);
      if (explanationCopyTimer.current) clearTimeout(explanationCopyTimer.current);
    };
  }, []);

  const handleCopyOcrText = async () => {
    if (!ocrText) return;
    console.log('[ImageOCRDisplay] Copy extracted text button pressed');
    try {
      await Clipboard.setStringAsync(ocrText);
      console.log('[ImageOCRDisplay] Extracted text copied to clipboard');
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      LayoutAnimation.easeInEaseOut();
      setOcrTextCopied(true);
      if (ocrTextCopyTimer.current) clearTimeout(ocrTextCopyTimer.current);
      ocrTextCopyTimer.current = setTimeout(() => {
        LayoutAnimation.easeInEaseOut();
        setOcrTextCopied(false);
      }, 1500);
    } catch (err) {
      console.error('[ImageOCRDisplay] Failed to copy extracted text:', err);
    }
  };

  const handleCopyExplanation = async () => {
    if (!explanation) return;
    console.log('[ImageOCRDisplay] Copy AI explanation button pressed');
    try {
      await Clipboard.setStringAsync(explanation);
      console.log('[ImageOCRDisplay] AI explanation copied to clipboard');
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      LayoutAnimation.easeInEaseOut();
      setExplanationCopied(true);
      if (explanationCopyTimer.current) clearTimeout(explanationCopyTimer.current);
      explanationCopyTimer.current = setTimeout(() => {
        LayoutAnimation.easeInEaseOut();
        setExplanationCopied(false);
      }, 1500);
    } catch (err) {
      console.error('[ImageOCRDisplay] Failed to copy AI explanation:', err);
    }
  };

  // Load results — branches on mode
  const loadResults = async () => {
    if (mode === 'document') {
      if (!documentId) {
        console.log('[ImageOCRDisplay] No documentId provided (document mode)');
        return;
      }
      setIsLoading(true);
      setError(undefined);
      try {
        console.log('[ImageOCRDisplay] Loading document analysis for:', documentId);
        const results = await getDocumentAnalysis(documentId);
        if (results) {
          setOcrText(results.ocrText);
          setExplanation(results.explanation);
          setProcessedAt(results.processedAt);
          setIsProcessing(results.isProcessing);
          if (results.isProcessing && !results.processedAt) {
            console.log('[ImageOCRDisplay] Document still processing — will retry in 4s');
            setTimeout(() => loadResults(), 4000);
          }
        } else {
          setError('Failed to load document analysis');
        }
      } catch (err) {
        console.error('[ImageOCRDisplay] Error loading document analysis:', err);
        setError('An error occurred while loading document analysis');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Image mode
    if (!imageId) {
      console.log('[ImageOCRDisplay] No imageId provided (image mode)');
      return;
    }
    setIsLoading(true);
    setError(undefined);
    try {
      console.log('[ImageOCRDisplay] Loading OCR results for image:', imageId);
      const results = await getImageOCRResults(imageId);
      if (results) {
        setOcrText(results.ocrText);
        setExplanation(results.explanation);
        setProcessedAt(results.processedAt);
        setIsProcessing(results.isProcessing || false);
        if (results.isProcessing && !results.processedAt && !autoTriggered) {
          console.log('[ImageOCRDisplay] Image is unprocessed, auto-triggering OCR processing');
          setAutoTriggered(true);
          handleProcessImage();
        } else if (results.isProcessing) {
          console.log('[ImageOCRDisplay] Image is still being processed, will retry in 3 seconds');
          setTimeout(() => loadResults(), 3000);
        }
      } else {
        setError('Failed to load OCR results');
      }
    } catch (err) {
      console.error('[ImageOCRDisplay] Error loading OCR results:', err);
      setError('An error occurred while loading OCR results');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessImage = async () => {
    if (mode === 'document') {
      console.log('[ImageOCRDisplay] handleProcessImage called in document mode — server-triggered, no-op');
      return;
    }
    setIsLoading(true);
    setError(undefined);
    setIsProcessing(true);
    try {
      console.log('[ImageOCRDisplay] Manually triggering OCR processing for image:', imageId);
      const result = await triggerOCRProcessing(imageId!);
      if (result.success) {
        console.log('[ImageOCRDisplay] OCR processing triggered successfully');
        setTimeout(() => loadResults(), 2000);
      } else {
        setError(result.error || 'Failed to trigger OCR processing');
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('[ImageOCRDisplay] Error triggering OCR processing:', err);
      setError('An error occurred while processing the image');
      setIsProcessing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async () => {
    if (mode === 'document') {
      // Re-poll the document row as a lightweight retry
      console.log('[ImageOCRDisplay] Document retry — re-polling document:', documentId);
      await loadResults();
      return;
    }
    setIsLoading(true);
    setError(undefined);
    setIsProcessing(true);
    try {
      console.log('[ImageOCRDisplay] Retrying OCR processing for image:', imageId);
      const result = await retryOCRProcessing(imageId!);
      if (result.success) {
        console.log('[ImageOCRDisplay] OCR retry triggered successfully');
        setTimeout(() => loadResults(), 2000);
      } else {
        setError(result.error || 'Failed to retry OCR processing');
        setIsProcessing(false);
      }
    } catch (err) {
      console.error('[ImageOCRDisplay] Error retrying OCR processing:', err);
      setError('An error occurred while retrying');
      setIsProcessing(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) {
      if (mode === 'document' && documentId) {
        loadResults();
      } else if (mode === 'image' && imageId) {
        loadResults();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, documentId, mode, autoLoad]);

  const analyzeButtonLabel = mode === 'document' ? 'Analyze Document with AI' : 'Analyze Image with AI';
  const processingLabel = mode === 'document' ? 'Processing document with AI…' : 'Processing image with AI...';

  // If no results and not processing, show process button
  if (!ocrText && !explanation && !isProcessing && !isLoading) {
    return (
      <Animated.View entering={FadeIn} style={styles.container}>
        <Pressable
          style={styles.processButton}
          onPress={handleProcessImage}
        >
          <IconSymbol name="sparkles" size={20} color={colors.primary} />
          <Text style={styles.processButtonText}>{analyzeButtonLabel}</Text>
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
            {isProcessing ? processingLabel : 'Loading results...'}
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
    <ScrollView style={styles.scrollContainer} nestedScrollEnabled>
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
              <View style={styles.sectionHeaderRight}>
                <Pressable
                  onPress={handleCopyOcrText}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Copy extracted text"
                  accessibilityRole="button"
                  style={styles.copyButton}
                >
                  <IconSymbol
                    name={ocrTextCopied ? 'checkmark' : 'doc.on.doc'}
                    size={18}
                    color={ocrTextCopied ? SUCCESS_GREEN : colors.textSecondary}
                  />
                </Pressable>
                <IconSymbol
                  name={showOcrText ? 'chevron.up' : 'chevron.down'}
                  size={16}
                  color={colors.textSecondary}
                />
              </View>
            </Pressable>
            {showOcrText && (
              <Animated.View entering={FadeIn} style={styles.sectionContent}>
                <Text style={styles.ocrText}>{ocrText}</Text>
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
              <View style={styles.sectionHeaderRight}>
                <Pressable
                  onPress={handleCopyExplanation}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Copy AI explanation"
                  accessibilityRole="button"
                  style={styles.copyButton}
                >
                  <IconSymbol
                    name={explanationCopied ? 'checkmark' : 'doc.on.doc'}
                    size={18}
                    color={explanationCopied ? SUCCESS_GREEN : colors.textSecondary}
                  />
                </Pressable>
                <IconSymbol
                  name={showExplanation ? 'chevron.up' : 'chevron.down'}
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
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

        {/* Retry / Reprocess button */}
        <Pressable style={styles.retrySmallButton} onPress={handleRetry}>
          <IconSymbol name="arrow.clockwise" size={14} color={colors.primary} />
          <Text style={styles.retrySmallButtonText}>Reprocess</Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    maxHeight: 500,
  },
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
    flex: 1,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  copyButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionContent: {
    marginTop: 8,
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
