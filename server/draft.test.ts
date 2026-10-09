import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_KEY, emptyDraft, readDraft, resultDraft, writeDraft } from '../src/lib/draft.js';
import { createRevision } from './core.js';

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
