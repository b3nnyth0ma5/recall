
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

export const MarkdownAnswer: React.FC<MarkdownAnswerProps> = ({ 
  content, 
  recallReferences = [],
  onRecallPress 
}) => {
  // Parse the content to identify source references and convert them to hyperlinks
  const processedContent = useMemo(() => {
    if (!recallReferences || recallReferences.length === 0) {
      return { text: content, links: [] as { sourceNum: number; recallId: string; imageIndex?: number }[] };
    }
    
    let processed = content;
    const links: { sourceNum: number; recallId: string; imageIndex?: number }[] = [];
    
    // Process each source reference
    recallReferences.forEach((ref, index) => {
      const sourceNum = index + 1;
      const sourceMarker = `SOURCE_${sourceNum}`;
      
      // Find all occurrences of this source marker and replace with a placeholder
      const regex = new RegExp(`\\s*${sourceMarker}`, 'g');
      
      processed = processed.replace(regex, () => {
        links.push({ sourceNum, recallId: ref.recallId, imageIndex: ref.imageIndex });
        return ` [LINK_${sourceNum}]`;
      });
    });
    
    return { text: processed, links };
  }, [content, recallReferences]);

  // Split the content into segments with link placeholders
  const renderContent = useMemo(() => {
    const { text, links } = processedContent;
    
    // Split by link placeholders
    const parts = text.split(/(\[LINK_\d+\])/g);
    
    return parts.map((part, index) => {
      // Check if this is a link placeholder
      const linkMatch = part.match(/\[LINK_(\d+)\]/);
      
      if (linkMatch) {
        const sourceNum = parseInt(linkMatch[1], 10);
        const link = links.find(l => l.sourceNum === sourceNum);
        
        if (link && onRecallPress) {
          const sourceText = `SOURCE_${sourceNum}`;
          
          return (
            <Pressable
              key={`link-${index}`}
              onPress={() => {
                console.log('[MarkdownAnswer] Source link pressed for recall:', link.recallId);
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onRecallPress(link.recallId, link.imageIndex);
              }}
              style={styles.linkButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.linkText}>{sourceText}</Text>
            </Pressable>
          );
        }
      }
      
      // Regular text - render with markdown
      return (
        <Markdown
          key={`text-${index}`}
          style={markdownStyles}
        >
          {part}
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
    alignItems: 'center',
  },
  linkButton: {
    marginLeft: 4,
    marginRight: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  linkText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
