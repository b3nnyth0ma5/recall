
import React, { useMemo } from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors } from '@/styles/commonStyles';

interface RecallReference {
  recallId: string;
  imageIndex?: number;
}

interface MarkdownAnswerProps {
  content: string;
  recallReferences?: RecallReference[];
  onRecallPress?: (recallId: string, imageIndex?: number) => void;
}

export const MarkdownAnswer: React.FC<MarkdownAnswerProps> = ({ 
  content, 
  recallReferences = [],
  onRecallPress 
}) => {
  // Parse the content to identify SOURCE_X references and replace with hyperlinks
  const processedContent = useMemo(() => {
    if (!recallReferences || recallReferences.length === 0) {
      return content;
    }

    let processed = content;
    
    // Replace SOURCE_X patterns with markdown links
    recallReferences.forEach((ref, index) => {
      const sourcePattern = new RegExp(`SOURCE_${index + 1}`, 'g');
      // Create a markdown link with recall:// protocol for internal handling
      processed = processed.replace(sourcePattern, `[Source ${index + 1}](recall://${ref.recallId}${ref.imageIndex !== undefined ? `?image=${ref.imageIndex}` : ''})`);
    });
    
    return processed;
  }, [content, recallReferences]);

  // Custom link handler for recall:// protocol
  const handleLinkPress = (url: string) => {
    if (url.startsWith('recall://')) {
      const urlParts = url.replace('recall://', '').split('?');
      const recallId = urlParts[0];
      const imageParam = urlParts[1]?.split('=')[1];
      const imageIndex = imageParam ? parseInt(imageParam, 10) : undefined;
      
      console.log('[MarkdownAnswer] Recall link pressed:', { recallId, imageIndex });
      
      if (onRecallPress) {
        onRecallPress(recallId, imageIndex);
      }
      
      return false; // Prevent default link handling
    }
    
    return true; // Allow default handling for other links
  };

  return (
    <View style={styles.container}>
      <Markdown
        style={markdownStyles}
        onLinkPress={handleLinkPress}
      >
        {processedContent}
      </Markdown>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
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
