import { getSchema, type JSONContent } from '@tiptap/react';
import { simpleEditorExtensions } from './simpleEditorExtensions.js';
import { Fragment, Node, Slice } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import { diffWordsWithSpace } from 'diff';

const schema = getSchema(simpleEditorExtensions());
export function plainDocument(text: string): JSONContent {
  return { type: 'doc', content: text.split('\n\n').map(paragraph => ({ type: 'paragraph', content: paragraph.split('\n').flatMap((line, index) => [
    ...(index ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : []),
  ]) })) };
}

// The backend uses UTF-16 text offsets. Keep an explicit mapping rather than
// treating ProseMirror's structural positions as string offsets.
export function projectDocument(doc: Node) {
  let text = '';
  const positions: number[] = [];
  let blocks = 0;
  doc.descendants((block, position) => {
    if (!block.isTextblock) return true;
    const start = position + 1;
    if (blocks++) {
      positions[text.length] ??= start;
      text += '\n'; positions[text.length] = Math.floor((positions[text.length - 1] + start) / 2);
      text += '\n';
    }
    positions[text.length] = start;
    block.descendants((node, offset) => {
      const value = node.isText ? node.text! : node.type.name === 'hardBreak' ? '\n' : '';
      for (let index = 0; index < value.length; index++) { positions[text.length] = start + offset + index; text += value[index]; }
      positions[text.length] = start + offset + (node.isText ? value.length : node.nodeSize);
      return false;
    });
    positions[text.length] ??= start;
    return false;
  });
  positions[0] ??= 0;
  return { text, positions };
}
export function textOffset(positions: number[], position: number) {
  let left = 0, right = positions.length;
  while (left < right) {
    const middle = (left + right) >>> 1;
    if (positions[middle] < position) left = middle + 1;
    else right = middle;
  }
  return Math.min(left, positions.length - 1);
}

export function documentForText(content: JSONContent | undefined, target: string): JSONContent {
  if (!content) return plainDocument(target);
  let doc: Node;
  try { doc = Node.fromJSON(schema, content); } catch { return plainDocument(target); }
  const source = projectDocument(doc);
  if (source.text === target) return content;
  const parts = diffWordsWithSpace(source.text, target, { timeout: 100 });
  if (!parts) return plainDocument(target);
  const edits: { start: number; end: number; text: string }[] = [];
  let offset = 0;
  for (let index = 0; index < parts.length;) {
    if (!parts[index].added && !parts[index].removed) { offset += parts[index++].value.length; continue; }
    const start = offset;
    let replacement = '';
    while (index < parts.length && (parts[index].added || parts[index].removed)) {
      const part = parts[index++];
      if (part.removed) offset += part.value.length;
      else replacement += part.value;
    }
    edits.push({ start, end: offset, text: replacement });
  }
  const transform = new Transform(doc);
  try {
    for (const edit of edits.reverse()) {
      const from = source.positions[edit.start], to = source.positions[edit.end];
      const marks = doc.resolve(from).marksAcross(doc.resolve(to)) ?? doc.resolve(from).marks();
      let slice = Slice.empty;
      if (edit.text) {
        const inserted = Node.fromJSON(schema, plainDocument(edit.text));
        const paragraphs = inserted.content;
        if (paragraphs.childCount === 1) {
          const inline = paragraphs.firstChild!.content;
          const marked: Node[] = [];
          inline.forEach(node => marked.push(node.isText ? node.mark(marks) : node));
          slice = new Slice(Fragment.fromArray(marked), 0, 0);
        } else slice = new Slice(paragraphs, 1, 1);
      }
      transform.replaceRange(from, to, slice);
    }
    if (projectDocument(transform.doc).text === target) return transform.doc.toJSON();
  } catch { /* Unsupported structural replacements fall back to valid text. */ }
  return plainDocument(target);
}
