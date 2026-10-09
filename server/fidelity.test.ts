import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from './app.js';
import { createRevision } from './core.js';
import { auditInput, ruleEvidence, validateAssessment } from './fidelity.js';
import { defaultRules, needsAttention, newerRun, proposalSnapshot } from '../shared/fidelity.js';
import { api } from '../src/lib/api.js';
import type { FinalReview, FinalizeResponse, Run } from '../shared/types.js';
import type { Auditor } from './audit-worker.js';

function assessment(run: Run, final?: FinalReview) {
  return { assessments: [
    ...(final?.edits || run.edits).map(edit => ({ kind: 'edit', subjectId: edit.id, text: `Change ${edit.id}`, outcome: 'acceptable', reason: 'Serves the instruction.', editIds: [edit.id], proposalEditIds: [], ruleIds: [] })),
    ...run.rules.filter(rule => rule.enabled).map(rule => ({ kind: 'rule', subjectId: rule.id, text: rule.text, outcome: 'respected', reason: 'The target respects this rule.', editIds: [], proposalEditIds: [], ruleIds: [rule.id] })),
    { kind: 'request', subjectId: null, text: run.instruction, outcome: final && final.text === run.original ? 'unfulfilled' : 'fulfilled', reason: final ? 'Judged the actual assembled text.' : 'Judged the proposal.', editIds: [], proposalEditIds: final ? run.edits.map(edit => edit.id) : [], ruleIds: [] },
  ] };
}
const payload = { original: 'The result may improve accuracy by 5%.', instruction: 'Remove the hedge.', rules: [] };
function setup(audit: Auditor = async (run, final) => assessment(run, final), db = new DatabaseSync(':memory:')) {
  let revisions = 0;
  const app = createApp(db, { model: 'test', audit,
    async revise(original) { revisions++; return original.replace('may improve', 'improves'); },
    async inferRule(runs, rules = []) { return ruleEvidence(runs, rules).evidence.length >= 2 ? 'Preserve explicit qualifiers.' : null; },
  }, false);
  return { app, revisions: () => revisions };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('audit validation covers all edits/rules, rejects invented references and incompatible outcomes', () => {
  const run = createRevision(payload.original, 'The result improves accuracy by 6%.', payload.instruction, defaultRules);
  const valid = assessment(run);
  assert.equal(validateAssessment(valid, run).length, run.edits.length + defaultRules.length + 1);
  const mutations = [
    (data: typeof valid) => { data.assessments.shift(); },
    (data: typeof valid) => { data.assessments.push(data.assessments[0]); },
    (data: typeof valid) => { data.assessments[0].editIds = ['missing']; },
    (data: typeof valid) => { data.assessments[0].proposalEditIds = ['missing']; },
    (data: typeof valid) => { data.assessments[0].ruleIds = ['missing']; },
    (data: typeof valid) => { data.assessments[0].outcome = 'fulfilled'; },
    (data: typeof valid) => { data.assessments[0].reason = ''; },
    (data: typeof valid) => { data.assessments = data.assessments.filter(item => item.kind !== 'request'); },
  ];
  for (const mutate of mutations) { const data = structuredClone(valid); mutate(data); assert.throws(() => validateAssessment(data, run)); }
  assert.throws(() => validateAssessment({ ...valid, extra: true }, run));
  const uncertain = structuredClone(valid); uncertain.assessments[0].outcome = 'uncertain';
  assert.ok(needsAttention(validateAssessment(uncertain, run)[0]));
  const conflict = { kind: 'conflict', subjectId: null, text: 'Competing requirements', outcome: 'conflict', reason: 'Instruction and rule disagree.', editIds: [], proposalEditIds: [], ruleIds: [defaultRules[0].id] };
  assert.ok(validateAssessment({ assessments: [...valid.assessments, conflict] }, run).some(item => item.kind === 'conflict'));
  conflict.ruleIds = []; assert.throws(() => validateAssessment({ assessments: [...valid.assessments, conflict] }, run));
});

test('generation returns before audit; late audit cannot overwrite decisions or feedback', async t => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { app } = setup(async run => { await gate; return assessment(run); }); t.after(() => app.close());
  const run: Run = (await app.inject({ method: 'POST', url: '/api/runs', payload })).json();
  assert.equal(run.proposalAudit?.status, 'pending');
  await tick();
  const updates = run.edits.map(edit => ({ id: edit.id, decision: 'rejected', feedback: 'Keep my hedge.' }));
  const changed: Run = (await app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { edits: updates } })).json();
  assert.equal(changed.proposalAudit?.status, 'running');
  release(); await app.waitForAudits();
  const saved: Run = (await app.inject(`/api/runs/${run.id}`)).json();
  assert.equal(saved.proposalAudit?.status, 'complete');
  assert.equal(saved.edits[0].decision, 'rejected'); assert.equal(saved.edits[0].feedback, 'Keep my hedge.');
  assert.equal(newerRun(saved, changed), saved);
});

