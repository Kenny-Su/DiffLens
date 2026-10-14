import type { ReviewPassage, Run } from './types.js';
import { revisionTarget } from './selection.js';

// Sentence segmentation is a viewing aid. All replacement boundaries still come
// from exact, matching diff anchors, never from normalized text.
function boundaries(text: string) {
  const result = new Set([0, text.length]);
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  for (const { index } of segmenter.segment(text)) {
    const previous = text.slice(0, index).trimEnd();
    if (!/(?:\b(?:Dr|Mr|Mrs|Ms|Prof|Fig|Figs|Eq|Eqs|Ref|Refs|vs|al)\.|\b[A-Z]\.|\be\.g\.|\bi\.e\.)$/i.test(previous)) result.add(index);
  }
  for (const match of text.matchAll(/(?:\r?\n[\t ]*){2,}/g)) result.add(match.index + match[0].length);
  return result;
}

export function buildPassages(run: Pick<Run, 'original' | 'revised' | 'selection' | 'edits' | 'segments'>): ReviewPassage[] {
  const { original, revised, edits, segments, selection } = run;
  if (!edits.length) return [];
  const target = selection ? revisionTarget(original, selection) : { start: 0, end: original.length };
  const revisedEnd = revised.length - (original.length - target.end);
  const originalBoundaries = boundaries(original), revisedBoundaries = boundaries(revised);
  const anchors = [{ before: target.start, after: target.start }];
  const positions = new Map<string, { before: number; after: number; beforeEnd: number; afterEnd: number }>();
  const byId = new Map(edits.map(edit => [edit.id, edit]));
  let before = 0, after = 0;
  for (const segment of segments) {
    if (segment.text !== undefined) {
      for (const boundary of originalBoundaries) {
        const mapped = after + boundary - before;
        if (boundary > target.start && boundary < target.end && boundary >= before && boundary <= before + segment.text.length && revisedBoundaries.has(mapped)) {
          anchors.push({ before: boundary, after: mapped });
        }
      }
      before += segment.text.length; after += segment.text.length;
    } else {
      const edit = byId.get(segment.editId!)!;
      positions.set(edit.id, { before, after, beforeEnd: before + edit.before.length, afterEnd: after + edit.after.length });
      before += edit.before.length; after += edit.after.length;
    }
  }
  anchors.push({ before: target.end, after: revisedEnd });
  const ordered = anchors.sort((a, b) => a.before - b.before || a.after - b.after).filter((anchor, index, all) => !index || anchor.before !== all[index - 1].before || anchor.after !== all[index - 1].after);
  const passages: ReviewPassage[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const start = ordered[index - 1], end = ordered[index];
    const ids = edits.filter(edit => {
      const position = positions.get(edit.id)!;
      return position.before >= start.before && position.beforeEnd <= end.before && position.after >= start.after && position.afterEnd <= end.after
        && (position.before < end.before || position.after < end.after);
    }).map(edit => edit.id);
    if (!ids.length) continue;
    let left = start.before, revisedLeft = start.after, right = end.before, revisedRight = end.after;
    const firstEdit = positions.get(ids[0])!, lastEdit = positions.get(ids.at(-1)!)!;
    // Unchanged separators belong to the document, not the editable sentence.
    // Changed whitespace remains inside the passage and is still reviewable.
    while (left < firstEdit.before && revisedLeft < firstEdit.after && /\s/u.test(original[left]) && original[left] === revised[revisedLeft]) { left++; revisedLeft++; }
    while (right > lastEdit.beforeEnd && revisedRight > lastEdit.afterEnd && /\s/u.test(original[right - 1]) && original[right - 1] === revised[revisedRight - 1]) { right--; revisedRight--; }
    passages.push({ id: `p${passages.length + 1}`, start: left, end: right, revisedStart: revisedLeft, revisedEnd: revisedRight,
      before: original.slice(left, right), after: revised.slice(revisedLeft, revisedRight), editIds: ids });
  }
  // A defensive full-target fallback also covers pure insertions at document
  // boundaries and avoids ever dropping a change on an ambiguous anchor.
  const covered = passages.flatMap(passage => passage.editIds);
  if (covered.length !== edits.length || new Set(covered).size !== edits.length) {
    return [{ id: 'p1', start: target.start, end: target.end, revisedStart: target.start, revisedEnd,
      before: original.slice(target.start, target.end), after: revised.slice(target.start, revisedEnd), editIds: edits.map(edit => edit.id) }];
  }
  return passages;
}

export function passageState(run: Run, passage: ReviewPassage) {
  const decisions = run.edits.filter(edit => passage.editIds.includes(edit.id)).map(edit => edit.decision);
  return decisions.every(value => value === decisions[0]) ? decisions[0] : 'mixed';
}
export function passagePending(run: Run, passage: ReviewPassage) {
  return run.edits.some(edit => passage.editIds.includes(edit.id) && edit.decision === 'pending');
}
export function passageText(run: Run, passage: ReviewPassage, preview = false): string {
  const replacement = run.passageReviews?.[passage.id]?.replacementText;
  if (replacement !== undefined) return replacement;
  if (preview && passageState(run, passage) === 'pending') return passage.after;
  let position = passage.start, text = '';
  for (const edit of run.edits.filter(edit => passage.editIds.includes(edit.id))) {
    text += run.original.slice(position, edit.start) + (edit.decision === 'accepted' ? edit.after : edit.before);
    position = edit.end;
  }
  return text + run.original.slice(position, passage.end);
}
export function passageKey(runId: string, passageId: string) { return `${runId}/${passageId}`; }
export function proposedPassageText(run: Run, passage: ReviewPassage) { return run.passageReviews?.[passage.id]?.replacementText ?? passage.after; }
