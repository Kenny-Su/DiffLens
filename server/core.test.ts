import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevision } from './core.js';
import { compose } from '../shared/compose.js';
import { revisionTarget, selectionError } from '../shared/selection.js';

test('phrase diffs reconstruct exact text, Unicode, punctuation, and whitespace', () => {
  for (const [original, revised] of [
    ['May reduce costs by 18.7%.', 'Reduces costs by 19%.'],
    ['A 🧪 result.\nNext sentence.', 'A 🧬 result.\nAnother sentence.'],
    ['  spaces\tand\nlines  ', '  tabs  and\n\nlines\t'],
    ['', 'An insertion.'], ['Deleted passage.', ''], ['No change.', 'No change.'],
    ['Hello, world!', 'Hello world.'], ['你好，世界。', '你好，新世界。'],
  ]) {
    const run = createRevision(original, revised, 'Revise.', []);
    assert.equal(compose(run), original);
    for (const edit of run.edits) { assert.equal(original.slice(edit.start, edit.end), edit.before); edit.decision = 'accepted'; }
    assert.equal(compose(run), revised);
    run.edits.forEach(edit => edit.decision = 'rejected');
    assert.equal(compose(run), original);
  }
});
test('changes within one sentence can be decided independently', () => {
  const run = createRevision('One red apple and one blue pear.', 'One green apple and one yellow pear.', 'Change colors.', []);
  assert.deepEqual(run.edits.map(edit => [edit.before, edit.after]), [['red', 'green'], ['blue', 'yellow']]);
  run.edits[0].decision = 'accepted';
  assert.equal(compose(run), 'One green apple and one blue pear.');
  run.edits[1].decision = 'rejected';
  assert.equal(compose(run), 'One green apple and one blue pear.');
  run.edits[0].decision = 'pending';
  assert.equal(compose(run), run.original);
});
test('selected replacements preserve boundaries and cannot include outside text in suggestions', () => {
  for (const original of ['\t red apple \n', 'prefix\t red apple \n suffix', 'prefix\nred apple', 'red apple\nsuffix']) {
    const start = original.indexOf('red');
    const end = start + 'red apple'.length;
    const selection = { start: Math.max(0, start - 1), end: Math.min(original.length, end + 1) };
    const target = revisionTarget(original, selection);
    const run = createRevision(original, ' green pear \n', 'Change colors.', [], selection);
    assert.equal(run.revised, original.slice(0, target.start) + 'green pear' + original.slice(target.end));
    for (const edit of run.edits) {
      assert.ok(edit.start >= target.start && edit.end <= target.end);
      assert.equal(original.slice(edit.start, edit.end), edit.before);
      edit.decision = 'accepted';
    }
    assert.equal(compose(run), run.revised);
  }
});
test('cross-paragraph selection keeps document offsets and outer paragraphs intact', () => {
  const original = '🧪 Intro.\n\nFirst paragraph.\n\nSecond paragraph.\n\nEnd.';
  const selection = { start: original.indexOf('First'), end: original.indexOf('\n\nEnd.') };
  const run = createRevision(original, 'A combined paragraph.', 'Combine.', [], selection);
  run.edits.forEach(edit => edit.decision = 'accepted');
  assert.equal(compose(run), '🧪 Intro.\n\nA combined paragraph.\n\nEnd.');
});
test('selection ranges reject empty, whitespace, invalid offsets, and split surrogate pairs', () => {
  for (const selection of [{ start: -1, end: 1 }, { start: 1, end: 1 }, { start: 0, end: 9 }, { start: .5, end: 3 }, { start: 1, end: 2 }]) assert.ok(selectionError('🧪 x', selection));
  assert.ok(selectionError('a \n b', { start: 1, end: 4 }));
  assert.equal(selectionError('🧪 x', { start: 0, end: 2 }), null);
});
test('the old sentence limit is gone while the character limit remains', () => {
  const original = 'One sentence. '.repeat(201);
  assert.equal(createRevision(original, original, 'Keep.', []).edits.length, 0);
  assert.throws(() => createRevision('a'.repeat(30001), 'a', 'Shorten.', []), /30,000/);
});
