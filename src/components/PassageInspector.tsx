import { useState } from 'react';
import type { Assessment, Decision, ReviewPassage, Run } from '../../shared/types';
import { passageState, proposedPassageText } from '../../shared/passages';
import { Icon } from './Icon';

interface Props {
  run: Run; passage: ReviewPassage; index: number; count: number; readOnly: boolean; busy: boolean; finalResult: boolean;
  text: string; feedback: string; concerns: Assessment[]; previous: boolean; next: boolean;
  onText: (text: string) => void; onFeedback: (text: string) => void; onSaveFeedback: () => Promise<void>;
  onDecide: (decision: Decision, text?: string, keyboard?: boolean) => Promise<void>; onNavigate: (direction: number) => void; onClose: () => void; onAudit: () => void;
}
export function PassageInspector({ run, passage, index, count, readOnly, busy, finalResult, text, feedback, concerns, previous, next, onText, onFeedback, onSaveFeedback, onDecide, onNavigate, onClose, onAudit }: Props) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const state = passageState(run, passage), committed = proposedPassageText(run, passage);
  const edited = text !== passage.after, unapplied = text !== committed;
  const savedFeedback = run.passageReviews?.[passage.id]?.feedback || '';
  return <section className="passage-inspector" aria-label={`Inspect passage ${index + 1}`} onKeyDown={event => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.stopPropagation(); onClose(); }
  }}>
    <div className="passage-heading"><strong>Passage {index + 1} <span className="muted">of {count}</span></strong><div className="passage-navigation">
      <button className="icon-button" aria-label="Previous passage" disabled={!previous} onClick={() => onNavigate(-1)}><Icon name="left" /></button>
      <button className="icon-button" aria-label="Next passage" disabled={!next} onClick={() => onNavigate(1)}><Icon name="right" /></button>
      <button className="icon-button" aria-label="Close passage inspector" onClick={onClose}><Icon name="close" /></button>
    </div></div>
    <div className="passage-comparison"><div><span className="field-label">Original</span><div className="passage-original">{passage.before || <span className="muted">No original text — insertion</span>}</div></div>
      <div>{readOnly ? <><span className="field-label">{finalResult ? 'Saved result' : edited ? 'Author replacement' : 'Proposed'}</span><div className="passage-proposed">{text || <span className="muted">Passage deleted</span>}</div></> : <>
        <label className="field-label" htmlFor="passage-replacement">Proposed · editable</label>
        <textarea id="passage-replacement" value={text} disabled={busy} maxLength={30000} rows={Math.min(12, Math.max(4, text.split('\n').length + Math.ceil(text.length / 55)))} onChange={event => onText(event.target.value)} aria-describedby="passage-edit-status" />
      </>}</div>
    </div>
    {edited && <details className="passage-model"><summary>Original model proposal</summary><p>{passage.after || 'Passage deleted'}</p></details>}
    {!readOnly && <p className="field-hint" id="passage-edit-status" role="status">{unapplied ? 'Manual edit not applied. Saved locally with this review.' : state === 'mixed' ? 'Partially reviewed. A passage decision replaces the individual decisions.' : state === 'accepted' ? edited ? 'Author replacement applied.' : 'Accepted.' : state === 'rejected' ? 'Original retained.' : 'Pending. Returning to writing keeps the original until you accept this passage.'}{edited && ' Manual changes receive a fidelity check when you return to writing.'}</p>}
    {!!concerns.length && <div className="passage-audit"><strong>{finalResult ? 'Final fidelity check' : 'Proposal fidelity'}</strong>{[...new Map(concerns.map(item => [item.reason, item])).values()].map(item => <p key={item.id}>{item.reason}</p>)}
      {!finalResult && edited && <p>These findings concern the model proposal, not your manual replacement.</p>}
      <button className="text-button" onClick={onAudit}>Details and feedback<Icon name="arrow" /></button>
    </div>}
    {readOnly ? <p className="field-hint">{state === 'mixed' ? 'Partially reviewed' : state === 'pending' ? 'Unresolved' : state === 'accepted' ? 'Accepted' : 'Rejected'} in this saved revision.{savedFeedback && <> Feedback: {savedFeedback}</>}</p> : <>
      <div className="passage-decisions"><button className="primary" disabled={busy || state === 'accepted' && !unapplied} onClick={event => onDecide('accepted', text, event.detail === 0)}><Icon name="check" />{edited ? 'Use edited text' : 'Accept'}</button>
        <button disabled={busy || state === 'rejected' && !unapplied} onClick={event => onDecide('rejected', undefined, event.detail === 0)}><Icon name="close" />Reject</button>
        {state !== 'pending' && <button className="text-button" disabled={busy} onClick={event => onDecide('pending', undefined, event.detail === 0)}><Icon name="undo" />Undo decision</button>}
      </div>
      <div className="passage-secondary"><button className="text-button" disabled={busy || text === passage.after} onClick={() => onText(passage.after)}>Reset to proposal</button><button className="text-button" aria-expanded={feedbackOpen} onClick={() => setFeedbackOpen(value => !value)}>{feedbackOpen ? 'Hide feedback' : savedFeedback || feedback ? 'Edit feedback' : 'Add feedback'}</button></div>
      {feedbackOpen && <div className="passage-feedback"><label className="field-label" htmlFor="passage-feedback">Feedback on this passage</label><textarea id="passage-feedback" value={feedback} disabled={busy} maxLength={5000} onChange={event => onFeedback(event.target.value)} placeholder="What would work better?" /><button disabled={busy || feedback === savedFeedback} onClick={async event => {
        const field = event.currentTarget.parentElement?.querySelector('textarea'), keyboard = event.detail === 0;
        await onSaveFeedback();
        if (keyboard) requestAnimationFrame(() => field?.focus());
      }}>Save feedback</button></div>}
    </>}
  </section>;
}
