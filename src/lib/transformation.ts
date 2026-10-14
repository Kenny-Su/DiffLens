import { diffWordsWithSpace } from 'diff';
import { passageText } from '../../shared/passages.js';
import type { Run } from '../../shared/types.js';

export interface TransformationStep {
  passageId: string;
  before: string;
  after: string;
  start: number;
  removed: string;
  added: string;
  sentenceId: string;
  sentenceStart: number;
  sentenceEnd: number;
  editIds: string[];
}
// Playback reconstructs a transition, not the model's generation process.
export function transformationSteps(run: Run, preview = true): TransformationStep[] {
  const steps: TransformationStep[] = [];
  for (const passage of run.passages || []) {
    const target = passageText(run, passage, preview);
    const parts = diffWordsWithSpace(passage.before, target, { timeout: 100 });
    const sourceBoundaries = new Set([0, passage.before.length, ...Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(passage.before), item => item.index)]);
    const targetBoundaries = new Set([0, target.length, ...Array.from(new Intl.Segmenter('en', { granularity: 'sentence' }).segment(target), item => item.index)]);
    const anchors = [{ source: 0, target: 0 }];
    let sourceOffset = 0, targetOffset = 0;
    for (const part of parts || []) {
      if (!part.added && !part.removed) {
        for (const boundary of sourceBoundaries) {
          const mapped = targetOffset + boundary - sourceOffset;
          if (boundary > 0 && boundary < passage.before.length && boundary >= sourceOffset && boundary <= sourceOffset + part.value.length && targetBoundaries.has(mapped)) anchors.push({ source: boundary, target: mapped });
        }
      }
      if (!part.added) sourceOffset += part.value.length;
      if (!part.removed) targetOffset += part.value.length;
    }
    anchors.push({ source: passage.before.length, target: target.length });
    const ordered = anchors.sort((a, b) => a.source - b.source || a.target - b.target).filter((anchor, index, all) => !index || anchor.source !== all[index - 1].source || anchor.target !== all[index - 1].target);
    let text = passage.before;
    for (let group = 1; group < ordered.length; group++) {
      const left = ordered[group - 1], right = ordered[group];
      const original = passage.before.slice(left.source, right.source), revised = target.slice(left.target, right.target);
      if (original === revised) continue;
      const changes = diffWordsWithSpace(original, revised, { timeout: 100 }) || [{ value: original, removed: true }, { value: revised, added: true }];
      let offset = left.target, sentenceLength = original.length;
      for (let index = 0; index < changes.length;) {
        const part = changes[index];
        if (!part.added && !part.removed) { offset += part.value.length; index++; continue; }
        let removed = '', added = '';
        while (index < changes.length && (changes[index].added || changes[index].removed)) {
          const changed = changes[index++];
          if (changed.removed) removed += changed.value;
          else added += changed.value;
        }
        const after = text.slice(0, offset) + added + text.slice(offset + removed.length);
        steps.push({ passageId: passage.id, before: text, after, start: offset, removed, added,
          sentenceId: `${passage.id}/${group}`, sentenceStart: left.target, sentenceEnd: left.target + sentenceLength,
          editIds: run.edits.filter(edit => passage.editIds.includes(edit.id) && (
            edit.start === edit.end
              ? edit.start >= passage.start + left.source && (edit.start < passage.start + right.source || right.source === passage.before.length && edit.start === passage.end)
              : edit.start < passage.start + right.source && edit.end > passage.start + left.source
          )).map(edit => edit.id) });
        text = after; offset += added.length; sentenceLength += added.length - removed.length;
      }
    }
  }
  return steps;
}

export function characters(text: string): string[] {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), item => item.segment);
}

export function transformationFrame(step: TransformationStep, phase: 'highlight' | 'out' | 'in', progress: number) {
  const removed = characters(step.removed), added = characters(step.added);
  const remaining = phase === 'highlight' ? step.removed : phase === 'out' ? removed.slice(0, Math.max(0, removed.length - progress)).join('') : '';
  const inserted = phase === 'in' ? added.slice(0, progress).join('') : '';
  const replacement = remaining + inserted;
  return {
    text: step.before.slice(0, step.start) + replacement + step.before.slice(step.start + step.removed.length),
    start: step.sentenceStart,
    end: step.sentenceEnd - step.removed.length + replacement.length,
    caret: step.start + replacement.length,
  };
}
