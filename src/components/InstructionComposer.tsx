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
    <textarea ref={input} rows={4} aria-label="Revision instruction" data-initial-focus className="instruction-input" placeholder={placeholder} value={instruction} maxLength={5000} disabled={!!busy} onChange={event => onChange(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
        event.preventDefault();
        if (!event.repeat && !disabled && !busy && instruction.trim()) event.currentTarget.form?.requestSubmit();
      }} />
    <div className="instruction-actions"><button type="submit" className="primary instruction-send" aria-label={busy || 'Send revision instruction'} title={busy || 'Send (Enter). Shift+Enter for a new line.'} disabled={disabled || !!busy || !instruction.trim()}>
      {busy ? <span className="spinner" /> : <Icon name="up" size={18} />}
    </button></div>
  </form>;
}
