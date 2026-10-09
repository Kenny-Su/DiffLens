import type { TextSelection } from './types.js';

export function selectionError(text: string, selection: TextSelection): string | null {
  const { start, end } = selection;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return 'Select a nonempty range within the document.';
  const splitsPair = (index: number) => /[\uD800-\uDBFF]/.test(text[index - 1] || '') && /[\uDC00-\uDFFF]/.test(text[index] || '');
  if (splitsPair(start) || splitsPair(end)) return 'Select complete characters.';
  if (!text.slice(start, end).trim()) return 'Select some text, rather than whitespace alone.';
  return null;
}

// Keep the selected passage's surrounding whitespace outside the replacement.
export function revisionTarget(text: string, selection: TextSelection): TextSelection {
  const error = selectionError(text, selection);
  if (error) throw new Error(error);
  const selected = text.slice(selection.start, selection.end);
  return {
    start: selection.start + selected.length - selected.trimStart().length,
    end: selection.end - (selected.length - selected.trimEnd().length),
  };
}
