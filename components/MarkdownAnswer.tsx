
import React, { useMemo } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

interface RecallReference {
  recallId: string;
  imageIndex?: number;
}

interface MarkdownAnswerProps {
  content: string;
  recallReferences?: RecallReference[];
  onRecallPress?: (recallId: string, imageIndex?: number) => void;
}

/**
 * MarkdownAnswer Component
 * 
 * Renders markdown content with hyperlinked source references.
 * SOURCE_X patterns in the text are converted to clickable numbered links
 * that scroll to the corresponding recall and navigate to its detail view.
 * 
 * Features:
 * - Parses markdown with react-native-markdown-display
 * - Converts SOURCE_X to clickable numbered superscript links (without brackets)
 * - Provides haptic feedback on link press
 * - Maintains proper text flow with inline links
 */

export const MarkdownAnswer: React.FC<MarkdownAnswerProps> = ({ 
  content, 
  recallReferences = [],
  onRecallPress 
}) => {
  // Process content to replace SOURCE_X with inline hyperlinked numbers
  const processedContent = useMemo(() => {
    if (!recallReferences || recallReferences.length === 0) {
      return content;
    }
    
    // Replace SOURCE_X patterns with placeholder markers that we'll render as links
    // Using a unique marker format that won't appear in normal text
    const processedText = content.replace(/SOURCE_(\d+)/g, (match, sourceNum) => {
      return `{{LINK:${sourceNum}}}`;
    });
    
    return processedText;
  }, [content, recallReferences]);

  // Split content into text and link segments for inline rendering
  const renderInlineContent = useMemo(() => {
    const segments: React.ReactNode[] = [];
    const linkRegex = /\{\{LINK:(\d+)\}\}/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = linkRegex.exec(processedContent)) !== null) {
      const sourceNum = parseInt(match[1], 10);
      const matchStart = match.index;
      
      // Add text before this link
      if (matchStart > lastIndex) {
        const textBefore = processedContent.substring(lastIndex, matchStart);
        segments.push(
          <Text key={`text-${key++}`} style={styles.inlineText}>
            {textBefore}
          </Text>
        );
      }
      
      // Add the hyperlinked number (without brackets)
      const ref = recallReferences[sourceNum - 1];
      if (ref && onRecallPress) {
        segments.push(
          <Text
            key={`link-${key++}`}
            style={styles.sourceLink}
            onPress={() => {
              console.log('[MarkdownAnswer] Source link pressed:', {
                sourceNum,
                recallId: ref.recallId,
                imageIndex: ref.imageIndex,
              });
              
              // Provide haptic feedback for better UX
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              
              // Trigger callback to scroll to recall and navigate
              onRecallPress(ref.recallId, ref.imageIndex);
            }}
          >
            {sourceNum}
          </Text>
        );
      } else {
        // If no reference found, show as plain text
        segments.push(
          <Text key={`text-${key++}`} style={styles.inlineText}>
            {sourceNum}
          </Text>
        );
      }
      
      lastIndex = linkRegex.lastIndex;
    }
    
    // Add any remaining text after the last link
    if (lastIndex < processedContent.length) {
      const textAfter = processedContent.substring(lastIndex);
      segments.push(
        <Text key={`text-${key++}`} style={styles.inlineText}>
          {textAfter}
        </Text>
      );
    }
    
    return segments;
  }, [processedContent, recallReferences, onRecallPress]);

  // Check if content has any links
  const hasLinks = processedContent.includes('{{LINK:');

  return (
    <View style={styles.container}>
      {hasLinks ? (
        <Text style={styles.inlineContainer}>
          {renderInlineContent}
        </Text>
      ) : (
        <Markdown style={markdownStyles}>
          {content}
        </Markdown>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inlineContainer: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    flexWrap: 'wrap',
  },
  inlineText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  sourceLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
    lineHeight: 24,
    paddingHorizontal: 2,
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  heading1: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  heading2: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  heading3: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  heading4: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
  },
  heading5: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  heading6: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
  },
  paragraph: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 0,
    marginBottom: 12,
  },
  strong: {
    fontWeight: '700',
    color: colors.text,
  },
  em: {
    fontStyle: 'italic',
    color: colors.text,
  },
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  blockquote: {
    backgroundColor: `${colors.primary}10`,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    paddingLeft: 16,
    paddingVertical: 8,
    marginVertical: 8,
  },
  code_inline: {
    backgroundColor: colors.cardDark,
    color: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  code_block: {
    backgroundColor: colors.cardDark,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  fence: {
    backgroundColor: colors.cardDark,
    color: colors.text,
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  bullet_list: {
    marginVertical: 8,
  },
  ordered_list: {
    marginVertical: 8,
  },
  list_item: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  bullet_list_icon: {
    color: colors.primary,
    fontSize: 16,
    lineHeight: 24,
    marginRight: 8,
  },
  ordered_list_icon: {
    color: colors.primary,
    fontSize: 16,
    lineHeight: 24,
    marginRight: 8,
  },
  bullet_list_content: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  ordered_list_content: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  hr: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 16,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginVertical: 8,
  },
  thead: {
    backgroundColor: colors.cardDark,
  },
  tbody: {
    backgroundColor: colors.card,
  },
  th: {
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontWeight: '700',
    color: colors.text,
  },
  tr: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  td: {
    padding: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
});