test('finalization is idempotent, preserves snapshots and reports over-rejection', async t => {
  const inputs: ReturnType<typeof auditInput>[] = [];
  const { app } = setup(async (run, final) => { inputs.push(auditInput(run, final)); return assessment(run, final); }); t.after(() => app.close());
  const run: Run = (await app.inject({ method: 'POST', url: '/api/runs', payload })).json();
  await app.waitForAudits();
  await app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { edits: run.edits.map(edit => ({ id: edit.id, decision: 'rejected', feedback: '' })) } });
  const finish = () => app.inject({ method: 'POST', url: `/api/runs/${run.id}/finalize` });
  const first: FinalizeResponse = (await finish()).json();
  const duplicate: FinalizeResponse = (await finish()).json();
  assert.equal(first.finalReviewId, duplicate.finalReviewId);
  assert.equal(first.run.finalReviews![0].text, run.original);
  await app.waitForAudits();
  let saved: Run = (await app.inject(`/api/runs/${run.id}`)).json();
  assert.equal(saved.finalReviews![0].audit.assessments.find(item => item.kind === 'request')?.outcome, 'unfulfilled');
  assert.equal(saved.proposalAudit!.assessments.find(item => item.kind === 'request')?.outcome, 'fulfilled');
  assert.deepEqual(inputs[1].decisions.map(item => item.decision), run.edits.map(() => 'rejected'));
  assert.equal(inputs[1].targetText, run.original);
  await app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { edits: run.edits.map(edit => ({ id: edit.id, decision: 'accepted', feedback: '' })) } });
  const second: FinalizeResponse = (await finish()).json();
  assert.notEqual(second.finalReviewId, first.finalReviewId);
  await app.waitForAudits(); saved = (await app.inject(`/api/runs/${run.id}`)).json();
  assert.equal(saved.finalReviews!.length, 2);
  assert.equal(saved.finalReviews![0].decisions[0].decision, 'rejected');
  assert.equal(saved.finalReviews![1].text, run.revised);
  assert.equal(proposalSnapshot(saved, saved.finalReviews![0]).edits[0].decision, 'rejected');
  assert.equal(saved.edits[0].decision, 'accepted');
});

test('malformed assessments fail visibly; retry deduplicates and never regenerates', async t => {
  let attempts = 0;
  const { app, revisions } = setup(async run => ++attempts === 1 ? { assessments: [] } : assessment(run)); t.after(() => app.close());
  const run: Run = (await app.inject({ method: 'POST', url: '/api/runs', payload })).json(); await app.waitForAudits();
  assert.equal(((await app.inject(`/api/runs/${run.id}`)).json() as Run).proposalAudit!.status, 'failed');
  const url = `/api/runs/${run.id}/audits/${run.proposalAudit!.id}/retry`;
  await Promise.all([app.inject({ method: 'POST', url }), app.inject({ method: 'POST', url })]);
  await app.waitForAudits();
  const saved: Run = (await app.inject(`/api/runs/${run.id}`)).json();
  assert.equal(saved.proposalAudit!.status, 'complete'); assert.equal(saved.proposalAudit!.attempt, 2);
  assert.equal(revisions(), 1); assert.equal(attempts, 2);
});

