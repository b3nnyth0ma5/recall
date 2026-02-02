
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
 * SOURCE_X patterns in the text are converted to clickable [X] links
 * that scroll to the corresponding recall and navigate to its detail view.
 * 
 * Features:
 * - Parses markdown with react-native-markdown-display
 * - Converts SOURCE_X to clickable [X] superscript links
 * - Provides haptic feedback on link press
 * - Maintains proper text flow with inline links
 */

export const MarkdownAnswer: React.FC<MarkdownAnswerProps> = ({ 
  content, 
  recallReferences = [],
  onRecallPress 
}) => {
  // Parse the content to identify source references and convert them to hyperlinked numbers
  // This creates a better UX by making source numbers clickable inline with the text
  const processedContent = useMemo(() => {
    if (!recallReferences || recallReferences.length === 0) {
      return { segments: [{ type: 'text' as const, content }] };
    }
    
    const segments: Array<{ 
      type: 'text' | 'link'; 
      content: string; 
      sourceNum?: number; 
      recallId?: string; 
      imageIndex?: number;
    }> = [];
    
    // Match SOURCE_X patterns (where X is a number)
    // This regex captures the source number for easy extraction
    const sourceRegex = /SOURCE_(\d+)/g;
    let lastIndex = 0;
    let match;
    
    while ((match = sourceRegex.exec(content)) !== null) {
      const sourceNum = parseInt(match[1], 10);
      const matchStart = match.index;
      const matchEnd = sourceRegex.lastIndex;
      
      // Add text before this match as regular markdown
      if (matchStart > lastIndex) {
        segments.push({
          type: 'text',
          content: content.substring(lastIndex, matchStart),
        });
      }
      
      // Convert SOURCE_X to clickable [X] link
      const ref = recallReferences[sourceNum - 1];
      if (ref && onRecallPress) {
        segments.push({
          type: 'link',
          content: `[${sourceNum}]`,
          sourceNum,
          recallId: ref.recallId,
          imageIndex: ref.imageIndex,
        });
      } else {
        // If no reference found, show as plain text (shouldn't happen in normal flow)
        segments.push({
          type: 'text',
          content: match[0],
        });
      }
      
      lastIndex = matchEnd;
    }
    
    // Add any remaining text after the last match
    if (lastIndex < content.length) {
      segments.push({
        type: 'text',
        content: content.substring(lastIndex),
      });
    }
    
    return { segments };
  }, [content, recallReferences, onRecallPress]);

  // Render the content with hyperlinked source numbers
  // Links are rendered as pressable superscript numbers for better UX
  const renderContent = useMemo(() => {
    const { segments } = processedContent;
    
    return segments.map((segment, index) => {
      if (segment.type === 'link' && segment.recallId && onRecallPress) {
        // Render clickable source number with haptic feedback
        return (
          <Pressable
            key={`link-${index}`}
            onPress={() => {
              console.log('[MarkdownAnswer] Source link pressed:', {
                sourceNum: segment.sourceNum,
                recallId: segment.recallId,
                imageIndex: segment.imageIndex,
              });
              
              // Provide haptic feedback for better UX
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              
              // Trigger callback to scroll to recall and navigate
              onRecallPress(segment.recallId, segment.imageIndex);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.sourceLink}>{segment.content}</Text>
          </Pressable>
        );
      }
      
      // Regular text - render with markdown parser
      return (
        <Markdown
          key={`text-${index}`}
          style={markdownStyles}
        >
          {segment.content}
        </Markdown>
      );
    });
  }, [processedContent, onRecallPress]);

  return (
    <View style={styles.container}>
      <View style={styles.contentWrapper}>
        {renderContent}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  contentWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  sourceLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginHorizontal: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: `${colors.primary}15`,
    overflow: 'hidden',
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
