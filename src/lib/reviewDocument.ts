import { diffWordsWithSpace } from 'diff';
import type { Run } from '../../shared/types.js';
import { passagePending, passageText } from '../../shared/passages.js';

export interface ReviewPart { text: string; added?: boolean; removed?: boolean }
interface ReviewChunk { text: string; passageId?: string; start: number; parts?: ReviewPart[] }

export function reviewDocument(run: Run, preview = true, showResolved = false) {
  let text = '', offset = 0;
  const spans = (run.passages || []).map(passage => {
    text += run.original.slice(offset, passage.start);
    const start = text.length;
    const target = passageText(run, passage, preview);
    const parts = showResolved || passagePending(run, passage)
      ? (diffWordsWithSpace(passage.before, target, { timeout: 100 }) ?? [
        { value: passage.before, removed: true, added: false }, { value: target, added: true, removed: false },
      ]).filter(part => part.value).map(part => ({ text: part.value, added: part.added, removed: part.removed }))
      : undefined;
    text += parts ? parts.map(part => part.text).join('') : target;
    offset = passage.end;
    return { start, end: text.length, id: passage.id, parts };
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
      if (cursor < left) chunks.push({ text: text.slice(cursor, left), start: cursor });
      let partOffset = span.start;
      const parts = span.parts?.flatMap(part => {
        const partStart = partOffset; partOffset += part.text.length;
        const from = Math.max(left, partStart), to = Math.min(right, partOffset);
        return from < to ? [{ ...part, text: text.slice(from, to) }] : [];
      });
      chunks.push({ text: text.slice(left, right), passageId: span.id, start: left, parts });
      cursor = right;
    }
    if (cursor < end) chunks.push({ text: text.slice(cursor, end), start: cursor });
    if (chunks.length) blocks.push(chunks);
  }
  return { text, blocks };
}
