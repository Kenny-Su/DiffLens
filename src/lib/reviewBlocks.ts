import { diffWordsWithSpace } from 'diff';
import { passageText } from '../../shared/passages.js';
import type { Run } from '../../shared/types.js';

export interface ReviewPart { text: string; added?: boolean; removed?: boolean }
export interface ReviewChunk { text: string; passageId?: string; parts?: ReviewPart[] }
export function reviewBlocks(run: Run, preview = true, wordDiff: boolean | ((passageId: string) => boolean) = false, overrides?: Record<string, string>): ReviewChunk[][] {
  const spans: { start: number; end: number; id: string; parts?: ReviewPart[] }[] = [];
  let text = '', offset = 0;
  for (const passage of run.passages || []) {
    text += run.original.slice(offset, passage.start);
    const start = text.length;
    const target = overrides?.[passage.id] ?? passageText(run, passage, preview);
    const parts = (typeof wordDiff === 'function' ? wordDiff(passage.id) : wordDiff) ? diffWordsWithSpace(passage.before, target, { timeout: 100 })?.map(part => ({ text: part.value, added: part.added, removed: part.removed })) : undefined;
    text += parts ? parts.map(part => part.text).join('') : target;
    spans.push({ start, end: text.length, id: passage.id, parts });
    offset = passage.end;
  }
  text += run.original.slice(offset);
  const boundaries = [0, ...[...text.matchAll(/(?:\r?\n[\t ]*){2,}/g)].map(match => match.index + match[0].length), text.length];
  const blocks: ReviewChunk[][] = [];
  for (let index = 1; index < boundaries.length; index++) {
    const start = boundaries[index - 1], end = boundaries[index];
    if (start === end && text.length && index !== boundaries.length - 1) continue;
    const chunks: ReviewChunk[] = [];
    let cursor = start;
    for (const span of spans) {
      if (span.start === span.end) {
        if (span.start >= start && (span.start < end || index === boundaries.length - 1 && span.start === end)) {
          if (cursor < span.start) chunks.push({ text: text.slice(cursor, span.start) });
          chunks.push({ text: '', passageId: span.id }); cursor = span.start;
        }
      } else if (span.start < end && span.end > start) {
        const left = Math.max(start, span.start), right = Math.min(end, span.end);
        if (cursor < left) chunks.push({ text: text.slice(cursor, left) });
        let partOffset = span.start;
        const parts = span.parts?.flatMap(part => {
          const partStart = partOffset; partOffset += part.text.length;
          const from = Math.max(left, partStart), to = Math.min(right, partOffset);
          return from < to ? [{ ...part, text: text.slice(from, to) }] : [];
        });
        chunks.push({ text: text.slice(left, right), passageId: span.id, parts }); cursor = right;
      }
    }
    if (cursor < end) chunks.push({ text: text.slice(cursor, end) });
    if (chunks.length) blocks.push(chunks);
  }
  return blocks;
}
