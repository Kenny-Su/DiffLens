import { useEffect, useRef } from 'react';
export function Editor({ text, locked, focus, onChange, onSelection }: { text: string; locked: boolean; focus: boolean; onChange: (text: string) => void; onSelection: (start: number, end: number) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!locked && focus) ref.current?.focus({ preventScroll: true }); }, [locked, focus]);
  return <div className="writing-surface">
    <div className="document-label">Your draft</div>
    <textarea ref={ref} className="document-input" aria-label="Document text" placeholder="Start writing, or paste your text…" value={text} readOnly={locked}
      onChange={event => onChange(event.target.value)}
      onSelect={event => onSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
      onBlur={event => onSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)} spellCheck />
  </div>;
}
