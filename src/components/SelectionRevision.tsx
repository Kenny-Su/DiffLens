import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { TextSelection } from '../../shared/types';
import { selectionError } from '../../shared/selection';
import { selectionAnchor } from '../lib/selectionAnchor';
import { Icon } from './Icon';
import { InstructionComposer } from './InstructionComposer';

interface Props {
  editor: RefObject<HTMLTextAreaElement | null>;
  selection: TextSelection;
  text: string;
  instruction: string;
  busy: string;
  onInstruction: (instruction: string) => void;
  onSend: (selection: TextSelection) => void;
}
export function SelectionRevision({ editor, selection, text, instruction, busy, onInstruction, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, maxWidth: 320, maxHeight: 500, visible: false });
  const [highlights, setHighlights] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const rangeError = selectionError(text, selection);

  useLayoutEffect(() => {
    const input = editor.current, popup = panel.current;
    if (!input || !popup) return;
    const place = () => {
      const anchor = selectionAnchor(input, selection);
      if (!anchor) return;
      const viewport = window.visualViewport;
      const x = (viewport?.offsetLeft || 0) + 12, y = (viewport?.offsetTop || 0) + 12;
      const maxWidth = Math.max(0, (viewport?.width || window.innerWidth) - 24);
      const maxHeight = Math.max(0, (viewport?.height || window.innerHeight) - 24);
      const rect = popup.getBoundingClientRect();
      const width = Math.min(rect.width, maxWidth), height = Math.min(rect.height, maxHeight);
      const left = Math.max(x, Math.min(anchor.left, x + maxWidth - width));
      const below = anchor.bottom + 10;
      const top = Math.max(y, Math.min(below + height <= y + maxHeight ? below : anchor.top - height - 10, y + maxHeight - height));
      const next = { left, top, maxWidth, maxHeight, visible: open || anchor.visible };
      setPosition(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
      setHighlights(previous => JSON.stringify(previous) === JSON.stringify(anchor.highlights) ? previous : anchor.highlights);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(popup);
    observer.observe(input);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [editor, selection, open, dismissed]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!busy && !panel.current?.contains(event.target as Node)) { setOpen(false); setDismissed(true); }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]') || busy) return;
      if (event.altKey && event.key === 'Enter' && event.target === editor.current) {
        event.preventDefault(); setDismissed(false); setOpen(true);
      }
      if (event.key === 'Escape' && !dismissed) {
        event.preventDefault(); setOpen(false); setDismissed(true); editor.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, [busy, dismissed, editor]);

  if (dismissed) return null;
  const { visible, ...style } = position;
  return <>
    {open && highlights.map((rect, index) => <span key={index} className="selection-highlight" aria-hidden="true" style={rect} />)}
    <div ref={panel} className={`selection-revision ${open ? 'open' : ''}`} role={open ? 'dialog' : undefined} aria-label={open ? 'Revise selected text' : undefined} style={{ ...style, visibility: visible ? 'visible' : 'hidden' }}>
    {open ? <>
      <div className="selection-heading"><span>Revise selection</span><button className="icon-button" aria-label="Close selection revision" disabled={!!busy} onClick={() => { setOpen(false); setDismissed(true); editor.current?.focus({ preventScroll: true }); }}><Icon name="close" /></button></div>
      <InstructionComposer instruction={instruction} busy={busy} disabled={text.length > 30000 || !!rangeError} placeholder="How should this passage change?" autoFocus onChange={onInstruction} onSend={() => onSend(selection)} />
      {rangeError && <p className="field-error" role="alert">{rangeError}</p>}
    </> : <button className="selection-trigger" aria-haspopup="dialog" aria-expanded={false} aria-keyshortcuts="Alt+Enter" title="Revise selected text (Alt+Enter)" disabled={!!busy} onClick={() => setOpen(true)}><Icon name="edit" />Revise selection</button>}
    </div>
  </>;
}
