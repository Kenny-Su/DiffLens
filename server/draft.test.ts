import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_KEY, emptyDraft, readDraft, resultDraft, writeDraft } from '../src/lib/draft.js';
import { createRevision } from './core.js';
import { readRules, RULES_KEY } from '../src/lib/rules.js';
import { defaultRules } from '../shared/fidelity.js';

function storage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
}
test('draft reload restores text, instruction, active review, and unsaved feedback', () => {
  const store = storage();
  const draft = { ...emptyDraft(), text: '🧪 My writing.\n', instruction: 'Shorten.', activeRunId: 'run-1', passageFeedback: { 'run-1/p1': 'Keep this.' } };
  writeDraft(store, draft);
  assert.deepEqual(readDraft(store), draft);
});
test('returning to writing applies accepted changes and keeps unresolved text', () => {
  const run = createRevision('Red apple, blue pear.', 'Green apple, yellow pear.', 'Colors.', []);
  run.edits[0].decision = 'accepted';
  const draft = { ...emptyDraft(), text: run.original, instruction: run.instruction, activeRunId: run.id };
  const result = resultDraft(draft, run);
  assert.equal(result.text, 'Green apple, blue pear.');
  assert.equal(result.activeRunId, null);
  assert.equal(draft.text, run.original);
  assert.equal(draft.activeRunId, run.id);
});
test('invalid stored data is not overwritten by reading it', () => {
  const store = storage();
  store.setItem(DRAFT_KEY, 'corrupted data');
  assert.throws(() => readDraft(store));
  assert.equal(store.getItem(DRAFT_KEY), 'corrupted data');
});
test('storage failure leaves the in-memory draft intact', () => {
  const draft = { ...emptyDraft(), text: 'Keep this writing.' };
  const store = { getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } };
  assert.throws(() => writeDraft(store, draft), /Quota/);
  assert.equal(draft.text, 'Keep this writing.');
});
test('draft defaults retain writing, review references and notes', () => {
  const store = storage();
  const legacy = { text: 'Unchanged writing.', instruction: 'Tighten.', activeRunId: 'r1', passageFeedback: { 'run-1/p1': 'Keep this.' } };
  store.setItem(DRAFT_KEY, JSON.stringify(legacy));
  assert.deepEqual(readDraft(store), { ...emptyDraft(), ...legacy });
  const draft = { ...readDraft(store), lastRevisionId: 'r1', lastFinalReviewId: 'f1', auditFeedback: { 'audit1/a2': 'Unfinished disagreement explanation.' } };
  writeDraft(store, draft);
  assert.deepEqual(readDraft(store), draft);
});
test('only current draft fields persist; saved plain text and review state survive', () => {
  const store = storage();
  const document = { type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'Old heading' }] }, { type: 'image', attrs: { src: 'data:image/png;base64,example' } }] };
  const old = { ...emptyDraft(), text: 'Current text.\r\n🧪', document, documentText: 'Old heading', legacyRichText: { document, text: 'Old heading' }, activeRunId: 'r1', passageDrafts: { 'r1/p1': 'Unapplied text.' } };
  store.setItem(DRAFT_KEY, JSON.stringify(old));
  const draft = readDraft(store);
  assert.equal(draft.text, old.text);
  assert.equal(draft.activeRunId, 'r1');
  assert.deepEqual(draft.passageDrafts, old.passageDrafts);
  assert.deepEqual(Object.keys(draft), Object.keys(emptyDraft()));
  assert.equal(store.getItem(DRAFT_KEY), JSON.stringify(old));
  writeDraft(store, { ...draft, text: 'New writing.' });
  const reloaded = readDraft(store);
  assert.equal(reloaded.text, 'New writing.');
  assert.deepEqual(Object.keys(reloaded), Object.keys(emptyDraft()));
});
test('scientific defaults seed only a new rule collection; empty and customized collections survive', () => {
  const store = storage();
  const rules = readRules(store);
  assert.deepEqual(rules, defaultRules);
  rules[0].text = 'My customization.';
  assert.notEqual(rules[0].text, defaultRules[0].text);
  for (const saved of [[], rules]) {
    store.setItem(RULES_KEY, JSON.stringify(saved));
    assert.deepEqual(readRules(store), saved);
  }
  store.setItem(RULES_KEY, 'broken');
  assert.throws(() => readRules(store));
  assert.equal(store.getItem(RULES_KEY), 'broken');
});
