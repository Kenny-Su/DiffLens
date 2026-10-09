import { diffWordsWithSpace } from 'diff';
import { randomUUID } from 'node:crypto';
import { revisionTarget } from '../shared/selection.js';
import type { Run, Rule, Edit, Segment, TextSelection } from '../shared/types.js';

export function createRevision(original: string, replacement: string, instruction: string, rules: Rule[], selection?: TextSelection): Run {
  const target = selection ? revisionTarget(original, selection) : { start: 0, end: original.length };
  const before = original.slice(target.start, target.end);
  const after = selection ? replacement.trim() : replacement;
  const revised = original.slice(0, target.start) + after + original.slice(target.end);
  if (original.length > 30000 || revised.length > 30000) throw new Error('Use a document of at most 30,000 characters.');
  const edits: Edit[] = [], segments: Segment[] = [];
  if (target.start) segments.push({ text: original.slice(0, target.start) });
  let offset = target.start;
  let pending: Edit | null = null;
  const flush = () => {
    if (!pending) return;
    edits.push(pending);
    segments.push({ editId: pending.id });
    pending = null;
  };
  const changes = diffWordsWithSpace(before, after, { timeout: 1000 });
  if (!changes) throw new Error('This revision has too many differences. Try revising a smaller selection.');
  for (const change of changes) {
    if (!change.added && !change.removed) {
      flush();
      segments.push({ text: change.value });
      offset += change.value.length;
      continue;
    }
    pending ??= { id: `e${edits.length + 1}`, before: '', after: '', start: offset, end: offset, decision: 'pending', feedback: '' };
    if (change.removed) {
      pending.before += change.value;
      offset += change.value.length;
      pending.end = offset;
    } else pending.after += change.value;
  }
  flush();
  if (target.end < original.length) segments.push({ text: original.slice(target.end) });
  return { id: randomUUID(), original, revised, instruction, rules, edits, segments, createdAt: new Date().toISOString(), ...(selection ? { selection } : {}) };
}
