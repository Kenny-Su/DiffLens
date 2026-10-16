import type { Run } from '../../shared/types.js';
import { passageText } from '../../shared/passages.js';

export interface ReviewChunk { text: string; passageId?: string; start: number; passageOffset: number }
export interface PassageDecoration { id: string; label: string; selected: boolean; concern: boolean; draft: boolean }
export interface AnimationDecoration { id: string; start: number; end: number; caret?: number }

export function reviewDocument(run: Run, preview = true, overrides?: Record<string, string>) {
  let text = '', offset = 0;
  const spans = (run.passages || []).map(passage => {
    text += run.original.slice(offset, passage.start);
    const start = text.length;
    text += overrides?.[passage.id] ?? passageText(run, passage, preview);
    offset = passage.end;
    return { start, end: text.length, id: passage.id };
  });
  text += run.original.slice(offset);
  const boundaries = [0, ...[...text.matchAll(/(?:\r?\n[\t ]*){2,}/g)].map(match => match.index + match[0].length), text.length];
  const blocks: ReviewChunk[][] = [];
  for (let index = 1; index < boundaries.length; index++) {
    const start = boundaries[index - 1], end = boundaries[index];
    const chunks: ReviewChunk[] = [];
    let cursor = start;
    for (const span of spans) {
      const overlaps = span.start < end && span.end > start;
      const emptyHere = span.start === span.end && span.start >= start && (span.start < end || index === boundaries.length - 1 && span.start === end);
      if (!overlaps && !emptyHere) continue;
      const left = Math.max(start, span.start), right = Math.min(end, span.end);
      if (cursor < left) chunks.push({ text: text.slice(cursor, left), start: cursor, passageOffset: 0 });
      chunks.push({ text: text.slice(left, right), passageId: span.id, start: left, passageOffset: left - span.start });
      cursor = right;
    }
    if (cursor < end) chunks.push({ text: text.slice(cursor, end), start: cursor, passageOffset: 0 });
    if (chunks.length) blocks.push(chunks);
  }
  return { text, blocks };
}

export function chunkAnimation(chunk: ReviewChunk, animation?: AnimationDecoration) {
  if (!animation || chunk.passageId !== animation.id) return null;
  const start = Math.max(0, animation.start - chunk.passageOffset), end = Math.min(chunk.text.length, animation.end - chunk.passageOffset);
  if (end < start || animation.end < chunk.passageOffset || animation.start >= chunk.passageOffset + chunk.text.length) return null;
  const caret = animation.caret !== undefined && animation.caret >= chunk.passageOffset && animation.caret <= chunk.passageOffset + chunk.text.length
    ? Math.max(start, Math.min(end, animation.caret - chunk.passageOffset)) : undefined;
  return { start, end, caret };
}
