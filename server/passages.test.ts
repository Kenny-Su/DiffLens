import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRevision } from './core.js';
import { createApp } from './app.js';
import { compose } from '../shared/compose.js';
import { buildPassages, passageKey, passageState, passageText } from '../shared/passages.js';
import { finalSnapshot, proposalSnapshot } from '../shared/fidelity.js';
import { auditInput, newAudit, ruleEvidence } from './fidelity.js';
import { emptyDraft, readDraft, writeDraft } from '../src/lib/draft.js';
import { acknowledgeDrafts, unappliedPassage, updatePassageDraft } from '../src/lib/reviewDrafts.js';
import { reviewDocument } from '../src/lib/reviewDocument.js';
import type { Run, FinalReview } from '../shared/types.js';

const examples = [
  ['A red apple. A blue pear.', 'A green apple. A yellow pear.', 2],
  ['One red apple and one blue pear.', 'One green apple and one yellow pear.', 1],
  ['Dr. Lee measured 5.2 mg. It may help.', 'Dr. Kim measured 5.3 mg. It helps.', 2],
  ['The models are reliable and fast.', 'The model is reliable. It is fast.', 1],
  ['The model is reliable. It is fast.', 'The model is reliable and fast.', 1],
  ['First paragraph.\n\nSecond paragraph.', 'Combined paragraph.', 1],
  ['🧪 A test.\n\n你好，世界。', '🧬 Another test.\n\n你好，新世界。', 2],
  ['It may help (Lee et al., 2024).', 'It helps (Kim et al., 2025).', 1],
  ['one\tword\n\n  two', 'one  word\n\n two'],
  ['Hello, world!', 'Hello world.'],
  ['Old text.', ''], ['', 'New text.'],
  ['A sentence. Another sentence.', 'A sentence. A new sentence. Another sentence.'],
  ['\n\nA sentence.\n\n', 'A different sentence.'],
] as const;

test('passages group related words, respect common sentence boundaries, and reconstruct every byte', () => {
  for (const [before, after, count] of examples) {
    const run = createRevision(before, after, 'Revise.', []);
    const passages = run.passages!;
    if (count !== undefined) assert.equal(passages.length, count, `${before} -> ${after}`);
    assert.deepEqual(passages.flatMap(passage => passage.editIds), run.edits.map(edit => edit.id));
    assert.equal(reviewDocument(run).blocks.flat().flatMap(chunk => chunk.parts ?? [{ text: chunk.text }]).filter(part => !part.removed).map(part => part.text).join(''), after);
    assert.equal(compose(run), before);
    let end = 0;
    for (const passage of passages) {
      assert.ok(passage.start >= end);
      assert.equal(passage.before, before.slice(passage.start, passage.end));
      assert.equal(passage.after, after.slice(passage.revisedStart, passage.revisedEnd));
      end = passage.end;
    }
    run.edits.forEach(edit => edit.decision = 'accepted');
    assert.equal(compose(run), after);
    run.edits.forEach(edit => edit.decision = 'rejected');
    assert.equal(compose(run), before);
  }
});

test('bounded manual replacements retain selection edges and exact surrounding Unicode/whitespace', () => {
  const original = '🧪 Intro.\n\n  a red apple. A blue pear. \n\nEnd.';
  const selection = { start: original.indexOf('  a'), end: original.indexOf('\n\nEnd.') };
  const run = createRevision(original, 'a green apple. A yellow pear.', 'Colors.', [], selection);
  const passage = run.passages![0];
  const outside = original.slice(passage.end);
  run.edits.filter(edit => passage.editIds.includes(edit.id)).forEach(edit => edit.decision = 'accepted');
  run.passageReviews = { [passage.id]: { replacementText: 'A custom 🧬 sentence.\n\nNew paragraph. ', feedback: '' } };
  assert.equal(compose(run), original.slice(0, passage.start) + 'A custom 🧬 sentence.\n\nNew paragraph. ' + outside);
  run.passageReviews[passage.id].replacementText = '';
  assert.equal(compose(run), original.slice(0, passage.start) + outside);
  assert.ok(reviewDocument(run).blocks.flat().some(chunk => chunk.passageId === passage.id && chunk.text === ''));
});

