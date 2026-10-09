import { AUDIT_PROMPT_VERSION, getAudit, isChecking, runAudits } from '../shared/fidelity.js';
import type { FinalReview, Run } from '../shared/types.js';
import { validateAssessment } from './fidelity.js';

interface Store { get: (id: string) => Run | null; save: (run: Run) => void; all: () => Run[] }
export type Auditor = (run: Run, final?: FinalReview, signal?: AbortSignal) => Promise<unknown>;
export function createAuditWorker(store: Store, auditModel: Auditor, onError: (error: unknown) => void = console.error, model?: string) {
  const queue = new Map<string, { runId: string; auditId: string }>();
  let active = false, stopped = false;
  let controller: AbortController | null = null;
  const waiters = new Set<() => void>();
  function settle() { if ((!active && !queue.size) || stopped) { for (const resolve of waiters) resolve(); waiters.clear(); } }
  function enqueue(runId: string, auditId: string) {
    if (stopped) return;
    const key = `${runId}/${auditId}`;
    if (!queue.has(key)) queue.set(key, { runId, auditId });
    setImmediate(() => { void pump(); });
  }
  async function pump() {
    if (active || stopped) return;
    const next = queue.entries().next().value;
    if (!next) { settle(); return; }
    const [key, job] = next;
    active = true;
    try {
      const run = store.get(job.runId), audit = run && getAudit(run, job.auditId);
      if (!run || !audit || !isChecking(audit)) return;
      audit.status = 'running'; audit.attempt++; delete audit.error;
      audit.model = model; audit.promptVersion = AUDIT_PROMPT_VERSION;
      store.save(run);
      const attempt = audit.attempt;
      controller = new AbortController();
      let assessments: ReturnType<typeof validateAssessment> | undefined, error: string | undefined;
      try {
        const final = run.finalReviews?.find(review => review.audit.id === audit.id);
        assessments = validateAssessment(await auditModel(run, final, controller.signal), run, final);
      } catch (failure) { error = failure instanceof Error ? failure.message : 'Fidelity check unavailable.'; }
      if (stopped) return;
      // Reload after the model call: decisions and feedback may have changed meanwhile.
      const latest = store.get(job.runId), target = latest && getAudit(latest, job.auditId);
      if (!latest || !target || target.status !== 'running' || target.attempt !== attempt) return;
      target.status = assessments ? 'complete' : 'failed';
      target.completedAt = new Date().toISOString();
      if (assessments) target.assessments = assessments;
      else target.error = error || 'Fidelity check unavailable.';
      store.save(latest);
    } catch (error) {
      onError(error);
      try {
        if (!stopped) {
          const latest = store.get(job.runId), target = latest && getAudit(latest, job.auditId);
          if (latest && target) { target.status = 'failed'; target.error = 'The fidelity result could not be saved. Please retry.'; store.save(latest); }
        }
      } catch (failure) { onError(failure); }
    } finally {
      queue.delete(key); active = false; controller = null;
      if (!stopped && queue.size) setImmediate(() => { void pump(); });
      settle();
    }
  }
  return {
    enqueue,
    recover() {
      for (const run of store.all()) {
        let changed = false;
        for (const audit of runAudits(run)) {
          if (!isChecking(audit)) continue;
          audit.status = 'pending'; changed = true; enqueue(run.id, audit.id);
        }
        if (changed) store.save(run);
      }
    },
    stop() { stopped = true; controller?.abort(); queue.clear(); settle(); },
    idle: () => new Promise<void>(resolve => { waiters.add(resolve); settle(); }),
  };
}
