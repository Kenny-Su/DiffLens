import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { createRevision, createDocumentDiff } from './core.js';
import { selectionError } from '../shared/selection.js';
import type { PassageUpdate, RevisionRequest, Run, Rule } from '../shared/types.js';
import { buildPassages } from '../shared/passages.js';
import { compose } from '../shared/compose.js';
import { getAudit } from '../shared/fidelity.js';
import { newAudit } from './fidelity.js';
import { createAuditWorker } from './audit-worker.js';
import * as modelService from './model.js';

type Models = Pick<typeof modelService, 'revise' | 'inferRule' | 'model' | 'audit'>;
export function createApp(db: DatabaseSync, models: Models = modelService, logger = true) {
  db.exec('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  const app = Fastify({ logger, bodyLimit: 1024 * 1024, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  app.setErrorHandler((error, _req, reply) => {
    const validation = error instanceof Error && 'validation' in error;
    reply.code(validation ? 400 : 502).send({ message: validation ? 'Invalid request. Check your input.' : error instanceof Error ? error.message : 'Request failed.' });
  });
  const recentRuns = () => db.prepare('SELECT body FROM runs ORDER BY rowid DESC LIMIT 20').all().map(row => JSON.parse(row.body as string) as Run);
  const findRun = (id: string): Run | null => {
    const row = db.prepare('SELECT body FROM runs WHERE id = ?').get(id);
    return row ? JSON.parse(row.body as string) as Run : null;
  };
  const saveRun = (run: Run) => {
    run.version = (run.version || 0) + 1;
    db.prepare('INSERT INTO runs VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body').run(run.id, JSON.stringify(run));
  };
  const worker = createAuditWorker({ get: findRun, save: saveRun, all: () => db.prepare('SELECT body FROM runs').all().map(row => JSON.parse(row.body as string) as Run) }, models.audit, error => app.log.error(error), models.model);
  app.addHook('onReady', async () => {
    for (const row of db.prepare('SELECT body FROM runs').all()) {
      const run = JSON.parse(row.body as string) as Run;
      let changed = false;
      if (!run.passages) { run.passages = buildPassages(run); changed = true; }
      for (const final of run.finalReviews || []) if (!final.passages) {
        final.passages = buildPassages({ ...run, revised: final.text, edits: final.edits, segments: final.segments }); changed = true;
      }
      if (changed) saveRun(run);
    }
    worker.recover();
  });
  app.addHook('onClose', async () => { worker.stop(); db.close(); });
  const ruleSchema = { type: 'object', additionalProperties: false, required: ['id', 'text', 'enabled'], properties: { id: { type: 'string', minLength: 1 }, text: { type: 'string', maxLength: 1000 }, enabled: { type: 'boolean' } } };
  app.post<{ Body: RevisionRequest }>('/api/runs', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['original', 'instruction', 'rules'], properties: {
      original: { type: 'string', minLength: 1, maxLength: 30000 }, instruction: { type: 'string', minLength: 1, maxLength: 5000 },
      rules: { type: 'array', maxItems: 50, items: ruleSchema },
      selection: { type: 'object', additionalProperties: false, required: ['start', 'end'], properties: { start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 } } },
    } } },
  }, async (req, reply) => {
    const { original, instruction, rules, selection } = req.body;
    if (!original.trim() || !instruction.trim()) return reply.code(400).send({ message: 'Enter text and an editing instruction.' });
    if (new Set(rules.map(rule => rule.id)).size !== rules.length) return reply.code(400).send({ message: 'Standing rules must have distinct IDs.' });
    if (selection) {
      const error = selectionError(original, selection);
      if (error) return reply.code(400).send({ message: error });
    }
    const replacement = await models.revise(original, instruction, rules, selection);
    const run = { ...createRevision(original, replacement, instruction, rules, selection), model: models.model, proposalAudit: newAudit(models.model), finalReviews: [] };
    saveRun(run);
    worker.enqueue(run.id, run.proposalAudit.id);
    return run;
  });
  app.get('/api/runs', async () => recentRuns());
  app.get<{ Params: { id: string } }>('/api/runs/:id', async (req, reply) => {
    return findRun(req.params.id) ?? reply.code(404).send({ message: 'Revision not found' });
  });
  app.post<{ Body: { rules?: Rule[] } }>('/api/rules/infer', { schema: { body: { type: 'object', additionalProperties: false, properties: { rules: { type: 'array', maxItems: 50, items: ruleSchema } } } } }, async req => ({ rule: await models.inferRule(recentRuns(), req.body.rules) }));
  type ReviewUpdate = { passages: PassageUpdate[]; restoreFinalReviewId?: never } | { restoreFinalReviewId: string; passages?: never };
  app.patch<{ Params: { id: string }; Body: ReviewUpdate }>('/api/runs/:id', {
    schema: { body: { type: 'object', additionalProperties: false, oneOf: [{ required: ['passages'] }, { required: ['restoreFinalReviewId'] }], properties: { passages: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'decision', 'feedback'], properties: {
      id: { type: 'string' }, decision: { enum: ['pending', 'accepted', 'rejected'] }, feedback: { type: 'string', maxLength: 5000 }, replacementText: { type: 'string', maxLength: 30000 },
    } } }, restoreFinalReviewId: { type: 'string' } } } },
  }, async (req, reply) => {
    const run = findRun(req.params.id);
    if (!run) return reply.code(404).send({ message: 'Revision not found' });
    if (req.body.passages) {
      const updates = req.body.passages;
      if (new Set(updates.map(update => update.id)).size !== updates.length || updates.some(update => !run.passages?.some(passage => passage.id === update.id) || (update.replacementText !== undefined && update.decision !== 'accepted'))) return reply.code(400).send({ message: 'Invalid passage decision or replacement.' });
      for (const update of updates) {
        const passage = run.passages!.find(passage => passage.id === update.id)!;
        for (const edit of run.edits) if (passage.editIds.includes(edit.id)) edit.decision = update.decision;
        (run.passageReviews ??= {})[passage.id] = { feedback: update.feedback, ...(update.replacementText !== undefined && update.replacementText !== passage.after ? { replacementText: update.replacementText } : {}) };
      }
    } else {
      const snapshot = run.finalReviews?.find(final => final.id === req.body.restoreFinalReviewId);
      if (!snapshot) return reply.code(404).send({ message: 'Saved result not found.' });
      for (const edit of run.edits) Object.assign(edit, snapshot.decisions.find(decision => decision.id === edit.id));
      run.passageReviews = structuredClone(snapshot.passageReviews ?? {});
    }
    if (compose(run).length > 30000) return reply.code(400).send({ message: 'Use a document of at most 30,000 characters. Your passage has not been applied.' });
    saveRun(run);
    return run;
  });
  app.post<{ Params: { id: string } }>('/api/runs/:id/finalize', async (req, reply) => {
    const run = findRun(req.params.id);
    if (!run) return reply.code(404).send({ message: 'Revision not found' });
    const replacements = (run.passages || []).filter(passage => run.passageReviews?.[passage.id]?.replacementText !== undefined).map(passage => ({ id: passage.id, replacementText: run.passageReviews![passage.id].replacementText }));
    const decisions = run.edits.map(({ id, decision }) => ({ id, decision }));
    const decisionKey = replacements.length ? JSON.stringify({ decisions, replacements }) : JSON.stringify(decisions);
    const existing = run.finalReviews?.find(review => review.decisionKey === decisionKey);
    if (existing) return { run, finalReviewId: existing.id };
    const text = compose(run), diff = createDocumentDiff(run.original, text, run.selection);
    const final = { id: randomUUID(), text, edits: diff.edits.map(edit => ({ ...edit, decision: 'accepted' as const })), segments: diff.segments,
      passages: buildPassages({ ...run, revised: text, ...diff }), passageReviews: structuredClone(run.passageReviews ?? {}),
      decisions: run.edits.map(({ id, decision }) => ({ id, decision })), decisionKey, createdAt: new Date().toISOString(), audit: newAudit(models.model) };
    (run.finalReviews ??= []).push(final);
    saveRun(run); worker.enqueue(run.id, final.audit.id);
    return { run, finalReviewId: final.id };
  });
  app.patch<{ Params: { id: string; passageId: string }; Body: { feedback: string } }>('/api/runs/:id/passages/:passageId/feedback', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['feedback'], properties: { feedback: { type: 'string', maxLength: 5000 } } } },
  }, async (req, reply) => {
    const run = findRun(req.params.id);
    if (!run?.passages?.some(passage => passage.id === req.params.passageId)) return reply.code(404).send({ message: 'Passage not found.' });
    const reviews = run.passageReviews ??= {};
    reviews[req.params.passageId] = { ...reviews[req.params.passageId], feedback: req.body.feedback };
    saveRun(run); return run;
  });
  app.post<{ Params: { id: string; auditId: string } }>('/api/runs/:id/audits/:auditId/retry', async (req, reply) => {
    const run = findRun(req.params.id), audit = run && getAudit(run, req.params.auditId);
    if (!run || !audit) return reply.code(404).send({ message: 'Fidelity check not found' });
    if (audit.status === 'failed') {
      audit.status = 'pending'; delete audit.error; delete audit.completedAt;
      saveRun(run); worker.enqueue(run.id, audit.id);
    }
    return run;
  });
  app.patch<{ Params: { id: string; auditId: string }; Body: { assessmentId: string; disagreed: boolean; text: string } }>('/api/runs/:id/audits/:auditId/feedback', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['assessmentId', 'disagreed', 'text'], properties: {
      assessmentId: { type: 'string' }, disagreed: { type: 'boolean' }, text: { type: 'string', maxLength: 5000 },
    } } },
  }, async (req, reply) => {
    const run = findRun(req.params.id), audit = run && getAudit(run, req.params.auditId);
    if (!run || !audit) return reply.code(404).send({ message: 'Fidelity check not found' });
    if (audit.status !== 'complete' || !audit.assessments.some(item => item.id === req.body.assessmentId)) return reply.code(400).send({ message: 'Assessment not found' });
    audit.feedback[req.body.assessmentId] = { disagreed: req.body.disagreed, text: req.body.text, updatedAt: new Date().toISOString() };
    saveRun(run); return run;
  });
  return Object.assign(app, { waitForAudits: worker.idle });
}
