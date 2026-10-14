import type { ReviewPassage, Run } from '../../shared/types.js';
import { passageKey, proposedPassageText } from '../../shared/passages.js';
import type { Draft } from './draft.js';

export function unappliedPassage(run: Run, draft: Draft) {
  return run.passages?.find(passage => {
    const text = draft.passageDrafts[passageKey(run.id, passage.id)];
    return text !== undefined && text !== proposedPassageText(run, passage);
  });
}
export function updatePassageDraft(draft: Draft, run: Run, passage: ReviewPassage, text: string): Draft {
  const key = passageKey(run.id, passage.id), passageDrafts = { ...draft.passageDrafts };
  if (text === proposedPassageText(run, passage)) delete passageDrafts[key];
  else passageDrafts[key] = text;
  return { ...draft, passageDrafts };
}
// Clear only the text acknowledged by this request, never a newer local draft.
export function acknowledgeDrafts(current: Record<string, string>, sent: Record<string, string>, keys: string[]) {
  const next = { ...current };
  for (const key of keys) if (next[key] === sent[key]) delete next[key];
  return next;
}
