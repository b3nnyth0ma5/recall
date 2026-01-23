
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
  // Parse the content to identify various reference patterns and replace with hyperlinks
  const processedContent = useMemo(() => {
    if (!recallReferences || recallReferences.length === 0) {
      console.log('[MarkdownAnswer] No recall references provided, returning original content');
      return content;
    }

    console.log('[MarkdownAnswer] ===== PROCESSING CONTENT =====');
    console.log('[MarkdownAnswer] Recall references count:', recallReferences.length);
    console.log('[MarkdownAnswer] Recall references:', JSON.stringify(recallReferences, null, 2));
    console.log('[MarkdownAnswer] Original content:', content);
    
    let processed = content;
    
    // Replace multiple reference patterns:
    // 1. SOURCE_X (e.g., SOURCE_1, SOURCE_2)
    // 2. [X] (e.g., [1], [2])
    // 3. [Source X] (e.g., [Source 1], [Source 2])
    recallReferences.forEach((ref, index) => {
      const sourceNum = index + 1;
      console.log(`[MarkdownAnswer] Processing reference ${sourceNum}:`, ref);
      
      // Pattern 1: SOURCE_X
      const sourcePattern1 = new RegExp(`SOURCE_${sourceNum}`, 'g');
      const matches1 = content.match(sourcePattern1);
      if (matches1) {
        console.log(`[MarkdownAnswer] Found ${matches1.length} matches for SOURCE_${sourceNum}`);
      }
      processed = processed.replace(sourcePattern1, `[Source ${sourceNum}](recall://${ref.recallId}${ref.imageIndex !== undefined ? `?image=${ref.imageIndex}` : ''})`);
      
      // Pattern 2: [X] - but only if not already a markdown link
      // Use negative lookbehind to avoid matching already processed links
      const sourcePattern2 = new RegExp(`(?<!\\[Source \\d+\\])\\[${sourceNum}\\](?!\\()`, 'g');
      const matches2 = content.match(new RegExp(`\\[${sourceNum}\\]`, 'g'));
      if (matches2) {
        console.log(`[MarkdownAnswer] Found ${matches2.length} matches for [${sourceNum}]`);
      }
      processed = processed.replace(sourcePattern2, `[Source ${sourceNum}](recall://${ref.recallId}${ref.imageIndex !== undefined ? `?image=${ref.imageIndex}` : ''})`);
      
      // Pattern 3: [Source X] - but only if not already a markdown link
      const sourcePattern3 = new RegExp(`\\[Source ${sourceNum}\\](?!\\()`, 'g');
      const matches3 = content.match(new RegExp(`\\[Source ${sourceNum}\\]`, 'g'));
      if (matches3) {
        console.log(`[MarkdownAnswer] Found ${matches3.length} matches for [Source ${sourceNum}]`);
      }
      processed = processed.replace(sourcePattern3, `[Source ${sourceNum}](recall://${ref.recallId}${ref.imageIndex !== undefined ? `?image=${ref.imageIndex}` : ''})`);
    });
    
    console.log('[MarkdownAnswer] ===== PROCESSED CONTENT =====');
    console.log('[MarkdownAnswer] Processed content:', processed);
    console.log('[MarkdownAnswer] Changes made:', content !== processed);
    return processed;
  }, [content, recallReferences]);

  // Custom link handler for recall:// protocol
  const handleLinkPress = (url: string) => {
    console.log('[MarkdownAnswer] Link pressed:', url);
    
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
    
    // Allow default handling for other links (external URLs)
    return true;
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
