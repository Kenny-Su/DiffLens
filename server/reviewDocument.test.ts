import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRevision } from './core.js';
import { chunkAnimation, reviewDocument } from '../src/lib/reviewDocument.js';
import { transformationFrame, transformationSteps } from '../src/lib/transformation.js';
import { sourceOffset, textareaOffset } from '../src/lib/selectionAnchor.js';

const original = 'Results\n\nThe method may help.\n\nFirst finding.';
const proposed = 'Results\n\nThe method may improve outcomes.\n\nNew finding.';

test('plain review preserves exact text, blank lines, tabs and literal markup', () => {
  for (const text of ['  A\tclaim.\n\n\nNext.  ', '# Heading\n**A claim.**\n<script>literal text</script>', '🧪 é 中文\r\n\r\nNext.']) {
    const run = createRevision(text, text.replace(/claim|Next/, 'finding'), 'Clarify.', []);
    const content = reviewDocument(run, true);
    assert.equal(content.text, run.revised);
    assert.equal(content.blocks.flat().map(chunk => chunk.text).join(''), run.revised);
    for (const chunk of content.blocks.flat()) assert.equal(content.text.slice(chunk.start, chunk.start + chunk.text.length), chunk.text);
  }
});

test('review retains exact animation frames and maps highlights across paragraph boundaries', () => {
  const run = createRevision(original, proposed, 'Clarify.', []);
  const overrides = Object.fromEntries(run.passages!.map(passage => [passage.id, passage.before]));
  for (const step of transformationSteps(run)) {
    for (const phase of ['highlight', 'out', 'in'] as const) {
      const frame = transformationFrame(step, phase, 1);
      overrides[step.passageId] = frame.text;
      const content = reviewDocument(run, true, overrides);
      const chunks = content.blocks.flat().filter(chunk => chunk.passageId === step.passageId);
      assert.equal(chunks.map(chunk => chunk.text).join(''), frame.text);
      for (const chunk of chunks) {
        const active = chunkAnimation(chunk, { id: step.passageId, ...frame });
        if (active) {
          assert.ok(active.start >= 0 && active.end <= chunk.text.length);
          assert.equal(chunk.text.slice(0, active.start) + chunk.text.slice(active.start, active.end) + chunk.text.slice(active.end), chunk.text);
        }
      }
    }
    overrides[step.passageId] = step.after;
  }
  const chunk = { text: 'second', start: 7, passageOffset: 7, passageId: 'p1' };
  assert.deepEqual(chunkAnimation(chunk, { id: 'p1', start: 2, end: 12, caret: 10 }), { start: 0, end: 5, caret: 3 });
  assert.equal(chunkAnimation(chunk, { id: 'p2', start: 2, end: 12 }), null);
});

test('review composes saved decisions and manual replacements without formatting metadata', () => {
  const run = createRevision(original, proposed, 'Clarify.', []);
  run.edits.forEach(edit => { edit.decision = 'rejected'; });
  assert.equal(reviewDocument(run, true).text, original);
  const passage = run.passages![0];
  run.edits.filter(edit => passage.editIds.includes(edit.id)).forEach(edit => { edit.decision = 'accepted'; });
  run.passageReviews = { [passage.id]: { replacementText: 'A manual replacement 🧪.', feedback: '' } };
  assert.equal(reviewDocument(run, false).text, original.slice(0, passage.start) + 'A manual replacement 🧪.' + original.slice(passage.end));
});

test('deleted and newly inserted passages keep inspectable anchors, including an empty document', () => {
  for (const [before, after] of [['Remove me.', ''], ['', 'New paragraph.'], ['One.\n\nTwo.', 'One.'], ['One.', 'One.\n\nTwo.'], ['🧪 First.\nSecond.', '🧪 Changed.\nSecond.']]) {
    const run = createRevision(before, after, 'Revise.', []);
    for (const originalView of [false, true]) {
      const content = reviewDocument(run, true, originalView ? Object.fromEntries(run.passages!.map(passage => [passage.id, passage.before])) : undefined);
      assert.equal(content.text, originalView ? before : after);
      for (const passage of run.passages!) assert.ok(content.blocks.flat().some(chunk => chunk.passageId === passage.id));
    }
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
