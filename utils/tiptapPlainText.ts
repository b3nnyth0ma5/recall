/**
 * tiptapPlainText.ts
 *
 * Utilities for converting Tiptap JSON documents to plain text and vice-versa.
 * The plain-text output is used to keep the `text` column populated for
 * embeddings and search — every text leaf in the doc must appear in the output.
 *
 * @example Plain paragraph
 * tiptapToPlainText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] })
 * // => "Hello"
 *
 * @example Multi-paragraph
 * tiptapToPlainText({ type: 'doc', content: [
 *   { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
 *   { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
 * ] })
 * // => "First\nSecond"
 *
 * @example Checklist with mixed checked states
 * tiptapToPlainText({ type: 'doc', content: [{ type: 'taskList', content: [
 *   { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] }] },
 *   { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] }] },
 * ]}] })
 * // => "[x] Item one\n[ ] Item two"
 *
 * @example Bullet list
 * tiptapToPlainText({ type: 'doc', content: [{ type: 'bulletList', content: [
 *   { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
 *   { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
 *   { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] },
 * ]}] })
 * // => "• A\n• B\n• C"
 *
 * @example Heading + paragraph
 * tiptapToPlainText({ type: 'doc', content: [
 *   { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Heading' }] },
 *   { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] },
 * ] })
 * // => "Heading\n\nBody"
 */

import type { TiptapDoc, TiptapNode } from '@/types/Note';

// ─── internal walker ─────────────────────────────────────────────────────────

type WalkContext = {
  /** true when we are inside a bulletList (so listItem gets "• " prefix) */
  inBulletList: boolean;
  /** true when we are inside an orderedList */
  inOrderedList: boolean;
  /** 1-based counter for ordered list items */
  orderedIndex: number;
};

function walkNode(node: TiptapNode, ctx: WalkContext): string {
  switch (node.type) {
    case 'doc': {
      return walkChildren(node, ctx);
    }

    case 'paragraph': {
      const inner = walkChildren(node, ctx);
      return inner + '\n';
    }

    case 'heading': {
      const inner = walkChildren(node, ctx);
      return inner + '\n';
    }

    case 'blockquote': {
      const inner = walkChildren(node, ctx);
      return inner + '\n';
    }

    case 'codeBlock': {
      const inner = walkChildren(node, ctx);
      return inner + '\n';
    }

    case 'bulletList': {
      const childCtx: WalkContext = { inBulletList: true, inOrderedList: false, orderedIndex: 0 };
      return walkChildren(node, childCtx);
    }

    case 'orderedList': {
      const childCtx: WalkContext = { inBulletList: false, inOrderedList: true, orderedIndex: 0 };
      return walkChildren(node, childCtx);
    }

    case 'taskList': {
      const childCtx: WalkContext = { inBulletList: false, inOrderedList: false, orderedIndex: 0 };
      return walkChildren(node, childCtx);
    }

    case 'listItem': {
      const prefix = ctx.inBulletList ? '• ' : '';
      const inner = walkChildren(node, { ...ctx, inBulletList: false, inOrderedList: false });
      // walkChildren already appended \n from the inner paragraph
      return prefix + inner;
    }

    case 'taskItem': {
      const checked = node.attrs?.checked === true;
      const prefix = checked ? '[x] ' : '[ ] ';
      const inner = walkChildren(node, { ...ctx, inBulletList: false, inOrderedList: false });
      return prefix + inner;
    }

    case 'hardBreak': {
      return '\n';
    }

    case 'horizontalRule': {
      return '\n---\n';
    }

    case 'text': {
      return node.text ?? '';
    }

    default: {
      // Unknown node — recurse into children if present, else return empty
      if (node.content && node.content.length > 0) {
        return walkChildren(node, ctx);
      }
      return '';
    }
  }
}

function walkChildren(node: TiptapNode, ctx: WalkContext): string {
  if (!node.content || node.content.length === 0) {
    return '';
  }
  return node.content.map(child => walkNode(child, ctx)).join('');
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Convert a Tiptap JSON document to plain text.
 *
 * - Trimmed (no leading/trailing whitespace)
 * - 3+ consecutive newlines collapsed to 2
 * - Checklist semantics preserved: "[x] Buy milk\n[ ] Walk dog"
 * - 100% lossless on text leaves — every text node appears in the output
 */
export function tiptapToPlainText(doc: TiptapDoc | null | undefined): string {
  console.log('[tiptapPlainText] tiptapToPlainText called, doc type:', doc?.type);
  if (!doc) {
    return '';
  }
  const ctx: WalkContext = { inBulletList: false, inOrderedList: false, orderedIndex: 0 };
  const raw = walkNode(doc as TiptapNode, ctx);
  // Collapse 3+ consecutive newlines to 2
  const collapsed = raw.replace(/\n{3,}/g, '\n\n');
  return collapsed.trim();
}

/**
 * Returns an empty Tiptap document (a doc with a single empty paragraph).
 */
export function emptyTiptapDoc(): TiptapDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * Convert plain text to a Tiptap document.
 * Splits on double newlines to create paragraphs; single newlines become hardBreaks.
 */
export function plainTextToTiptapDoc(text: string): TiptapDoc {
  console.log('[tiptapPlainText] plainTextToTiptapDoc called, text length:', text?.length ?? 0);
  if (!text || !text.trim()) {
    return emptyTiptapDoc();
  }

  const paragraphBlocks = text.split(/\n\n+/);

  const content: TiptapNode[] = paragraphBlocks.map(block => {
    const lines = block.split('\n');
    const children: TiptapNode[] = [];

    lines.forEach((line, idx) => {
      if (line.length > 0) {
        children.push({ type: 'text', text: line });
      }
      // Add hardBreak between lines (but not after the last line)
      if (idx < lines.length - 1) {
        children.push({ type: 'hardBreak' });
      }
    });

    return {
      type: 'paragraph',
      content: children.length > 0 ? children : undefined,
    };
  });

  return { type: 'doc', content };
}
