# Official Tiptap Simple Editor integration

Installed with the official Tiptap CLI from the MIT-licensed [Simple Editor template](https://tiptap.dev/docs/ui-components/templates/simple-editor).

The generated toolbar, menus, node styles, and responsive behavior are retained. DiffLens supplies draft content, persistence, selection-to-text mapping, and revision controls through component props. The extension configuration is shared with the text adapter to preserve template-specific nodes and marks.

Integration changes:
- Replace bundled demo content with the user's draft.
- Use the official Placeholder extension and the template's paragraph styles.
- Constrain the template shell to the application's workspace.
- Scope the template's font styling to the editor so other app controls retain their appearance.
- Omit the global theme toggle until the whole application supports dark mode.
- Replace the demo image uploader with local file reading; images remain in the local draft.
- Separate the image upload node schema from its React node view so headless tests use the same document schema.

Formatting and image content is stored in the local draft. Revision history and fidelity auditing still operate on text snapshots; they do not yet audit formatting or images.
