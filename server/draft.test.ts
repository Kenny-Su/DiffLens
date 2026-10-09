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
  const draft = { ...emptyDraft(), text: '🧪 My writing.\n', instruction: 'Shorten.', activeRunId: 'run-1', feedback: { e1: 'Keep this.' } };
  writeDraft(store, draft);
  assert.deepEqual(readDraft(store), draft);
});
test('returning to writing applies accepted changes and keeps unresolved text', () => {
  const run = createRevision('Red apple, blue pear.', 'Green apple, yellow pear.', 'Colors.', []);
  run.edits[0].decision = 'accepted';
  const draft = { ...emptyDraft(), text: run.original, instruction: run.instruction, activeRunId: run.id, feedback: { e1: 'Good.' } };
  const result = resultDraft(draft, run);
  assert.equal(result.text, 'Green apple, blue pear.');
  assert.equal(result.activeRunId, null);
  assert.deepEqual(result.feedback, {});
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
test('legacy drafts retain writing and review while new audit references and notes survive reload', () => {
  const store = storage();
  const legacy = { version: 1, text: 'Unchanged writing.', instruction: 'Tighten.', activeRunId: 'r1', feedback: { e1: 'Keep this.' } };
  store.setItem(DRAFT_KEY, JSON.stringify(legacy));
  assert.deepEqual(readDraft(store), { ...emptyDraft(), ...legacy });
  const draft = { ...readDraft(store), lastRevisionId: 'r1', lastFinalReviewId: 'f1', auditFeedback: { 'audit1/a2': 'Unfinished disagreement explanation.' } };
  writeDraft(store, draft);
  assert.deepEqual(readDraft(store), draft);
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
