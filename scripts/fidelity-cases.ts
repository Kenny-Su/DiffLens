import { createRevision } from '../server/core.js';
import { newAudit } from '../server/fidelity.js';
import { compose } from '../shared/compose.js';
import { defaultRules } from '../shared/fidelity.js';
import type { Decision, FinalReview, Rule } from '../shared/types.js';
interface Case {
  id: string; original: string; proposed: string; instruction: string; concern: boolean; requestGap?: boolean;
  rules?: Rule[]; decide?: (before: string) => Decision; manual?: string;
}
export const fidelityCases: Case[] = [
  { id: 'lost-hedge', original: 'The intervention may reduce error.', proposed: 'The intervention reduces error.', instruction: 'Improve readability without changing the meaning.', concern: true },
  { id: 'changed-value', original: 'Accuracy increased by 5.2 percentage points.', proposed: 'Accuracy increased by 5 percentage points.', instruction: 'Make the sentence more concise.', concern: true },
  { id: 'omitted-condition', original: 'The method improves recall only when at least 100 labeled examples are available.', proposed: 'The method improves recall.', instruction: 'Tighten the wording while preserving the finding.', concern: true },
  { id: 'changed-citation', original: 'The baseline follows Smith et al. [3].', proposed: 'The baseline follows Smith et al. [4].', instruction: 'Polish the wording. Do not alter citations.', concern: true },
  { id: 'prohibition', original: 'We observe a small improvement in recall.', proposed: 'We demonstrate a major improvement in recall.', instruction: 'Improve flow, but do not strengthen the claim.', concern: true },
  { id: 'authorized-meaning-change', original: 'The intervention may reduce error.', proposed: 'The intervention reduces error.', instruction: 'Remove the hedge: replace “may reduce” with “reduces”.', concern: false },
  { id: 'fulfilled-concision', original: 'In order to estimate accuracy, we used cross-validation.', proposed: 'To estimate accuracy, we used cross-validation.', instruction: 'Replace “In order to” with “To”; leave the rest unchanged.', concern: false },
  { id: 'ignored-request', original: 'In order to estimate accuracy, we used cross-validation.', proposed: 'In order to estimate accuracy, we used cross-validation.', instruction: 'Replace “In order to” with “To”.', concern: true, requestGap: true },
  { id: 'conflicting-rule', original: 'The score was 5.2.', proposed: 'The score was 5.', instruction: 'Round the score to a whole number.', rules: [{ id: 'numbers', text: 'Never change any numerical value.', enabled: true }], concern: true },
  { id: 'human-over-rejection', original: 'In order to estimate accuracy, we used cross-validation.', proposed: 'To estimate accuracy, we used cross-validation.', instruction: 'Replace “In order to” with “To”.', decide: () => 'rejected', concern: true, requestGap: true },
  { id: 'mixed-decisions', original: 'The models are reliable.', proposed: 'The model is reliable.', instruction: 'Rewrite this statement to refer to one model, using correct singular grammar.', decide: before => before === 'models' ? 'accepted' : 'rejected', concern: true, requestGap: true },
  { id: 'retained-number-violation', original: 'The intervention may improve accuracy by 5%.', proposed: 'The intervention improves accuracy by 6%.', instruction: 'Remove the hedge but do not change the numerical value.', decide: () => 'accepted', concern: true },
  { id: 'manual-strengthening', original: 'The method may improve recall by 5%.', proposed: 'The method may increase recall by 5%.', manual: 'The method increases recall by 5%.', instruction: 'Replace “improve” with “increase” without changing claim strength.', concern: true },
  { id: 'manual-correction', original: 'The method may improve recall by 5%.', proposed: 'The method increases recall by 6%.', manual: 'The method may increase recall by 5%.', instruction: 'Replace “improve” with “increase” without changing claim strength or numerical values.', concern: false },
];
export function caseRun(item: Case) {
  const run = createRevision(item.original, item.proposed, item.instruction, item.rules ?? defaultRules);
  let final: FinalReview | undefined;
  if (item.decide || item.manual !== undefined) {
    run.edits.forEach(edit => { edit.decision = item.decide?.(edit.before) ?? 'accepted'; });
    if (item.manual !== undefined) run.passageReviews = { [run.passages![0].id]: { replacementText: item.manual, feedback: '' } };
    const text = compose(run), diff = createRevision(run.original, text, run.instruction, run.rules);
    final = { id: item.id, text, edits: diff.edits, segments: diff.segments, passages: diff.passages, passageReviews: structuredClone(run.passageReviews ?? {}), decisions: run.edits.map(({ id, decision, feedback }) => ({ id, decision, feedback })), decisionKey: item.id, createdAt: new Date().toISOString(), audit: newAudit() };
  }
  return { run, final };
}
