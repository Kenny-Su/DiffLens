import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface Props {
  instruction: string;
  busy: string;
  disabled: boolean;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (instruction: string) => void;
  onSend: () => void;
}
export function InstructionComposer({ instruction, busy, disabled, placeholder, autoFocus = false, onChange, onSend }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus && !busy) input.current?.focus({ preventScroll: true }); }, [autoFocus, busy]);
  return <form className="instruction-composer" onSubmit={event => { event.preventDefault(); if (!disabled && !busy && instruction.trim()) onSend(); }}>
    <textarea ref={input} aria-label="Revision instruction" data-initial-focus className="instruction-input" placeholder={placeholder} value={instruction} maxLength={5000} disabled={!!busy} onChange={event => onChange(event.target.value)} />
    <div className="instruction-actions"><button type="submit" className="primary" disabled={disabled || !!busy || !instruction.trim()}>
      {busy ? <><span className="spinner" />{busy}</> : <>Send<Icon name="arrow" /></>}
    </button></div>
  </form>;
}
