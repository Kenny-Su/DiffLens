import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevision } from './core.js';
import { compose } from '../shared/compose.js';
test('review reconstructs exact inputs including Unicode and whitespace', () => {
  for (const [a,b] of [['May reduce costs by 18.7%.','Reduces costs by 19%.'],['A 🧪 result.\nNext sentence.','A 🧬 result.\nAnother sentence.'],['','An insertion.'],['Deleted passage.',''],['No change.','No change.']]) {
    const run = createRevision(a,b,'Tighten.',[]);
    assert.equal(compose(run),a);
    run.edits.forEach(e => e.decision = 'accepted');
    assert.equal(compose(run),b);
    run.edits.forEach(e => e.decision = 'rejected');
    assert.equal(compose(run),a);
  }
});
test('mixed decisions preserve original text for pending and rejected edits', () => {
  const run = createRevision('One red apple. One blue pear.','One green apple. One yellow pear.','Change colors.',[]);
  assert.equal(run.edits.length,2);
  run.edits[0].decision = 'accepted';
  assert.equal(compose(run),'One green apple. One blue pear.');
  for (const e of run.edits) assert.equal(run.original.slice(e.start,e.end),e.before);
});
