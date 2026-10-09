import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from './app.js';
import { compose } from '../shared/compose.js';
import type { Run, TextSelection } from '../shared/types.js';

function setup() {
  const calls: { original: string; selection?: TextSelection }[] = [];
  const app = createApp(new DatabaseSync(':memory:'), {
    model: 'test-model',
    async revise(original, instruction, _rules, selection) {
      calls.push({ original, selection });
      if (instruction === 'Fail') throw new Error('Model unavailable');
      return selection ? 'green pear' : original.replace('red', 'green').replace('blue', 'yellow');
    },
    async inferRule(runs) { return runs.some(run => run.edits.some(edit => edit.feedback)) ? 'Keep it concise.' : null; },
  }, false);
  return { app, calls };
}
const payload = { original: 'One red apple and one blue pear.', instruction: 'Change colors.', rules: [] };

test('one-call generation, bulk decisions, feedback, undo, and result persistence', async t => {
  const { app, calls } = setup(); t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/runs', payload });
  assert.equal(response.statusCode, 200);
  const run: Run = response.json();
  assert.equal(calls.length, 1);
  assert.equal(run.edits.length, 2);
  const patch = (decision: 'accepted' | 'rejected' | 'pending') => app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { edits: run.edits.map(edit => ({ id: edit.id, decision, feedback: 'Keep it concise.' })) } });
  assert.equal(compose((await patch('accepted')).json()), run.revised);
  assert.equal(compose((await patch('rejected')).json()), run.original);
  assert.equal(compose((await patch('pending')).json()), run.original);
  const restored: Run = (await app.inject(`/api/runs/${run.id}`)).json();
  assert.equal(restored.edits[0].feedback, 'Keep it concise.');
  assert.equal(restored.edits[0].decision, 'pending');
  assert.deepEqual((await app.inject({ method: 'POST', url: '/api/rules/infer', payload: {} })).json(), { rule: 'Keep it concise.' });
  const invalid = await app.inject({ method: 'PATCH', url: `/api/runs/${run.id}`, payload: { edits: [{ id: run.edits[0].id, decision: 'accepted', feedback: '' }, { id: 'missing', decision: 'accepted', feedback: '' }] } });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual((await app.inject(`/api/runs/${run.id}`)).json(), restored);
});
test('invalid scope is rejected before the model; selected output is spliced safely', async t => {
  const { app, calls } = setup(); t.after(() => app.close());
  for (const selection of [{ start: -1, end: 3 }, { start: 2, end: 2 }, { start: 0, end: 999 }, { start: 0.5, end: 5 }, { start: '0', end: 3 }]) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/runs', payload: { ...payload, selection } })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/runs', payload: { ...payload, revised: 'Unsupported input' } })).statusCode, 400);
  assert.equal(calls.length, 0);
  const original = 'Before.\n\tred apple \nAfter.';
  const selection = { start: 7, end: 19 };
  const response = await app.inject({ method: 'POST', url: '/api/runs', payload: { ...payload, original, selection } });
  assert.equal(response.statusCode, 200);
  const run: Run = response.json();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { original, selection });
  assert.deepEqual(run.selection, selection);
  assert.equal(run.revised, 'Before.\n\tgreen pear \nAfter.');
});
test('restoration can fetch a revision outside the recent-history window', async t => {
  const { app } = setup(); t.after(() => app.close());
  let first = '';
  for (let index = 0; index < 21; index++) {
    const run: Run = (await app.inject({ method: 'POST', url: '/api/runs', payload })).json();
    if (!index) first = run.id;
  }
  const recent: Run[] = (await app.inject('/api/runs')).json();
  assert.equal(recent.length, 20);
  assert.ok(!recent.some(run => run.id === first));
  assert.equal((await app.inject(`/api/runs/${first}`)).statusCode, 200);
  assert.equal((await app.inject('/api/runs/missing')).statusCode, 404);
});
test('failed generation never creates a saved revision', async t => {
  const { app } = setup(); t.after(() => app.close());
  assert.equal((await app.inject({ method: 'POST', url: '/api/runs', payload: { ...payload, instruction: 'Fail' } })).statusCode, 502);
  assert.deepEqual((await app.inject('/api/runs')).json(), []);
});
