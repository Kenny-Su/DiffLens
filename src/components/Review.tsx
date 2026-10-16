import { useEffect, useMemo, useRef, useState } from 'react';
import type { Decision, Run, FidelityAudit, ReviewPassage } from '../../shared/types';
import { needsAttention } from '../../shared/fidelity';
import { passageKey, passagePending, passageState, proposedPassageText } from '../../shared/passages';
import { reviewDocument } from '../lib/reviewDocument';
import { ReviewDocument } from './ReviewDocument';
import { FidelityStatus } from './Fidelity';
import { PassageInspector } from './PassageInspector';
import { Icon } from './Icon';

interface Props {
  run: Run; readOnly: boolean; busy: boolean;
  feedback: Record<string, string>; drafts: Record<string, string>;
  onFeedback: (id: string, text: string) => void; onText: (id: string, text: string) => void; onSaveFeedback: (id: string) => Promise<void>;
  onDecide: (ids: string[], decision: Decision, replacementText?: string, bulk?: boolean) => Promise<boolean>;
  onFinish: () => void; onBack: () => void; onUseResult: () => void; onExport: () => void;
  audit?: FidelityAudit; finalResult: boolean; onAudit: () => void; onRevisit: () => void;
  focusEdit: { id: string; nonce: number } | null;
}
export function Review({ run, readOnly, busy, feedback, drafts, onFeedback, onText, onSaveFeedback, onDecide, onFinish, onBack, onUseResult, onExport, audit, finalResult, onAudit, onRevisit, focusEdit }: Props) {
  const [showResolved, setShowResolved] = useState(readOnly);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const resolvedToggle = useRef<HTMLInputElement>(null);
  const finishButton = useRef<HTMLButtonElement>(null);
  const passages = run.passages || [];
  const passage = passages.find(item => item.id === selected);
  const concernsFor = (item: ReviewPassage) => audit?.status === 'complete' ? audit.assessments.filter(assessment => needsAttention(assessment) && assessment.editIds.some(id => item.editIds.includes(id))) : [];
  const hasDraft = (item: ReviewPassage) => !readOnly && drafts[passageKey(run.id, item.id)] !== undefined && drafts[passageKey(run.id, item.id)] !== proposedPassageText(run, item);
  const marked = (item: ReviewPassage) => showResolved || passagePending(run, item) || hasDraft(item) || !!concernsFor(item).length;
  const content = useMemo(() => reviewDocument(run, !readOnly, showResolved), [run, readOnly, showResolved]);
  const pending = passages.filter(item => passagePending(run, item));
  const available = passages.filter(item => marked(item) || item.id === selected);
  const activeIndex = available.findIndex(item => item.id === selected);
  function select(id: string, position?: number, focus = false) {
    setSelected(id); setSelectedPosition(position ?? null);
    requestAnimationFrame(() => {
      const inspector = canvas.current?.querySelector<HTMLElement>('.passage-inspector');
      inspector?.scrollIntoView({ block: 'nearest' });
      if (focus) (inspector?.querySelector<HTMLElement>('textarea') || inspector?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    });
  }
  function close() {
    const remains = passage && marked(passage);
    setSelected(null); setSelectedPosition(null);
    requestAnimationFrame(() => (remains ? canvas.current?.querySelector<HTMLElement>(`[data-passage="${selected}"]`) : resolvedToggle.current)?.focus({ preventScroll: true }));
  }
  async function bulk(decision: Decision, keyboard: boolean) {
    const saved = await onDecide(pending.map(item => item.id), decision, undefined, true);
    if (saved && keyboard) requestAnimationFrame(() => finishButton.current?.focus());
  }
  useEffect(() => {
    if (!focusEdit) return;
    const target = passages.find(item => item.editIds.includes(focusEdit.id));
    if (target) { setShowResolved(true); select(target.id, undefined, true); }
  }, [focusEdit?.nonce]);
  return <>
    <div className="review-toolbar"><div className="review-title"><span className="review-dot" /><strong>{readOnly ? 'History preview' : 'Review passages'}</strong><span className="review-count" role="status">{pending.length} remaining</span><FidelityStatus audit={audit} onClick={onAudit} prefix={finalResult ? 'Final check' : 'Proposal fidelity'} /></div>
      <div className="review-actions">{readOnly ? <><button onClick={onBack} disabled={busy}>Back to draft</button><button onClick={onRevisit} disabled={busy}>Revisit review</button><button className="primary" onClick={onUseResult} disabled={busy}>Use result</button></> : <>
        <button onClick={event => bulk('accepted', event.detail === 0)} disabled={busy || !pending.length}>Accept remaining</button>
        <button onClick={event => bulk('rejected', event.detail === 0)} disabled={busy || !pending.length}>Reject remaining</button>
        <button ref={finishButton} className="primary" onClick={onFinish} disabled={busy}>Return to writing<Icon name="arrow" /></button>
      </>}</div>
    </div>
    <div className="review-options"><div className="review-view-options">
      <span className="diff-legend"><del>Removed</del><ins>Added</ins></span>
      <label><input ref={resolvedToggle} type="checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)} />Show resolved</label>
    </div><button className="text-button" onClick={onExport}><Icon name="download" />Export revision JSON</button></div>
    <div className="document-scroll" ref={canvas}><div className="document-page">
      <div className="document-label">{readOnly ? finalResult ? 'Saved result' : 'Saved review' : 'Proposed changes · unresolved proposals shown'}{run.selection && ' · Selected passage'}</div>
      <ReviewDocument content={content} selected={selected} selectedPosition={selectedPosition} onSelect={select}
        passages={available.map(item => ({
          id: item.id, concern: !!concernsFor(item).length, draft: hasDraft(item),
          label: `Inspect passage ${passages.indexOf(item) + 1}. ${passageState(run, item) === 'mixed' ? 'Partially reviewed' : passageState(run, item)}${concernsFor(item).length ? '. Fidelity concern' : ''}${hasDraft(item) ? '. Unapplied manual edit' : ''}`,
        }))}>
        {passage && <PassageInspector key={passage.id} run={run} passage={passage} index={passages.indexOf(passage)} count={passages.length} readOnly={readOnly} busy={busy} finalResult={finalResult}
        text={!readOnly ? drafts[passageKey(run.id, passage.id)] ?? proposedPassageText(run, passage) : proposedPassageText(run, passage)}
        feedback={!readOnly ? feedback[passageKey(run.id, passage.id)] ?? run.passageReviews?.[passage.id]?.feedback ?? '' : run.passageReviews?.[passage.id]?.feedback ?? ''}
        concerns={concernsFor(passage)} previous={activeIndex > 0} next={activeIndex >= 0 && activeIndex < available.length - 1}
        onText={text => onText(passage.id, text)} onFeedback={text => onFeedback(passage.id, text)} onSaveFeedback={() => onSaveFeedback(passage.id)}
        onDecide={async (decision, text, keyboard) => {
          await onDecide([passage.id], decision, text);
          if (keyboard) requestAnimationFrame(() => canvas.current?.querySelector<HTMLTextAreaElement>('#passage-replacement')?.focus({ preventScroll: true }));
        }} onNavigate={direction => select(available[activeIndex + direction].id, undefined, true)} onClose={close} onAudit={onAudit} />}
      </ReviewDocument>
      {!passages.length && <p className="review-hint">{finalResult ? 'This saved result retains the original text.' : 'No changes were suggested.'}</p>}
      {!pending.length && !readOnly && <p className="review-hint">All passages reviewed. Returning to writing checks your assembled result, including manual changes.</p>}
    </div></div>
  </>;
}
