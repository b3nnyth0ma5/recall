
import React, { useMemo } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors } from '@/styles/commonStyles';
import * as Haptics from 'expo-haptics';

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
 * SOURCE_X patterns are converted to markdown links [X](source:X)
 * and rendered as tappable inline elements via a custom markdown rule.
 */

export const MarkdownAnswer: React.FC<MarkdownAnswerProps> = ({
  content,
  recallReferences = [],
  onRecallPress,
}) => {
  // Replace SOURCE_X with markdown link syntax [X](source:X)
  const processedContent = useMemo(() => {
    return content.replace(/SOURCE_(\d+)/g, (_match, num) => `[${num}](source:${num})`);
  }, [content]);

  // Custom rules to intercept source: links and render as tappable badges
  const rules = useMemo(() => ({
    link: (node: any, children: any, _parent: any, styles: any) => {
      const href: string = node.attributes?.href ?? '';
      if (href.startsWith('source:')) {
        const sourceNum = parseInt(href.replace('source:', ''), 10);
        const ref = recallReferences[sourceNum - 1];
        return (
          <Text
            key={node.key}
            style={sourceLinkStyle}
            onPress={() => {
              console.log('[MarkdownAnswer] Source link pressed:', {
                sourceNum,
                recallId: ref?.recallId,
                imageIndex: ref?.imageIndex,
              });
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              if (ref && onRecallPress) {
                onRecallPress(ref.recallId, ref.imageIndex);
              }
            }}
          >
            {sourceNum}
          </Text>
        );
      }
      // Normal link fallback
      return (
        <Text key={node.key} style={styles.link}>
          {children}
        </Text>
      );
    },
  }), [recallReferences, onRecallPress]);

  return (
    <View style={styles.container}>
      <Markdown style={markdownStyles} rules={rules}>
        {processedContent}
      </Markdown>
    </View>
  );
};

const sourceLinkStyle = {
  color: colors.primary,
  fontSize: 14,
  fontWeight: '700' as const,
  textDecorationLine: 'underline' as const,
  paddingHorizontal: 2,
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
