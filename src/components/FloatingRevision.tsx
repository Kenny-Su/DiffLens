import { useEffect, useRef, useState } from 'react';
import { InstructionComposer } from './InstructionComposer';
import { Icon } from './Icon';

interface Props {
  instruction: string;
  busy: string;
  disabled: boolean;
  onChange: (instruction: string) => void;
  onSend: () => void;
  onRules: () => void;
}

export function FloatingRevision({ instruction, busy, disabled, onChange, onSend, onRules }: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  function cancelClose() { window.clearTimeout(closeTimer.current); }
  function close() { if (!busy) { cancelClose(); setOpen(false); setPinned(false); } }
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); cancelClose(); };
  }, [busy]);
  return <div ref={panel} className={`floating-revision ${open ? 'open' : ''}`}
    onPointerEnter={event => { cancelClose(); if (event.pointerType === 'mouse') setOpen(true); }}
    onPointerLeave={() => {
      if (pinned || busy || panel.current?.contains(document.activeElement)) return;
      closeTimer.current = window.setTimeout(() => { setOpen(false); }, 300);
    }}
    onFocus={event => { if (!trigger.current?.contains(event.target as Node)) { cancelClose(); setPinned(true); } }}
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && !busy) {
        event.preventDefault(); event.stopPropagation(); close();
        requestAnimationFrame(() => trigger.current?.focus());
      }
    }}>
    <button ref={trigger} className="primary floating-revision-trigger" aria-label="Revise document" aria-expanded={open} aria-controls="floating-revision-panel" onClick={() => {
      cancelClose(); setOpen(true); setPinned(true);
      requestAnimationFrame(() => panel.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus());
    }}><Icon name="edit" />Revise</button>
    <section id="floating-revision-panel" inert={!open} aria-hidden={!open} className="floating-revision-panel" aria-label="Revise document">
      <div className="floating-revision-heading"><span><Icon name="edit" />Revise document</span><div>
        <button className="icon-button" aria-label="Standing rules" title="Standing rules" disabled={!!busy} onClick={onRules}><Icon name="settings" /></button>
        <button className="icon-button" aria-label="Close revision input" disabled={!!busy} onClick={() => { close(); requestAnimationFrame(() => trigger.current?.focus()); }}><Icon name="close" /></button>
      </div></div>
      <InstructionComposer instruction={instruction} busy={busy} disabled={disabled} placeholder="How should this document change?" onChange={onChange} onSend={onSend} />
    </section>
  </div>;
}