test('legacy mixed decisions compose unchanged and stay partially reviewed', () => {
  const run = createRevision('A red apple and a blue pear.', 'A green apple and a yellow pear.', 'Colors.', []);
  run.edits[0].decision = 'accepted';
  run.edits[1].decision = 'rejected';
  assert.equal(passageState(run, run.passages![0]), 'mixed');
  assert.equal(passageText(run, run.passages![0], true), 'A green apple and a blue pear.');
  assert.equal(compose(run), 'A green apple and a blue pear.');
});

test('manual drafts survive reload, distinguish empty text, guard leaving, and ignore late acknowledgements', () => {
  const run = createRevision('Red apple.', 'Green apple.', 'Colors.', []), passage = run.passages![0];
  const draft = updatePassageDraft(emptyDraft(), run, passage, '');
  const key = passageKey(run.id, passage.id);
  let raw = '';
  const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
  writeDraft(storage, draft);
  assert.equal(readDraft(storage).passageDrafts[key], '');
  assert.equal(unappliedPassage(run, readDraft(storage))?.id, passage.id);
  assert.equal(unappliedPassage(run, updatePassageDraft(draft, run, passage, passage.after)), undefined);
  assert.deepEqual(acknowledgeDrafts({ [key]: 'newer' }, { [key]: '' }, [key]), { [key]: 'newer' });
  assert.deepEqual(acknowledgeDrafts({ [key]: '' }, { [key]: '' }, [key]), {});
});

function setup(revised = 'A green apple and a yellow pear. Second changed sentence.') {
  const inputs: ReturnType<typeof auditInput>[] = [];
  const app = createApp(new DatabaseSync(':memory:'), {
    model: 'mock', revise: async () => revised, inferRule: async () => null,
    audit: async (run, final) => {
      inputs.push(auditInput(run, final));
      return { acceptableEditIds: [], respectedRuleIds: [], notApplicableRuleIds: [], assessments: [
        ...(final?.edits ?? run.edits).map(edit => ({ kind: 'edit', subjectId: edit.id, text: 'Change', outcome: 'acceptable', reason: 'Fixture assessment.', editIds: [edit.id], proposalEditIds: [], ruleIds: [] })),
        { kind: 'request', subjectId: null, text: 'Request', outcome: 'fulfilled', reason: 'Fixture assessment.', editIds: [], proposalEditIds: [], ruleIds: [] },
      ] };
    },
  }, false);
  const generate = async () => (await app.inject({ method: 'POST', url: '/api/runs', payload: { original: 'A red apple and a blue pear. Second sentence.', instruction: 'Colors.', rules: [] } })).json<Run>();
  return { app, inputs, generate };
}

test('passage updates are atomic, preserve the proposal, and reject the removed edit-by-edit API', async t => {
  const { app, generate } = setup(); t.after(() => app.close());
  const run = await generate(), passage = run.passages![0]; await app.waitForAudits();
  const patch = (payload: Record<string, unknown>) => app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload });
  const update = { id: passage.id, decision: 'accepted', feedback: 'Keep these details.', replacementText: 'A custom result.' };
  for (const payload of [{ passages: [update, { ...update, id: 'missing' }] }, { passages: [update, update] }, { passages: [update], edits: [] }, { passages: [{ ...update, decision: 'pending' }] }]) assert.equal((await patch(payload)).statusCode, 400);
  const before = (await app.inject(`/api/runs/${run.id}`)).json<Run>();
  assert.equal(compose(before), run.original);
  const accepted = (await patch({ passages: [update] })).json<Run>();
  assert.equal(accepted.revised, run.revised);
  assert.deepEqual(accepted.passages, run.passages);
  assert.equal(compose(accepted), 'A custom result. Second sentence.');
  assert.equal((await patch({ edits: [{ id: passage.editIds[0], decision: 'rejected', feedback: '' }] })).statusCode, 400);
  const feedback = await app.inject({ method: 'PATCH', url: `/api/runs/${run.id}/passages/${passage.id}/feedback`, payload: { feedback: 'Still editable.' } });
  assert.equal(compose(feedback.json()), compose(accepted));
  const rejected = (await patch({ passages: [{ id: passage.id, decision: 'rejected', feedback: '' }] })).json<Run>();
  assert.equal(compose(rejected), run.original);
  assert.equal(rejected.passageReviews?.[passage.id].replacementText, undefined);
});

