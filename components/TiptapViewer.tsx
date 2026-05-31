/**
 * TiptapViewer.tsx
 *
 * Read-only renderer for Tiptap JSON documents in React Native.
 * Renders rich text (bold, italic, headings, lists, checklists, etc.)
 * using native RN components.
 *
 * When `numberOfLines` is provided, falls back to plain-text truncation
 * because RN cannot truncate rich inline content reliably.
 */

import React from 'react';
import { View, Text, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { colors } from '@/styles/commonStyles';
import type { TiptapDoc, TiptapNode } from '@/types/Note';
import { tiptapToPlainText } from '@/utils/tiptapPlainText';

// ─── props ────────────────────────────────────────────────────────────────────

interface TiptapViewerProps {
  doc?: TiptapDoc | null;
  fallbackText?: string;
  numberOfLines?: number;
  style?: TextStyle;
}

// ─── mark helpers ─────────────────────────────────────────────────────────────

function getMarkStyle(marks?: Array<{ type: string; attrs?: Record<string, any> }>): TextStyle {
  if (!marks || marks.length === 0) {
    return {};
  }
  const style: TextStyle = {};
  for (const mark of marks) {
    if (mark.type === 'bold') {
      style.fontWeight = 'bold';
    }
    if (mark.type === 'italic') {
      style.fontStyle = 'italic';
    }
    if (mark.type === 'underline') {
      style.textDecorationLine = 'underline';
    }
    if (mark.type === 'strike') {
      style.textDecorationLine = 'line-through';
    }
    if (mark.type === 'code') {
      style.fontFamily = 'Courier';
      style.backgroundColor = '#2a2a2a';
    }
  }
  return style;
}

// ─── inline renderer (returns Text nodes) ────────────────────────────────────

function renderInlineNodes(nodes: TiptapNode[] | undefined): React.ReactNode[] {
  if (!nodes || nodes.length === 0) {
    return [];
  }
  return nodes.map((node, idx) => {
    if (node.type === 'text') {
      const markStyle = getMarkStyle(node.marks);
      return (
        <Text key={idx} style={[styles.inlineText, markStyle]}>
          {node.text ?? ''}
        </Text>
      );
    }
    if (node.type === 'hardBreak') {
      return <Text key={idx}>{'\n'}</Text>;
    }
    // Fallback: recurse
    if (node.content) {
      return <React.Fragment key={idx}>{renderInlineNodes(node.content)}</React.Fragment>;
    }
    return null;
  });
}

// ─── block renderer ───────────────────────────────────────────────────────────

function renderNode(node: TiptapNode, idx: number, listContext?: 'bullet' | 'ordered' | 'task', listIndex?: number): React.ReactNode {
  switch (node.type) {
    case 'paragraph': {
      const children = renderInlineNodes(node.content);
      const hasContent = node.content && node.content.length > 0;
      if (!hasContent) {
        return <Text key={idx} style={styles.paragraph}>{' '}</Text>;
      }
      return (
        <Text key={idx} style={styles.paragraph}>
          {children}
        </Text>
      );
    }

    case 'heading': {
      const level = node.attrs?.level ?? 1;
      const headingStyle = getHeadingStyle(level);
      const children = renderInlineNodes(node.content);
      return (
        <Text key={idx} style={[styles.heading, headingStyle]}>
          {children}
        </Text>
      );
    }

    case 'bulletList': {
      return (
        <View key={idx} style={styles.list}>
          {(node.content ?? []).map((child, childIdx) =>
            renderNode(child, childIdx, 'bullet')
          )}
        </View>
      );
    }

    case 'orderedList': {
      return (
        <View key={idx} style={styles.list}>
          {(node.content ?? []).map((child, childIdx) =>
            renderNode(child, childIdx, 'ordered', childIdx + 1)
          )}
        </View>
      );
    }

    case 'taskList': {
      return (
        <View key={idx} style={styles.list}>
          {(node.content ?? []).map((child, childIdx) =>
            renderNode(child, childIdx, 'task')
          )}
        </View>
      );
    }

    case 'listItem': {
      const prefix = listContext === 'bullet' ? '• ' : listContext === 'ordered' ? `${listIndex ?? 1}. ` : '';
      const innerText = (node.content ?? []).map((child, childIdx) => {
        if (child.type === 'paragraph') {
          return renderInlineNodes(child.content);
        }
        return renderNode(child, childIdx);
      });
      return (
        <View key={idx} style={styles.listItemRow}>
          <Text style={styles.listItemPrefix}>{prefix}</Text>
          <Text style={styles.listItemText}>{innerText}</Text>
        </View>
      );
    }

    case 'taskItem': {
      const checked = node.attrs?.checked === true;
      const checkboxText = checked ? '☑' : '☐';
      const checkboxColor = checked ? colors.primary : colors.textSecondary;
      const innerText = (node.content ?? []).map((child, childIdx) => {
        if (child.type === 'paragraph') {
          return renderInlineNodes(child.content);
        }
        return renderNode(child, childIdx);
      });
      return (
        <View key={idx} style={styles.listItemRow}>
          <Text style={[styles.checkboxIcon, { color: checkboxColor }]}>{checkboxText}</Text>
          <Text style={[styles.listItemText, checked && styles.taskItemChecked]}>{innerText}</Text>
        </View>
      );
    }

    case 'blockquote': {
      return (
        <View key={idx} style={styles.blockquote}>
          {(node.content ?? []).map((child, childIdx) => renderNode(child, childIdx))}
        </View>
      );
    }

    case 'codeBlock': {
      const codeText = (node.content ?? [])
        .filter(n => n.type === 'text')
        .map(n => n.text ?? '')
        .join('');
      return (
        <View key={idx} style={styles.codeBlock}>
          <Text style={styles.codeText}>{codeText}</Text>
        </View>
      );
    }

    case 'horizontalRule': {
      return <View key={idx} style={styles.horizontalRule} />;
    }

    case 'hardBreak': {
      return <Text key={idx}>{'\n'}</Text>;
    }

    default: {
      // Unknown block — recurse
      if (node.content && node.content.length > 0) {
        return (
          <View key={idx}>
            {node.content.map((child, childIdx) => renderNode(child, childIdx))}
          </View>
        );
      }
      return null;
    }
  }
}

function getHeadingStyle(level: number): TextStyle {
  const sizes: Record<number, number> = { 1: 24, 2: 20, 3: 18, 4: 16, 5: 15, 6: 14 };
  return {
    fontSize: sizes[level] ?? 16,
    fontWeight: 'bold',
  };
}

// ─── main component ───────────────────────────────────────────────────────────

export function TiptapViewer({ doc, fallbackText, numberOfLines, style }: TiptapViewerProps) {
  const hasContent = doc && doc.content && doc.content.length > 0;

  // When numberOfLines is set, fall back to plain text truncation
  if (numberOfLines !== undefined) {
    const plainText = hasContent ? tiptapToPlainText(doc) : (fallbackText ?? '');
    return (
      <Text style={[styles.fallbackText, style]} numberOfLines={numberOfLines}>
        {plainText}
      </Text>
    );
  }

  // No doc or empty doc — render fallback
  if (!hasContent) {
    if (!fallbackText) {
      return null;
    }
    return (
      <Text style={[styles.fallbackText, style]}>
        {fallbackText}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {(doc.content ?? []).map((node, idx) => renderNode(node, idx))}
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    // no extra padding — caller controls layout
  } as ViewStyle,
  fallbackText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  inlineText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginBottom: 4,
  },
  heading: {
    color: colors.text,
    marginBottom: 6,
    marginTop: 4,
  },
  list: {
    marginBottom: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  listItemPrefix: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    marginRight: 4,
    minWidth: 20,
  },
  listItemText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  checkboxIcon: {
    fontSize: 16,
    lineHeight: 22,
    marginRight: 6,
    minWidth: 20,
  },
  taskItemChecked: {
    textDecorationLine: 'line-through',
    color: colors.textSecondary,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: 12,
    marginBottom: 4,
    opacity: 0.85,
  },
  codeBlock: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 4,
  },
  codeText: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: '#e0e0e0',
    lineHeight: 20,
  },
  horizontalRule: {
    height: 1,
    backgroundColor: colors.border ?? '#333',
    marginVertical: 8,
  },
});
