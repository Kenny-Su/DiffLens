import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/react';
import { simpleEditorExtensions } from '../src/lib/simpleEditorExtensions.js';
import { Node } from '@tiptap/pm/model';
import { documentForText, plainDocument, projectDocument, textOffset } from '../src/lib/richText.js';
import { emptyDraft, readDraft, writeDraft, resultDraft } from '../src/lib/draft.js';
import { createRevision } from './core.js';
const schema = getSchema(simpleEditorExtensions());
const project = (document: ReturnType<typeof plainDocument>) => projectDocument(Node.fromJSON(schema, document));

test('rich editor text mapping preserves blank lines, literal LaTeX, whitespace and UTF-16 selections', () => {
  for (const text of ['', 'One.\n\nTwo.', '\n\nOne.\n\n', 'a\nb\n\n\nc', '🧪 é 中文 \\cite{key}.', '  one\tword  \r\nnext']) {
    const document = plainDocument(text), mapping = project(document);
    assert.equal(mapping.text, text);
    for (let offset = 0; offset < text.length; offset++) assert.equal(textOffset(mapping.positions, mapping.positions[offset]), offset);
  }
});

test('text revisions preserve existing paragraph structures and inline formatting when possible', () => {
  const document = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Introduction' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'The method ' }, { type: 'text', text: 'may help', marks: [{ type: 'bold' }] }, { type: 'text', text: ' by 5%.' }] },
  ] };
  const changed = documentForText(document, 'Introduction\n\nThe method may improve outcomes by 5%.');
  assert.equal(project(changed).text, 'Introduction\n\nThe method may improve outcomes by 5%.');
  assert.equal(changed.content![0].type, 'heading');
  assert.ok(changed.content![1].content!.some(node => node.marks?.some(mark => mark.type === 'bold')));
  for (const target of ['Introduction\n\nNew paragraph.\n\nAnother paragraph.', '', 'Only one paragraph.', 'Introduction\n\nThe method may help by 5%.\n\nNew.']) assert.equal(project(documentForText(document, target)).text, target);
});

test('rich document survives local draft reload and does not leak into unrelated history results', () => {
  const text = 'Original.', document = plainDocument(text);
  const draft = { ...emptyDraft(), text, document, documentText: text };
  let saved = '';
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  writeDraft(storage, draft);
  assert.deepEqual(readDraft(storage).document, document);
  assert.deepEqual(resultDraft(draft, createRevision(text, 'Revised.', 'Revise.', [])).document, document);
  assert.equal(resultDraft(draft, createRevision('Unrelated.', 'Other.', 'Revise.', [])).document, undefined);
});


test('official Simple Editor task lists, alignment, highlights, and images survive text revisions', () => {
  const document = { type: 'doc', content: [
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'A highlighted claim.', marks: [{ type: 'highlight', attrs: { color: '#fff000' } }] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A task.' }] }] }] },
    { type: 'image', attrs: { src: 'data:image/png;base64,dGVzdA==', alt: 'Example' } },
    { type: 'paragraph', content: [{ type: 'text', text: '10', marks: [{ type: 'superscript' }] }] },
  ] };
  const source = project(document).text;
  const revised = documentForText(document, source.replace('claim', 'finding'));
  assert.equal(project(revised).text, source.replace('claim', 'finding'));
  assert.equal(revised.content![0].attrs!.textAlign, 'center');
  assert.ok(revised.content![0].content!.some(node => node.marks?.some(mark => mark.type === 'highlight')));
  assert.equal(revised.content![1].type, 'taskList');
  assert.equal(revised.content![1].content![0].attrs!.checked, true);
  assert.equal(revised.content![2].type, 'image');
  assert.equal(revised.content![3].content![0].marks![0].type, 'superscript');
});
