import type { Assessment, FidelityAudit, FinalReview, Rule, Run } from './types.js';
export const AUDIT_PROMPT_VERSION = 'fidelity-1';
export const defaultRules: Rule[] = [
  { id: 'scientific-claims', text: 'Preserve claim strength, uncertainty, attribution, and causal or comparative scope unless explicitly instructed to change them.', enabled: true },
  { id: 'scientific-numbers', text: 'Preserve numerical values, units, ranges, and statistical qualifiers unless explicitly instructed to change them.', enabled: true },
  { id: 'scientific-citations', text: 'Preserve citations and their association with claims unless explicitly instructed to change them.', enabled: true },
  { id: 'scientific-conditions', text: 'Preserve material conditions, limitations, and exceptions unless explicitly instructed to change them.', enabled: true },
];
export function needsAttention(assessment: Assessment) {
  return ['unacceptable', 'partial', 'unfulfilled', 'violated', 'uncertain', 'conflict'].includes(assessment.outcome);
}
export function isChecking(audit?: FidelityAudit) { return audit?.status === 'pending' || audit?.status === 'running'; }
export function auditLabel(audit?: FidelityAudit) {
  if (!audit) return 'Not checked';
  if (isChecking(audit)) return 'Checking…';
  if (audit.status === 'failed') return 'Check unavailable';
  const count = audit.assessments.filter(needsAttention).length;
  return count ? `${count} ${count === 1 ? 'finding' : 'findings'}` : 'No concerns found';
}
export function runAudits(run: Run) { return [run.proposalAudit, ...(run.finalReviews || []).map(review => review.audit)].filter((audit): audit is FidelityAudit => !!audit); }
export function getAudit(run: Run, auditId: string) { return runAudits(run).find(audit => audit.id === auditId); }
export function finalSnapshot(run: Run, review: FinalReview): Run {
  return { ...run, revised: review.text, edits: review.edits, segments: review.segments };
}
export function proposalSnapshot(run: Run, review: FinalReview): Run {
  return { ...run, edits: run.edits.map(edit => ({ ...edit, ...review.decisions.find(decision => decision.id === edit.id) })) };
}
// A slow poll or PATCH response must never replace a newer server version.
export function newerRun(current: Run, incoming: Run): Run { return (incoming.version ?? 0) >= (current.version ?? 0) ? incoming : current; }