test('oversized assembled replacements fail without saving; empty replacement deletes a passage', async t => {
  const { app, generate } = setup(); t.after(() => app.close());
  const run = await generate(), passage = run.passages![0]; await app.waitForAudits();
  const send = (replacementText: string) => app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { passages: [{ id: passage.id, decision: 'accepted', feedback: '', replacementText }] } });
  assert.equal((await send('x'.repeat(30000))).statusCode, 400);
  assert.equal(compose((await app.inject(`/api/runs/${run.id}`)).json()), run.original);
  assert.equal(compose((await send('')).json()), ' Second sentence.');
});

test('manual finalizations are idempotent, inspectable, restorable, and audited as author contributions', async t => {
  const { app, inputs, generate } = setup(); t.after(() => app.close());
  const run = await generate(), passage = run.passages![0];
  const apply = (replacementText: string) => app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { passages: [{ id: passage.id, decision: 'accepted', feedback: 'Preserve uncertainty.', replacementText }] } });
  const finalize = async () => (await app.inject({ method: 'POST', url: `/api/runs/${run.id}/finalize` })).json<{ run: Run; finalReviewId: string }>();
  await apply('The intervention may help.');
  const first = await finalize(), duplicate = await finalize();
  assert.equal(first.finalReviewId, duplicate.finalReviewId);
  await apply('The intervention helps.');
  const second = await finalize();
  assert.notEqual(first.finalReviewId, second.finalReviewId);
  await app.waitForAudits();
  const saved = (await app.inject(`/api/runs/${run.id}`)).json<Run>(), final = saved.finalReviews![0];
  assert.equal(final.text, 'The intervention may help. Second sentence.');
  assert.equal(compose(finalSnapshot(saved, final)), final.text);
  assert.equal(compose(proposalSnapshot(saved, final)), final.text);
  assert.equal(final.passageReviews?.[passage.id].replacementText, 'The intervention may help.');
  const finalInput = inputs.find(input => input.targetText === final.text)!;
  assert.equal(finalInput.authorPassages[0].replacementText, 'The intervention may help.');
  assert.equal(finalInput.proposal!.text, run.revised);
  const restored = (await app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { restoreFinalReviewId: final.id } })).json<Run>();
  assert.equal(compose(restored), final.text);
  assert.equal(restored.finalReviews!.length, 2);
  assert.equal((await finalize()).finalReviewId, final.id);
  assert.equal(ruleEvidence([saved], []).evidence[0].source, 'passage');
  saved.passageReviews![passage.id].feedback = '';
  assert.equal(ruleEvidence([saved], []).evidence.length, 0);
});

