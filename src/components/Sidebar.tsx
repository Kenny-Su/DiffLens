import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../useWorkspace';
import { Icon } from './Icon';
import { Messages } from './Messages';
import { StandingRules } from './StandingRules';
import { FidelityDetails } from './Fidelity';
import { InstructionComposer } from './InstructionComposer';

export function useNarrowScreen() {
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const media = matchMedia('(max-width: 900px)');
    const change = () => setMobile(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return mobile;
}

export function Sidebar({ workspace: w, mobile, onRevisit }: { workspace: Workspace; mobile: boolean; onRevisit: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current!;
    const focus = panel.querySelector<HTMLElement>('[data-initial-focus]') || panel.querySelector<HTMLElement>('button');
    focus?.focus({ preventScroll: true });
    const handle = (event: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); w.setSidebar(null); }
      if (event.key === 'Tab' && matchMedia('(max-width: 900px)').matches) {
        const collapsed = [...panel.querySelectorAll('details:not([open])')];
        const elements = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), summary')].filter(element => element.getClientRects().length && collapsed.every(detail => !detail.contains(element) || detail.querySelector(':scope > summary')?.contains(element)));
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handle);
    return () => { document.removeEventListener('keydown', handle); previous?.focus({ preventScroll: true }); };
  }, [w.sidebar, w.setSidebar, mobile]);
  return <>
    <button className="sidebar-backdrop" aria-label="Dismiss sidebar backdrop" tabIndex={-1} onClick={() => w.setSidebar(null)} />
    <aside ref={ref} className="sidebar" role={mobile ? 'dialog' : 'complementary'} aria-modal={mobile || undefined} aria-labelledby="sidebar-title">
      <div className="sidebar-heading">
        {w.sidebar === 'rules' && <button className="icon-button" aria-label="Back to revision" onClick={() => w.setSidebar('revise')}><Icon name="left" /></button>}
        <h2 id="sidebar-title">{w.sidebar === 'fidelity' ? 'Fidelity details' : w.sidebar === 'history' ? 'Revision history' : w.sidebar === 'rules' ? 'Standing rules' : 'Revise document'}</h2>
        <div className="sidebar-heading-actions">
          {w.sidebar === 'revise' && <button className="icon-button" aria-label="Standing rules" title="Standing rules" onClick={() => w.setSidebar('rules')}><Icon name="settings" /></button>}
          <button className="icon-button" aria-label="Close sidebar" onClick={() => w.setSidebar(null)}><Icon name="close" /></button>
        </div>
      </div>
      {mobile && <Messages workspace={w} />}
      <div className="sidebar-content">{w.sidebar === 'revise' ? <>
        <InstructionComposer instruction={w.draft.instruction} busy={w.busy} disabled={!w.draft.text.trim() || w.draft.text.length > 30000} placeholder="How should this document change?" onChange={w.editInstruction} onSend={() => w.generate()} />
      </> : w.sidebar === 'rules' ? <StandingRules workspace={w} /> : w.sidebar === 'fidelity' ? <FidelityDetails workspace={w} onRevisit={onRevisit} /> : <>
        <p className="field-hint">Inspect a revision without replacing your draft.</p>
        {!w.history.length && <p className="history-empty">Your revisions will appear here.</p>}
        <div className="history-list">{w.history.map(item => <button className={`history-item ${w.preview?.id === item.id ? 'active' : ''}`} key={item.id} disabled={!!w.busy} onClick={() => { w.previewRun(item); if (mobile) w.setSidebar(null); }}>
          <strong>{item.instruction}</strong><span>{item.original.slice(0, 90)}</span><small>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {item.edits.length} {item.edits.length === 1 ? 'change' : 'changes'}{item.selection ? ' · Selection' : ''}</small>
        </button>)}</div>
      </>}</div>
    </aside>
  </>;
}
