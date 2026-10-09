import type { TextSelection } from '../../shared/types';

// Textareas don't expose selection rectangles. A hidden text mirror measures the
// same wrapping and scroll position without replacing the native editor.
export function selectionAnchor(editor: HTMLTextAreaElement, selection: TextSelection) {
  const bounds = editor.getBoundingClientRect();
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  for (const property of ['font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-indent', 'text-transform', 'direction', 'tab-size', 'word-break', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, {
    position: 'fixed', visibility: 'hidden', pointerEvents: 'none', margin: '0', border: '0',
    boxSizing: 'border-box', width: `${editor.clientWidth}px`,
    left: `${bounds.left + editor.clientLeft - editor.scrollLeft}px`,
    top: `${bounds.top + editor.clientTop - editor.scrollTop}px`,
    whiteSpace: editor.wrap === 'off' ? 'pre' : 'pre-wrap', overflowWrap: 'break-word',
  });
  mirror.setAttribute('aria-hidden', 'true');
  const selected = document.createElement('span');
  selected.textContent = editor.value.slice(selection.start, selection.end);
  mirror.append(editor.value.slice(0, selection.start), selected, editor.value.slice(selection.end));
  document.body.append(mirror);
  try {
    const rects = [...selected.getClientRects()];
    if (editor.selectionDirection !== 'backward') rects.reverse();
    const visibleRects = rects.filter(rect => rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right);
    const anchor = visibleRects[0] || rects[0];
    if (!anchor) return null;
    return {
      left: Math.max(bounds.left, Math.min(anchor.left, bounds.right)),
      top: Math.max(bounds.top, Math.min(anchor.top, bounds.bottom)),
      bottom: Math.max(bounds.top, Math.min(anchor.bottom, bounds.bottom)),
      visible: !!visibleRects.length,
      highlights: visibleRects.map(rect => ({
        left: Math.max(bounds.left, rect.left), top: Math.max(bounds.top, rect.top),
        width: Math.min(bounds.right, rect.right) - Math.max(bounds.left, rect.left),
        height: Math.min(bounds.bottom, rect.bottom) - Math.max(bounds.top, rect.top),
      })),
    };
  } finally { mirror.remove(); }
}
