
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { getImageOCRResults, triggerOCRProcessing } from '@/utils/supabase';
import Animated, { FadeIn } from 'react-native-reanimated';

interface ImageOCRDisplayProps {
  imageId: string;
  autoLoad?: boolean;
}

export function ImageOCRDisplay({ imageId, autoLoad = true }: ImageOCRDisplayProps) {
  const [loading, setLoading] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (autoLoad) {
      loadOCRResults();
    }
  }, [imageId, autoLoad]);

  const loadOCRResults = async () => {
    try {
      setLoading(true);
      setError(null);

      const results = await getImageOCRResults(imageId);

      if (results) {
        setOcrText(results.ocrText || null);
        setExplanation(results.explanation || null);
      } else {
        setError('No OCR results available');
      }
    } catch (err) {
      console.error('Error loading OCR results:', err);
      setError('Failed to load OCR results');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessImage = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await triggerOCRProcessing(imageId);

      if (result.success) {
        // Wait a few seconds for processing to complete
        setTimeout(() => {
          loadOCRResults();
        }, 5000);
      } else {
        setError(result.error || 'Failed to process image');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error processing image:', err);
      setError('Failed to process image');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Processing image...</Text>
      </View>
    );
  }

  if (error && !ocrText && !explanation) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.retryButton} onPress={handleProcessImage}>
          <IconSymbol name="refresh" size={20} color={colors.primary} />
          <Text style={styles.retryText}>Process Image with AI</Text>
        </Pressable>
      </View>
    );
  }

  if (!ocrText && !explanation) {
    return null;
  }

  return (
    <Animated.View entering={FadeIn} style={styles.container}>
      <Pressable 
        style={styles.header} 
        onPress={() => setExpanded(!expanded)}
      >
        <IconSymbol 
          name="sparkles" 
          size={20} 
          color={colors.primary} 
          style={styles.icon}
        />
        <Text style={styles.headerText}>AI Analysis</Text>
        <IconSymbol 
          name={expanded ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={colors.textSecondary} 
        />
      </Pressable>

      {expanded && (
        <View style={styles.content}>
          {explanation && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.sectionText}>{explanation}</Text>
            </View>
          )}

          {ocrText && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Extracted Text</Text>
              <Text style={styles.sectionText}>{ocrText}</Text>
            </View>
          )}
        </View>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    marginRight: 4,
  },
  headerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  content: {
    marginTop: 12,
    gap: 12,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.primary + '15',
    borderRadius: 8,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});