test('backfill preserves legacy IDs, decisions and old snapshots', async t => {
  const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE runs (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  const legacy = createRevision('Red apple, blue pear.', 'Green apple, yellow pear.', 'Colors.', []);
  delete legacy.passages; delete legacy.passageReviews;
  legacy.edits[0].decision = 'accepted'; legacy.edits[1].decision = 'rejected';
  const text = compose(legacy), target = createRevision(legacy.original, text, '', []);
  const final: FinalReview = { id: 'f1', text, edits: target.edits.map(edit => ({ ...edit, decision: 'accepted' })), segments: target.segments, decisions: legacy.edits.map(({ id, decision }) => ({ id, decision })), decisionKey: 'old', createdAt: '', audit: { ...newAudit('mock'), status: 'failed' } };
  legacy.finalReviews = [final];
  db.prepare('INSERT INTO runs VALUES (?, ?)').run(legacy.id, JSON.stringify(legacy));
  const app = createApp(db, { model: 'mock', revise: async () => '', audit: async () => ({}), inferRule: async () => null }, false); t.after(() => app.close());
  const saved = (await app.inject(`/api/runs/${legacy.id}`)).json<Run>();
  assert.deepEqual(saved.edits, legacy.edits);
  assert.deepEqual(saved.passages, buildPassages(legacy));
  assert.equal(compose(saved), text);
  assert.equal(compose(finalSnapshot(saved, saved.finalReviews![0])), text);
  assert.deepEqual(saved.finalReviews![0].decisions, final.decisions);
  assert.deepEqual(saved.finalReviews![0].audit, final.audit);
});

test('alignment anchors never lose repeated text, zero-width edits, or paragraph separators', () => {
  let seed = 1729;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const tokens = ['same ', 'Different. ', 'A ', 'term ', '\n\n', '\t', '🧪', '你好。', '5.2 mg ', '(Lee, 2024). '];
  for (let attempt = 0; attempt < 250; attempt++) {
    const parts = Array.from({ length: 12 }, () => tokens[Math.floor(random() * tokens.length)]);
    const original = parts.join('');
    parts.splice(Math.floor(random() * parts.length), Math.floor(random() * 4), tokens[Math.floor(random() * tokens.length)]);
    const revised = parts.join(''), run = createRevision(original, revised, '', []);
    run.edits.forEach(edit => edit.decision = 'accepted');
    run.passageReviews = Object.fromEntries(run.passages!.map(passage => [passage.id, { replacementText: passage.after, feedback: '' }]));
    assert.equal(compose(run), revised, `case ${attempt}`);
    assert.equal(reviewDocument(run).blocks.flat().flatMap(chunk => chunk.parts ?? [{ text: chunk.text }]).filter(part => !part.removed).map(part => part.text).join(''), revised, `render case ${attempt}`);
  }
});

test('an audit completing after a manual replacement preserves the applied text and feedback', async t => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const app = createApp(new DatabaseSync(':memory:'), {
    model: 'mock', revise: async () => 'The intervention reduces error.', inferRule: async () => null,
    audit: async run => {
      await held;
      return { acceptableEditIds: [], respectedRuleIds: [], notApplicableRuleIds: [], assessments: [
        ...run.edits.map(edit => ({ kind: 'edit', subjectId: edit.id, text: 'Claim strength', outcome: 'unacceptable', reason: 'Hedge removed.', editIds: [edit.id], proposalEditIds: [], ruleIds: [] })),
        { kind: 'request', subjectId: null, text: 'Polish', outcome: 'partial', reason: 'Strengthening was not requested.', editIds: [], proposalEditIds: [], ruleIds: [] },
      ] };
    },
  }, false); t.after(() => app.close());
  const run = (await app.inject({ method: 'POST', url: '/api/runs', payload: { original: 'The intervention may reduce error.', instruction: 'Polish.', rules: [] } })).json<Run>();
  await new Promise(resolve => setImmediate(resolve));
  const passage = run.passages![0];
  const applied = await app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { passages: [{ id: passage.id, decision: 'accepted', replacementText: 'The intervention could reduce error.', feedback: 'Keep the hedge.' }] } });
  assert.equal(applied.statusCode, 200);
  release(); await app.waitForAudits();
  const saved = (await app.inject(`/api/runs/${run.id}`)).json<Run>();
  assert.equal(saved.proposalAudit?.status, 'complete');
  assert.equal(compose(saved), 'The intervention could reduce error.');
  assert.equal(saved.passageReviews?.[passage.id].feedback, 'Keep the hedge.');
});
