import { useEffect, useRef } from 'react';
import type { TextSelection } from '../../shared/types';
import { SelectionRevision } from './SelectionRevision';

interface Props {
  text: string;
  locked: boolean;
  focus: boolean;
  selection: TextSelection | null;
  instruction: string;
  busy: string;
  onChange: (text: string) => void;
  onSelection: (start: number, end: number) => void;
  onInstruction: (instruction: string) => void;
  onGenerate: (selection: TextSelection) => void;
}
export function Editor({ text, locked, focus, selection, instruction, busy, onChange, onSelection, onInstruction, onGenerate }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!locked && focus && !surface.current?.querySelector('[role="dialog"]')) ref.current?.focus({ preventScroll: true }); }, [locked, focus]);
  return <div ref={surface} className="writing-surface">
    <div className="document-label">Your draft</div>
    <textarea ref={ref} className="document-input" aria-label="Document text" aria-keyshortcuts="Alt+Enter" placeholder="Start writing, or paste your text…" value={text} readOnly={locked}
      onChange={event => onChange(event.target.value)}
      onSelect={event => onSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
      onBlur={event => onSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)} spellCheck />
    {selection && focus && <SelectionRevision key={`${selection.start}:${selection.end}`} editor={ref} selection={selection} text={text} instruction={instruction} busy={busy} onInstruction={onInstruction} onSend={onGenerate} />}
  </div>;
}
