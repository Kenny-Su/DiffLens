import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevision } from './core.js';
import { reviewDocument, type ReviewPart } from '../src/lib/reviewDocument.js';
import { sourceOffset, textareaOffset } from '../src/lib/selectionAnchor.js';

const original = 'Results\n\nThe method may help.\n\nFirst finding.';
const proposed = 'Results\n\nThe method may improve outcomes.\n\nNew finding.';
const parts = (content: ReturnType<typeof reviewDocument>): ReviewPart[] => content.blocks.flat().flatMap(chunk => chunk.parts ?? [{ text: chunk.text }]);
const before = (content: ReturnType<typeof reviewDocument>) => parts(content).filter(part => !part.added).map(part => part.text).join('');
const after = (content: ReturnType<typeof reviewDocument>) => parts(content).filter(part => !part.removed).map(part => part.text).join('');

test('inline diff reconstructs both versions across paragraphs, whitespace, Unicode and literal markup', () => {
  const examples = [
    [original, proposed],
    ['  A\tclaim.\n\n\nNext.  ', '  A finding.\n\nNext.  '],
    ['# Heading\n**A claim.**\n<script>literal text</script>', '# Heading\n**A finding.**\n<script>literal text</script>'],
    ['👩‍🔬 é 中文\r\n\r\nNext.', '🧑‍🔬 á 中文\r\n\r\nLast.'],
    ['First paragraph.\n\nSecond paragraph.', 'Combined paragraph.'],
    ['One sentence.', 'First sentence.\n\nSecond sentence.'],
    ['Remove me.', ''], ['', 'New paragraph.'], ['Unchanged.', 'Unchanged.'],
  ];
  for (const [original, proposed] of examples) {
    const run = createRevision(original, proposed, 'Clarify.', []);
    const content = reviewDocument(run);
    assert.equal(before(content), original);
    assert.equal(after(content), proposed);
    for (const chunk of content.blocks.flat()) assert.equal(content.text.slice(chunk.start, chunk.start + chunk.text.length), chunk.text);
    assert.ok(run.edits.every(edit => edit.decision === 'pending'));
  }
});

test('resolved passages show committed text and can reveal their diff again', () => {
  const run = createRevision(original, proposed, 'Clarify.', []);
  run.edits.forEach(edit => { edit.decision = 'accepted'; });
  const resolved = reviewDocument(run);
  assert.equal(resolved.text, proposed);
  assert.ok(resolved.blocks.flat().every(chunk => chunk.parts === undefined));
  assert.equal(before(reviewDocument(run, true, true)), original);
  assert.equal(after(reviewDocument(run, true, true)), proposed);
  run.edits.forEach(edit => { edit.decision = 'rejected'; });
  assert.equal(reviewDocument(run).text, original);
  assert.ok(parts(reviewDocument(run, true, true)).every(part => !part.added && !part.removed));
});

test('manual replacements are compared with the original, and history uses committed decisions', () => {
  const run = createRevision(original, proposed, 'Clarify.', []);
  const passage = run.passages![0];
  run.edits.filter(edit => passage.editIds.includes(edit.id)).forEach(edit => { edit.decision = 'accepted'; });
  const replacement = 'A manual replacement 🧪.\n\nExtra detail.';
  run.passageReviews = { [passage.id]: { replacementText: replacement, feedback: '' } };
  const content = reviewDocument(run, false, true);
  assert.equal(before(content), original);
  assert.equal(after(content), original.slice(0, passage.start) + replacement + original.slice(passage.end));
  assert.ok(!after(content).includes('New finding.'));
});

test('deleted and rejected insertions retain inspectable anchors', () => {
  for (const [original, proposed, decision] of [['Remove me.', '', 'accepted'], ['', 'New paragraph.', 'rejected']] as const) {
    const run = createRevision(original, proposed, 'Revise.', []);
    run.edits.forEach(edit => { edit.decision = decision; });
    const content = reviewDocument(run);
    assert.equal(content.text, '');
    assert.ok(content.blocks.flat().some(chunk => chunk.passageId === run.passages![0].id));
  }
});

test('native textarea UTF-16 selections map safely to legacy CRLF text', () => {
  for (const text of ['One.\n\nTwo.', '🧪 é 中文', 'Before.\r\n\r\n🧪 A claim.\rEnd.', 'One\r\nTwo\r\n']) {
    const native = text.replace(/\r\n?/g, '\n');
    for (let offset = 0; offset <= native.length; offset++) {
      const source = sourceOffset(text, offset);
      assert.equal(textareaOffset(text, source), offset);
      assert.equal(text.slice(0, source).replace(/\r\n?/g, '\n'), native.slice(0, offset));
    }
  }
});
