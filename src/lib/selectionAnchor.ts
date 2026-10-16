import type { TextSelection } from '../../shared/types.js';

// Native textareas normalize line endings. Keep offsets into legacy CRLF drafts
// correct until the user's first input stores the native value.
export function sourceOffset(text: string, nativeOffset: number) {
  let source = 0;
  for (let native = 0; native < nativeOffset && source < text.length; native++, source++) {
    if (text[source] === '\r' && text[source + 1] === '\n') source++;
  }
  return source;
}
export function textareaOffset(text: string, source: number) {
  return text.slice(0, source).replace(/\r\n/g, '\n').length;
}

export function selectionAnchor(input: HTMLTextAreaElement, selection: TextSelection, text: string) {
  const from = textareaOffset(text, selection.start), to = textareaOffset(text, selection.end);
  if (from < 0 || to > input.value.length || from >= to) return null;
  const bounds = input.getBoundingClientRect(), style = getComputedStyle(input);
  // The browser doesn't expose textarea range rectangles. A temporary, invisible
  // mirror measures the native text using the exact font, wrapping and scroll.
  const mirror = document.createElement('div');
  for (const property of ['box-sizing', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-indent', 'text-transform', 'tab-size', 'direction', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'white-space', 'overflow-wrap', 'word-break']) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, { position: 'fixed', visibility: 'hidden', pointerEvents: 'none', border: '0', margin: '0',
    left: `${bounds.left - input.scrollLeft}px`, top: `${bounds.top - input.scrollTop}px`, width: `${input.clientWidth}px` });
  mirror.setAttribute('aria-hidden', 'true');
  const node = document.createTextNode(input.value + '\u200b');
  mirror.append(node); document.body.append(mirror);
  try {
    const range = document.createRange();
    range.setStart(node, from); range.setEnd(node, to);
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    if (input.selectionDirection !== 'backward') rects.reverse();
    const scrollBounds = {
      top: Math.max(0, bounds.top + parseFloat(style.paddingTop)), bottom: Math.min(window.innerHeight, bounds.bottom - parseFloat(style.paddingBottom)),
      left: bounds.left + parseFloat(style.paddingLeft), right: bounds.right - parseFloat(style.paddingRight),
    };
    const visibleRects = rects.filter(rect => rect.bottom > scrollBounds.top && rect.top < scrollBounds.bottom && rect.right > scrollBounds.left && rect.left < scrollBounds.right);
    const anchor = visibleRects[0] || rects[0];
    if (!anchor) return null;
    return {
      left: Math.max(scrollBounds.left, Math.min(anchor.left, scrollBounds.right)),
      top: Math.max(scrollBounds.top, Math.min(anchor.top, scrollBounds.bottom)),
      bottom: Math.max(scrollBounds.top, Math.min(anchor.bottom, scrollBounds.bottom)), visible: !!visibleRects.length,
      highlights: visibleRects.map(rect => ({ left: Math.max(scrollBounds.left, rect.left), top: Math.max(scrollBounds.top, rect.top),
        width: Math.min(scrollBounds.right, rect.right) - Math.max(scrollBounds.left, rect.left), height: Math.min(scrollBounds.bottom, rect.bottom) - Math.max(scrollBounds.top, rect.top) })),
    };
  } finally { mirror.remove(); }
}