test('audit disagreements persist independently, can be undone, and inform rule evidence', async t => {
  const { app } = setup(); t.after(() => app.close());
  const run: Run = (await app.inject({ method: 'POST', url: '/api/runs', payload })).json(); await app.waitForAudits();
  const before: Run = (await app.inject(`/api/runs/${run.id}`)).json(), audit = before.proposalAudit!;
  const url = `/api/runs/${run.id}/audits/${audit.id}/feedback`;
  const note = { assessmentId: audit.assessments[0].id, disagreed: true, text: 'I asked to preserve the qualifier.' };
  let saved: Run = (await app.inject({ method: 'PATCH', url, payload: note })).json();
  assert.deepEqual(saved.proposalAudit!.assessments, audit.assessments);
  assert.deepEqual(saved.edits, before.edits);
  assert.equal(ruleEvidence([saved], defaultRules).evidence[0].source, 'audit_disagreement');
  assert.deepEqual(ruleEvidence([saved], defaultRules).existingRules, defaultRules);
  saved = (await app.inject({ method: 'PATCH', url, payload: { ...note, disagreed: false } })).json();
  assert.equal(ruleEvidence([saved], []).evidence.length, 0);
  assert.equal(saved.proposalAudit!.feedback[note.assessmentId].text, note.text);
  assert.equal((await app.inject({ method: 'PATCH', url, payload: { ...note, assessmentId: 'missing' } })).statusCode, 400);
});

test('zero-edit revisions still receive instruction checks; legacy runs stay readable', async t => {
  const db = new DatabaseSync(':memory:'); const { app } = setup(async run => { const data = assessment(run); data.assessments.at(-1)!.outcome = 'unfulfilled'; return data; }, db); t.after(() => app.close());
  const run: Run = (await app.inject({ method: 'POST', url: '/api/runs', payload: { ...payload, original: 'No matching replacement.' } })).json();
  assert.equal(run.edits.length, 0); await app.waitForAudits();
  assert.equal(((await app.inject(`/api/runs/${run.id}`)).json() as Run).proposalAudit!.assessments[0].outcome, 'unfulfilled');
  const legacy = createRevision('A.', 'B.', 'Change.', []);
  db.prepare('INSERT INTO runs VALUES (?, ?)').run(legacy.id, JSON.stringify(legacy));
  assert.equal(((await app.inject(`/api/runs/${legacy.id}`)).json() as Run).proposalAudit, undefined);
});

