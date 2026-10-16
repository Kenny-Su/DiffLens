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

export function RevisionBar({ instruction, busy, disabled, onChange, onSend, onRules }: Props) {
  return <section className="revision-bar" aria-label="Revise document">
    <button className="icon-button" aria-label="Standing rules" title="Standing rules" disabled={!!busy} onClick={onRules}><Icon name="settings" size={20} /></button>
    <InstructionComposer rows={1} instruction={instruction} busy={busy} disabled={disabled} placeholder="Describe a revision…" onChange={onChange} onSend={onSend} />
  </section>;
}
