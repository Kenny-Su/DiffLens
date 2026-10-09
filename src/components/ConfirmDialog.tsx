import { useEffect, useRef } from 'react';
export interface Confirmation { title: string; message: string; confirmLabel: string; action: () => void }
export function ConfirmDialog({ confirmation, onClose }: { confirmation: Confirmation; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="confirmation" aria-labelledby="confirmation-title" aria-describedby="confirmation-message" onCancel={onClose}>
    <h2 id="confirmation-title">{confirmation.title}</h2><p id="confirmation-message">{confirmation.message}</p>
    <div className="dialog-actions"><button onClick={onClose}>Keep draft</button><button className="primary" onClick={() => { confirmation.action(); onClose(); }}>{confirmation.confirmLabel}</button></div>
  </dialog>;
}