test('pending audits recover after restart with a bounded worker', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'difflens-audits-'));
  try {
    const file = join(dir, 'runs.sqlite');
    const first = setup(async (_run, _final, signal) => new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('Stopped')))), new DatabaseSync(file)).app;
    const run: Run = (await first.inject({ method: 'POST', url: '/api/runs', payload })).json(); await tick();
    assert.equal(((await first.inject(`/api/runs/${run.id}`)).json() as Run).proposalAudit!.status, 'running');
    await first.close();
    let concurrent = 0, max = 0;
    const second = setup(async (item, final) => { concurrent++; max = Math.max(max, concurrent); await tick(); concurrent--; return assessment(item, final); }, new DatabaseSync(file)).app;
    await second.ready();
    await second.inject({ method: 'POST', url: '/api/runs', payload });
    await second.waitForAudits();
    assert.equal(((await second.inject(`/api/runs/${run.id}`)).json() as Run).proposalAudit!.status, 'complete');
    assert.equal(max, 1); await second.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('final audit payload includes its actual text and decisions, with separate proposal context', () => {
  const run = createRevision('Before. The model may improve recall. After.', 'Before. The model improves recall. After.', 'Remove the hedge.', defaultRules);
  run.selection = { start: 8, end: 37 };
  const final: FinalReview = { id: 'f1', text: run.original, edits: [], segments: [{ text: run.original }], decisions: run.edits.map(({ id }) => ({ id, decision: 'rejected', feedback: '' })), decisionKey: 'rejected', createdAt: '', audit: { id: 'a1', status: 'pending', attempt: 0, promptVersion: '', createdAt: '', assessments: [], feedback: {} } };
  const input = auditInput(run, final);
  assert.equal(input.targetText, run.original);
  assert.equal(input.proposal.text, run.revised);
  assert.deepEqual(input.edits, []);
  assert.deepEqual(input.selection, run.selection);
  assert.equal(input.decisions[0].decision, 'rejected');
});
test('browser API can finalize and retry without a JSON body, and audit failures preserve the result', async t => {
  let fail = true;
  const { app, revisions } = setup(async (run, final) => { if (fail) throw new Error('Provider unavailable'); return assessment(run, final); });
  t.after(() => app.close());
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit = {}) => {
    const response = await app.inject({ method: options.method as 'POST' || 'GET', url, headers: Object.fromEntries(new Headers(options.headers)), ...(options.body ? { payload: options.body as string } : {}) });
    return new Response(response.body, { status: response.statusCode, headers: response.headers as Record<string, string> });
  });
  const run = await api<Run>('/api/runs', { method: 'POST', body: JSON.stringify(payload) });
  const final = await api<FinalizeResponse>(`/api/runs/${run.id}/finalize`, { method: 'POST' });
  await app.waitForAudits();
  let saved = await api<Run>(`/api/runs/${run.id}`);
  assert.equal(saved.finalReviews![0].audit.status, 'failed');
  assert.equal(saved.finalReviews![0].text, payload.original);
  fail = false;
  await api<Run>(`/api/runs/${run.id}/audits/${saved.finalReviews![0].audit.id}/retry`, { method: 'POST' });
  await app.waitForAudits();
  saved = await api<Run>(`/api/runs/${run.id}`);
  assert.equal(saved.finalReviews![0].audit.status, 'complete');
  assert.equal(saved.finalReviews![0].id, final.finalReviewId);
  assert.equal(revisions(), 1);
});
test('rule proposals receive current rules and distinguish edit feedback from audit disagreements', async t => {
  let evidence: ReturnType<typeof ruleEvidence> | undefined;
  const app = createApp(new DatabaseSync(':memory:'), {
    model: 'test', revise: async original => original.replace('may improve', 'improves'), audit: async run => assessment(run),
    inferRule: async (runs, rules = []) => { evidence = ruleEvidence(runs, rules); return 'Keep uncertainty unless asked to remove it.'; },
  }, false);
  t.after(() => app.close());
  const runs: Run[] = [];
  for (const original of [payload.original, 'The method may improve recall.']) runs.push((await app.inject({ method: 'POST', url: '/api/runs', payload: { ...payload, original } })).json());
  await app.waitForAudits();
  await app.inject({ method: 'PATCH', url: `/api/runs/${runs[0].id}`, payload: { edits: [{ id: runs[0].edits[0].id, decision: 'rejected', feedback: 'Keep the uncertainty here.' }] } });
  const second: Run = (await app.inject(`/api/runs/${runs[1].id}`)).json(), audit = second.proposalAudit!;
  await app.inject({ method: 'PATCH', url: `/api/runs/${second.id}/audits/${audit.id}/feedback`, payload: { assessmentId: audit.assessments[0].id, disagreed: true, text: 'This edit was not permitted to strengthen the claim.' } });
  const rules = [{ id: 'current', text: 'Preserve citations.', enabled: false }];
  const response = await app.inject({ method: 'POST', url: '/api/rules/infer', payload: { rules } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(evidence!.existingRules, rules);
  assert.deepEqual(evidence!.evidence.map(item => item.source).sort(), ['audit_disagreement', 'edit']);
  assert.equal(new Set(evidence!.evidence.map(item => item.runId)).size, 2);
  assert.deepEqual(((await app.inject(`/api/runs/${runs[0].id}`)).json() as Run).rules, []);
});
