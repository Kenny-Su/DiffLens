import type { Editor } from '@tiptap/react';
import type { TextSelection } from '../../shared/types';
import { projectDocument } from './richText';

export function selectionAnchor(editor: Editor, selection: TextSelection) {
  const { positions } = projectDocument(editor.state.doc);
  const from = positions[selection.start], to = positions[selection.end];
  if (from === undefined || to === undefined) return null;
  const bounds = editor.view.dom.getBoundingClientRect();
  const scrollBounds = editor.view.dom.closest('.simple-editor-wrapper')?.getBoundingClientRect() ?? bounds;
  const start = editor.view.domAtPos(from), end = editor.view.domAtPos(to);
  const range = document.createRange();
  range.setStart(start.node, start.offset); range.setEnd(end.node, end.offset);
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
  if (editor.state.selection.anchor <= editor.state.selection.head) rects.reverse();
  const visibleRects = rects.filter(rect => rect.bottom > scrollBounds.top && rect.top < scrollBounds.bottom && rect.right > bounds.left && rect.left < bounds.right);
  const anchor = visibleRects[0] || rects[0];
  if (!anchor) return null;
  return {
    left: Math.max(bounds.left, Math.min(anchor.left, bounds.right)),
    top: Math.max(scrollBounds.top, Math.min(anchor.top, scrollBounds.bottom)),
    bottom: Math.max(scrollBounds.top, Math.min(anchor.bottom, scrollBounds.bottom)),
    visible: !!visibleRects.length,
    highlights: visibleRects.map(rect => ({ left: Math.max(bounds.left, rect.left), top: Math.max(scrollBounds.top, rect.top),
      width: Math.min(bounds.right, rect.right) - Math.max(bounds.left, rect.left), height: Math.min(scrollBounds.bottom, rect.bottom) - Math.max(scrollBounds.top, rect.top) })),
  };
}
