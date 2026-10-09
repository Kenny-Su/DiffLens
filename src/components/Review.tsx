import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Decision, Run } from '../../shared/types';
import { Icon } from './Icon';

interface Props {
  run: Run;
  readOnly: boolean;
  busy: boolean;
  feedback: Record<string, string>;
  onFeedback: (id: string, text: string) => void;
  onDecide: (ids: string[], decision: Decision) => Promise<void>;
  onFinish: () => void;
  onBack: () => void;
  onUseResult: () => void;
  onExport: () => void;
}
export function Review({ run, readOnly, busy, feedback, onFeedback, onDecide, onFinish, onBack, onUseResult, onExport }: Props) {
  const [showResolved, setShowResolved] = useState(readOnly);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 80 });
  const anchors = useRef(new Map<string, HTMLButtonElement>());
  const panel = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const edit = run.edits.find(edit => edit.id === selected);
  const pending = run.edits.filter(edit => edit.decision === 'pending');
  const available = run.edits.filter(edit => showResolved || edit.decision === 'pending');
  const activeIndex = available.findIndex(edit => edit.id === selected);
  function select(id: string, focusControls = false) {
    setSelected(id);
    setFeedbackOpen(false);
    anchors.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    anchors.current.get(id)?.focus({ preventScroll: true });
    if (focusControls) requestAnimationFrame(() => {
      (panel.current?.querySelector<HTMLButtonElement>('.change-decisions button:not(:disabled)') || panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
    });
  }
  useEffect(() => {
    if (selected && !available.some(edit => edit.id === selected)) {
      const oldIndex = run.edits.findIndex(edit => edit.id === selected);
      const next = available.find(edit => run.edits.indexOf(edit) > oldIndex) || available[0];
      if (next) select(next.id); else setSelected(null);
    }
  }, [run, showResolved, selected]);
  useLayoutEffect(() => {
    if (!selected || !panel.current) return;
    const place = () => {
      const anchor = anchors.current.get(selected);
      if (!anchor || !panel.current) return;
      const target = anchor.getBoundingClientRect();
      const rect = panel.current.getBoundingClientRect();
      const left = Math.max(12, Math.min(target.left, window.innerWidth - rect.width - 12));
      const below = target.bottom + 10;
      const top = Math.max(12, Math.min(below + rect.height <= window.innerHeight - 12 ? below : target.top - rect.height - 10, window.innerHeight - rect.height - 12));
      setPosition(previous => previous.left === left && previous.top === top ? previous : { left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    observer.observe(panel.current);
    if (canvas.current) observer.observe(canvas.current);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer.disconnect(); };
  }, [selected, run, showResolved, feedbackOpen]);
  useEffect(() => {
    if (!selected) return;
    const closeOutside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && ![...anchors.current.values()].some(anchor => anchor.contains(event.target as Node))) setSelected(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { setSelected(null); anchors.current.get(selected)?.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape); };
  }, [selected]);
  return <>
    <div className="review-toolbar">
      <div className="review-title"><span className="review-dot" /><strong>{readOnly ? 'History preview' : 'Review changes'}</strong><span className="review-count" role="status">{pending.length} remaining</span></div>
      <div className="review-actions">{readOnly ? <><button onClick={onBack} disabled={busy}>Back to draft</button><button className="primary" onClick={onUseResult} disabled={busy}>Use result</button></> : <>
        <button onClick={() => onDecide(pending.map(edit => edit.id), 'accepted')} disabled={busy || !pending.length}>Accept remaining</button>
        <button onClick={() => onDecide(pending.map(edit => edit.id), 'rejected')} disabled={busy || !pending.length}>Reject remaining</button>
        <button className="primary" onClick={onFinish} disabled={busy}>Return to writing<Icon name="arrow" /></button>
      </>}</div>
    </div>
    <div className="review-options"><label><input type="checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)} />Show resolved</label><button className="text-button" onClick={onExport}><Icon name="download" />Export revision JSON</button></div>
    <div className="document-scroll" ref={canvas}>
      <div className="review-document"><div className="document-label">{run.selection ? 'Selected passage revision' : 'Document revision'}</div>
        <div className="document-passage" aria-label="Document changes">{run.segments.map((segment, index) => {
          if (segment.text !== undefined) return <Fragment key={index}>{segment.text}</Fragment>;
          const item = run.edits.find(edit => edit.id === segment.editId)!;
          if (item.decision !== 'pending' && !showResolved) return <Fragment key={index}>{item.decision === 'accepted' ? item.after : item.before}</Fragment>;
          const number = run.edits.indexOf(item) + 1;
          const label = `Change ${number}: ${item.before ? item.after ? `replace ${item.before} with ${item.after}` : `delete ${item.before}` : `insert ${item.after}`}. ${item.decision}`;
          return <button key={index} ref={node => { if (node) anchors.current.set(item.id, node); else anchors.current.delete(item.id); }} className={`inline-change ${item.decision} ${selected === item.id ? 'selected' : ''}`} aria-label={label} aria-haspopup="dialog" aria-expanded={selected === item.id} onClick={event => select(item.id, event.detail === 0)}>
            {item.decision === 'pending' ? <>{item.before && <del>{item.before}</del>}{item.after && <ins>{item.after}</ins>}</> : <span>{(item.decision === 'accepted' ? item.after : item.before) || <span className="empty-change">∅</span>}</span>}
          </button>;
        })}</div>
        {!run.edits.length && <p className="review-hint">No changes were suggested.</p>}
        {!pending.length && !readOnly && <p className="review-hint">All changes reviewed. Return to writing whenever you’re ready.</p>}
      </div>
    </div>
    {edit && <div ref={panel} className="change-popover" role="dialog" aria-label={`Change ${run.edits.indexOf(edit) + 1}`} style={position}>
      <div className="change-heading"><span>Change {run.edits.indexOf(edit) + 1} <span className="muted">of {run.edits.length}</span></span><div className="change-navigation"><button className="icon-button" aria-label="Previous change" disabled={activeIndex <= 0} onClick={event => select(available[activeIndex - 1].id, event.detail === 0)}><Icon name="left" /></button><button className="icon-button" aria-label="Next change" disabled={activeIndex < 0 || activeIndex >= available.length - 1} onClick={event => select(available[activeIndex + 1].id, event.detail === 0)}><Icon name="right" /></button><button className="icon-button" aria-label="Close change controls" onClick={() => setSelected(null)}><Icon name="close" /></button></div></div>
      <div className="change-preview">{edit.before && <p className="before-text">{edit.before}</p>}{edit.after && <p className="after-text">{edit.after}</p>}</div>
      {readOnly ? <p className="field-hint">{edit.decision === 'pending' ? 'Unresolved' : edit.decision === 'accepted' ? 'Accepted' : 'Rejected'} in this saved revision.{edit.feedback && <> Feedback: {edit.feedback}</>}</p> : <>
        <div className="change-decisions"><button className="accept-button" disabled={busy || edit.decision === 'accepted'} onClick={() => onDecide([edit.id], 'accepted')}><Icon name="check" />Accept</button><button disabled={busy || edit.decision === 'rejected'} onClick={() => onDecide([edit.id], 'rejected')}><Icon name="close" />Reject</button></div>
        <div className="change-secondary"><button className="text-button" aria-expanded={feedbackOpen} onClick={() => setFeedbackOpen(value => !value)}>{feedbackOpen ? 'Hide feedback' : edit.feedback || feedback[edit.id] ? 'Edit feedback' : 'Add feedback'}</button>{edit.decision !== 'pending' && <button className="text-button" disabled={busy} onClick={() => onDecide([edit.id], 'pending')}><Icon name="undo" />Undo</button>}</div>
        {feedbackOpen && <div className="change-feedback"><label className="field-label" htmlFor="change-feedback">Feedback on this change</label><textarea id="change-feedback" value={feedback[edit.id] ?? edit.feedback} disabled={busy} maxLength={5000} onChange={event => onFeedback(edit.id, event.target.value)} placeholder="What would work better?" /><button disabled={busy || (feedback[edit.id] ?? edit.feedback) === edit.feedback} onClick={() => onDecide([edit.id], edit.decision)}>Save feedback</button></div>}
      </>}
    </div>}
  </>;
}
