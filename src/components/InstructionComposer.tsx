import { useEffect, useLayoutEffect, useRef } from 'react';
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
  useLayoutEffect(() => {
    const field = input.current;
    if (!field) return;
    const resize = () => {
      field.style.height = 'auto';
      const style = window.getComputedStyle(field);
      const minimum = Number.parseFloat(style.minHeight) || 0;
      const maximum = Number.parseFloat(style.maxHeight) || Infinity;
      const border = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
      const contentHeight = field.scrollHeight + border;
      field.style.height = `${Math.min(maximum, Math.max(minimum, contentHeight))}px`;
      field.style.overflowY = contentHeight > maximum ? 'auto' : 'hidden';
    };
    resize();
    let width = field.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; resize(); }
    });
    observer.observe(field);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [instruction]);
  useEffect(() => { if (autoFocus && !busy) input.current?.focus({ preventScroll: true }); }, [autoFocus, busy]);
  return <form className="instruction-composer" onSubmit={event => { event.preventDefault(); if (!disabled && !busy && instruction.trim()) onSend(); }}>
    <textarea ref={input} rows={2} aria-label="Revision instruction" data-initial-focus className="instruction-input" placeholder={placeholder} value={instruction} maxLength={5000} disabled={!!busy} onChange={event => onChange(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        if (!event.repeat && !disabled && !busy && instruction.trim()) event.currentTarget.form?.requestSubmit();
      }} />
    <div className="instruction-actions"><button type="submit" className="primary instruction-send" aria-label={busy || 'Send revision instruction'} title={busy || 'Send (Enter). Shift+Enter for a new line.'} disabled={disabled || !!busy || !instruction.trim()}>
      {busy ? <span className="spinner" /> : <Icon name="up" size={18} />}
    </button></div>
  </form>;
}
