import { useEffect, useRef } from 'react';
import type { TextSelection } from '../../shared/types';
import { sourceOffset } from '../lib/selectionAnchor';
import { SelectionRevision } from './SelectionRevision';

interface Props {
  text: string; locked: boolean; focus: boolean;
  selection: TextSelection | null;
  instruction: string; busy: string;
  onChange: (text: string) => void;
  onSelection: (start: number, end: number) => void;
  onInstruction: (instruction: string) => void;
  onGenerate: (selection: TextSelection) => void;
}
export function Editor({ text, locked, focus, selection, instruction, busy, onChange, onSelection, onInstruction, onGenerate }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!locked && focus && !surface.current?.querySelector('[role="dialog"]')) input.current?.focus({ preventScroll: true });
  }, [locked, focus]);
  return <div ref={surface} className="plain-editor">
    <textarea ref={input} className="document-page document-text document-input" aria-label="Document text" aria-keyshortcuts="Alt+Enter"
      placeholder="Start writing, or paste your text…" value={text} readOnly={locked} spellCheck wrap="soft"
      onChange={event => onChange(event.currentTarget.value)}
      onSelect={event => {
        const field = event.currentTarget;
        onSelection(sourceOffset(text, field.selectionStart), sourceOffset(text, field.selectionEnd));
      }} />
    {input.current && selection && focus && <SelectionRevision key={`${selection.start}:${selection.end}`} input={input.current} selection={selection} text={text} instruction={instruction} busy={busy} onInstruction={onInstruction} onSend={onGenerate} />}
  </div>;
}
