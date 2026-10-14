import { useEffect, useRef, useState } from 'react';
import type { Editor as TiptapEditor, JSONContent } from '@tiptap/react';
import { SimpleEditor } from './tiptap-templates/simple/simple-editor';
import type { TextSelection } from '../../shared/types';
import { documentForText, projectDocument, textOffset } from '../lib/richText';
import { SelectionRevision } from './SelectionRevision';

interface Props {
  text: string; document?: JSONContent;
  locked: boolean; focus: boolean;
  selection: TextSelection | null;
  instruction: string; busy: string;
  onChange: (text: string, document?: JSONContent) => void;
  onSelection: (start: number, end: number) => void;
  onInstruction: (instruction: string) => void;
  onGenerate: (selection: TextSelection) => void;
}
export function Editor({ text, document, locked, focus, selection, instruction, busy, onChange, onSelection, onInstruction, onGenerate }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<TiptapEditor | null>(null);
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!locked, false);
    if (projectDocument(editor.state.doc).text !== text) editor.commands.setContent(documentForText(document ?? editor.getJSON(), text), { emitUpdate: false });
    if (!locked && JSON.stringify(editor.getJSON()) !== JSON.stringify(document)) onChange(text, editor.getJSON());
  }, [editor, text, document, locked, onChange]);
  useEffect(() => {
    if (editor && !locked && focus && !surface.current?.querySelector('[role="dialog"]')) editor.commands.focus(undefined, { scrollIntoView: false });
  }, [editor, locked, focus]);
  return <div ref={surface} className="official-editor-surface">
    <SimpleEditor content={documentForText(document, text)} editable={!locked} onEditorReady={setEditor}
      onUpdate={editor => onChange(projectDocument(editor.state.doc).text, editor.getJSON())}
      onSelectionChange={editor => {
        const { positions } = projectDocument(editor.state.doc);
        onSelection(textOffset(positions, editor.state.selection.from), textOffset(positions, editor.state.selection.to));
      }} />
    {editor && selection && focus && <SelectionRevision key={`${selection.start}:${selection.end}`} editor={editor} selection={selection} text={text} instruction={instruction} busy={busy} onInstruction={onInstruction} onSend={onGenerate} />}
  </div>;
}
