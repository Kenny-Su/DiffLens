import type { AnyExtension } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { FindAndReplace } from '@tiptap/extension-find-and-replace';
import { Selection, Placeholder } from '@tiptap/extensions';
import { HorizontalRule } from '../components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension.js';
import { ImageUploadNode } from '../components/tiptap-node/image-upload-node/image-upload-node-extension.js';

// The official Simple Editor configuration, shared with the text-offset adapter.
export function simpleEditorExtensions(imageUpload: AnyExtension = ImageUploadNode) {
  return [
    StarterKit.configure({ horizontalRule: false, link: { openOnClick: false, enableClickSelection: true } }),
    HorizontalRule,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList, TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }), Image.configure({ allowBase64: true }), Typography,
    Superscript, Subscript, Selection,
    FindAndReplace.configure({ searchDebounceMs: 500, injectCSS: false }),
    imageUpload,
    Placeholder.configure({ placeholder: ({ node }) => node.type.name === 'paragraph' ? 'Start writing, or paste your text…' : '' }),
  ];
}
