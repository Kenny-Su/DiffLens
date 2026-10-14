import { needsAttention } from '../../shared/fidelity.js';
import type { Decision, FidelityAudit, Run } from '../../shared/types.js';
import { transformationSteps, type TransformationStep } from './transformation.js';

export function sentenceConcerns(step: TransformationStep | undefined, audit?: FidelityAudit) {
  if (!step || audit?.status !== 'complete') return [];
  return audit.assessments.filter(item => needsAttention(item) && item.editIds.some(id => step.editIds.includes(id)));
}

// Rebuild playback after a saved passage decision so rejected proposals and
// replaced model wording cannot reappear later in the animation.
export function resumeAfterDecision(run: Run, passageId: string, decision: Decision, replacementText?: string) {
  const passage = run.passages!.find(item => item.id === passageId)!;
  const reviews = { ...run.passageReviews };
  reviews[passageId] = { feedback: reviews[passageId]?.feedback ?? '', ...(decision === 'accepted' && replacementText !== undefined ? { replacementText } : {}) };
  const updated: Run = { ...run, passageReviews: reviews, edits: run.edits.map(edit => passage.editIds.includes(edit.id) ? { ...edit, decision } : edit) };
  const steps = transformationSteps(updated);
  const passageIndex = run.passages!.findIndex(item => item.id === passageId);
  const cursor = steps.findIndex(step => run.passages!.findIndex(item => item.id === step.passageId) >= passageIndex);
  return { run: updated, cursor: cursor < 0 ? steps.length : cursor };
}
