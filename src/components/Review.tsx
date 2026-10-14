import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Decision, Run, FidelityAudit, ReviewPassage } from '../../shared/types';
import { resumeAfterDecision, sentenceConcerns } from '../lib/breakpoints';
import { needsAttention } from '../../shared/fidelity';
import { passageKey, passagePending, passageState, proposedPassageText } from '../../shared/passages';
import { characters, transformationFrame, transformationSteps } from '../lib/transformation';
import { reviewBlocks } from '../lib/reviewBlocks';
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
  const [acknowledged, setAcknowledged] = useState<Set<string>>(() => new Set());
  const [skipUnavailableAudit, setSkipUnavailableAudit] = useState(false);
  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [playbackRun, setPlaybackRun] = useState(run);
  const steps = useMemo(() => transformationSteps(playbackRun, !readOnly), [playbackRun, readOnly]);
  const [replayPassage, setReplayPassage] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'highlight' | 'out' | 'in'>('highlight');
  const [playing, setPlaying] = useState(!readOnly);
  const [playback, setPlayback] = useState(!readOnly);
  const [originalView, setOriginalView] = useState(false);
  const [speed, setSpeed] = useState(1);
  const step = playback ? steps[cursor] : undefined;
  const stepConcerns = sentenceConcerns(step, audit);
  const atSentenceStart = !!step && (cursor === 0 || steps[cursor - 1].sentenceId !== step.sentenceId) && phase === 'highlight';
  const breakpoint = !readOnly && atSentenceStart && stepConcerns.length > 0 && !acknowledged.has(step!.passageId) && !!run.passages?.find(item => item.id === step!.passageId && passagePending(run, item));
  const waitingForAudit = !readOnly && playback && (audit?.status === 'pending' || audit?.status === 'running');
  const auditUnavailable = !readOnly && playback && audit?.status === 'failed' && !skipUnavailableAudit;
  function replay(id?: string) {
    setAcknowledged(new Set()); setSkipUnavailableAudit(false);
    const nextSteps = transformationSteps(run, !readOnly);
    setReplayPassage(id ?? null); setPlaybackRun(run); setCursor(id ? Math.max(0, nextSteps.findIndex(item => item.passageId === id)) : 0);
    setProgress(0); setPhase('highlight'); setPlayback(true); setPlaying(true); setOriginalView(false);
  }
  function finishAnimation() {
    const next = !readOnly && audit?.status === 'complete' ? steps.findIndex((item, index) => index >= cursor
      && (index === 0 || steps[index - 1].sentenceId !== item.sentenceId)
      && !acknowledged.has(item.passageId)
      && run.passages?.some(passage => passage.id === item.passageId && passagePending(run, passage))
      && sentenceConcerns(item, audit).length > 0) : -1;
    if (next >= 0) {
      setCursor(next); setProgress(0); setPhase('highlight'); setPlaying(true); setOriginalView(false);
    } else finishPlayback();
  }
  function finishPlayback() { setPlayback(false); setPlaying(false); setOriginalView(false); }
  useEffect(() => {
    if (!playback || !playing || breakpoint || waitingForAudit || auditUnavailable || busy) return;
    if (!step || replayPassage && step.passageId !== replayPassage) { setPlayback(false); setPlaying(false); return; }
    const count = phase === 'out' ? characters(step.removed).length : characters(step.added).length;
    const timer = window.setTimeout(() => {
      if (phase === 'highlight') { setProgress(0); setPhase('out'); }
      else if (progress < count) setProgress(value => reducedMotion ? count : value + 1);
      else if (phase === 'out') { setProgress(0); setPhase('in'); }
      else {
        setCursor(value => value + 1); setProgress(0);
        setPhase(steps[cursor + 1]?.sentenceId === step.sentenceId ? 'out' : 'highlight');
      }
    }, (phase === 'highlight' ? 900 : progress < count ? 45 : phase === 'in' ? 350 : 120) / speed);
    return () => window.clearTimeout(timer);
  }, [playback, playing, cursor, phase, progress, steps, speed, replayPassage, breakpoint, waitingForAudit, auditUnavailable, busy, reducedMotion]);
  const frame = step ? transformationFrame(step, phase, progress) : undefined;
  const [showResolved, setShowResolved] = useState(readOnly);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const resolvedToggle = useRef<HTMLInputElement>(null);
  const finishButton = useRef<HTMLButtonElement>(null);
  const passages = run.passages || [];
  const passage = passages.find(item => item.id === selected);
  const concernsFor = (item: ReviewPassage) => audit?.status === 'complete' ? audit.assessments.filter(assessment => needsAttention(assessment) && assessment.editIds.some(id => item.editIds.includes(id))) : [];
  useEffect(() => {
    if (!breakpoint || !step) return;
    setPlaying(false); setSelected(step.passageId); setSelectedBlock(null);
    requestAnimationFrame(() => {
      const notice = canvas.current?.querySelector<HTMLElement>('.audit-breakpoint');
      notice?.scrollIntoView({ block: 'nearest' }); notice?.focus({ preventScroll: true });
    });
  }, [breakpoint, step?.sentenceId]);
  async function decidePassage(id: string, decision: Decision, text?: string) {
    const resolvingBreakpoint = breakpoint && step?.passageId === id && decision !== 'pending';
    if (!resolvingBreakpoint) finishPlayback();
    const saved = await onDecide([id], decision, text);
    if (!saved || !resolvingBreakpoint) return saved;
    const resumed = resumeAfterDecision(run, id, decision, text);
    setAcknowledged(previous => new Set([...previous, id]));
    setPlaybackRun(resumed.run); setCursor(resumed.cursor); setProgress(0); setPhase('highlight');
    setSelected(null); setSelectedBlock(null); setPlaying(true); setOriginalView(false);
    return true;
  }
  const hasDraft = (item: ReviewPassage) => !readOnly && drafts[passageKey(run.id, item.id)] !== undefined && drafts[passageKey(run.id, item.id)] !== proposedPassageText(run, item);
  const marked = (item: ReviewPassage) => showResolved || passagePending(run, item) || hasDraft(item) || !!concernsFor(item).length || item.id === selected;
  const overrides = useMemo(() => {
    if (originalView) return Object.fromEntries(passages.map(item => [item.id, item.before]));
    if (!playback) return undefined;
    const text = Object.fromEntries((playbackRun.passages || []).map(item => [item.id, item.before]));
    for (let index = 0; index < cursor; index++) text[steps[index].passageId] = steps[index].after;
    if (step && frame) text[step.passageId] = frame.text;
    return text;
  }, [originalView, playback, playbackRun, passages, steps, cursor, phase, progress]);
  const blocks = useMemo(() => reviewBlocks(run, !readOnly, false, overrides), [run, readOnly, overrides]);
  useEffect(() => {
    if (!step) return;
    canvas.current?.querySelector<HTMLElement>(`[data-passage="${step.passageId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [step?.passageId]);
  const pending = passages.filter(item => passagePending(run, item));
  const available = passages.filter(marked);
  const activeIndex = available.findIndex(item => item.id === selected);
  const inspectorBlock = selectedBlock !== null && blocks[selectedBlock]?.some(chunk => chunk.passageId === selected) ? selectedBlock : blocks.findIndex(block => block.some(chunk => chunk.passageId === selected));
  function select(id: string, block?: number, focus = false) {
    if (breakpoint && id !== step?.passageId) return;
    setPlaying(false); setSelected(id); setSelectedBlock(block ?? null);
    requestAnimationFrame(() => {
      const inspector = canvas.current?.querySelector<HTMLElement>('.passage-inspector');
      inspector?.scrollIntoView({ block: 'nearest' });
      if (focus) (inspector?.querySelector<HTMLElement>('textarea') || inspector?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    });
  }
  function close() {
    if (breakpoint) return;
    const anchor = canvas.current?.querySelector<HTMLElement>(`[data-passage="${selected}"]`);
    const remains = passage && (showResolved || passagePending(run, passage) || hasDraft(passage) || concernsFor(passage).length);
    setSelected(null); setSelectedBlock(null);
    (remains ? anchor : resolvedToggle.current)?.focus({ preventScroll: true });
  }
  async function bulk(decision: Decision, keyboard: boolean) {
    finishPlayback();
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
        <button onClick={event => bulk('accepted', event.detail === 0)} disabled={busy || breakpoint || !pending.length}>Accept remaining</button>
        <button onClick={event => bulk('rejected', event.detail === 0)} disabled={busy || breakpoint || !pending.length}>Reject remaining</button>
        <button ref={finishButton} className="primary" onClick={onFinish} disabled={busy}>Return to writing<Icon name="arrow" /></button>
      </>}</div>
    </div>
    <div className="review-options"><div className="review-view-options">
      {playback ? <><button disabled={breakpoint || waitingForAudit || auditUnavailable || busy} onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play'}</button><button disabled={breakpoint || waitingForAudit || auditUnavailable || busy} onClick={finishAnimation}>Finish animation</button></> : <button disabled={!steps.length} onClick={() => replay()}>Replay changes</button>}
      {passage && <button disabled={breakpoint || busy} onClick={() => replay(passage.id)}>Replay passage</button>}
      <label>Speed<select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></label>
      <button aria-pressed={originalView} onClick={() => { setPlaying(false); setOriginalView(value => !value); }}>{originalView ? 'Show proposed' : 'Show original'}</button>
      <label><input ref={resolvedToggle} type="checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)} />Show resolved</label>
      <span className="playback-status" role="status">{waitingForAudit ? 'Waiting for fidelity audit…' : breakpoint ? 'Paused at fidelity concern' : playback && step ? `Sentence ${new Set(steps.slice(0, cursor + 1).map(item => item.sentenceId)).size} of ${new Set(steps.map(item => item.sentenceId)).size}` : originalView ? 'Original text' : 'Playback complete'}</span>
    </div><button className="text-button" onClick={onExport}><Icon name="download" />Export revision JSON</button></div>
    {waitingForAudit && <div className="audit-playback-notice" role="status">Checking fidelity before playback. Flagged sentences will pause for your review.</div>}
    {auditUnavailable && <div className="audit-playback-notice" role="status">The fidelity audit is unavailable. <button onClick={onAudit}>View audit and retry</button><button onClick={() => setSkipUnavailableAudit(true)}>Continue without audit</button></div>}
    <div className="document-scroll" ref={canvas}><div className="review-document">
      <div className="document-label">{readOnly ? finalResult ? 'Saved result' : 'Saved review' : originalView ? 'Original text' : playback ? 'Replaying changes · proposals are not applied' : 'Proposed result · unresolved proposals shown'}{run.selection && ' · Selected passage'}</div>
      {blocks.map((block, blockIndex) => <Fragment key={blockIndex}><div className="document-passage" aria-label={`Document paragraph ${blockIndex + 1}`}>
        {block.map((chunk, index) => {
          const item = passages.find(item => item.id === chunk.passageId);
          if (!item || !marked(item) && step?.passageId !== item.id) return <Fragment key={index}>{chunk.text}</Fragment>;
          const number = passages.indexOf(item) + 1, concerns = concernsFor(item), state = passageState(run, item);
          // Native buttons form atomic boxes, so they cannot flow across sentence line breaks.
          return <span key={index} role="button" tabIndex={0} data-passage={item.id} className={`review-passage ${selected === item.id ? 'selected' : ''} ${concerns.length ? 'has-concern' : ''}`} aria-label={`Inspect passage ${number}. ${state === 'mixed' ? 'Partially reviewed' : state}${concerns.length ? '. Fidelity concern' : ''}${hasDraft(item) ? '. Unapplied manual edit' : ''}`} aria-expanded={selected === item.id} onClick={event => select(item.id, blockIndex, event.detail === 0)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (!event.repeat) select(item.id, blockIndex, true);
            }
          }}>
            {!!concerns.length && <span className="audit-marker" aria-hidden="true">!</span>}{step?.passageId === item.id && chunk.text ? (() => {
              const chunkOffset = block.slice(0, index).filter(piece => piece.passageId === item.id).reduce((sum, piece) => sum + piece.text.length, 0)
                + blocks.slice(0, blockIndex).flat().filter(piece => piece.passageId === item.id).reduce((sum, piece) => sum + piece.text.length, 0);
              if (!frame) return chunk.text;
              const start = Math.max(0, frame.start - chunkOffset), end = Math.min(chunk.text.length, frame.end - chunkOffset);
              const caret = Math.max(start, Math.min(end, frame.caret - chunkOffset));
              const hasCaret = phase !== 'highlight' && frame.caret >= chunkOffset && frame.caret <= chunkOffset + chunk.text.length;
              return end >= start && frame.end >= chunkOffset && frame.start < chunkOffset + chunk.text.length ? <>{chunk.text.slice(0, start)}<span className="transformation-sentence">{hasCaret ? <>{chunk.text.slice(start, caret)}<span className="transformation-caret" aria-hidden="true" />{chunk.text.slice(caret, end)}</> : chunk.text.slice(start, end)}</span>{chunk.text.slice(end)}</> : chunk.text;
            })() : chunk.text || <span className="deleted-passage">{originalView ? 'New passage' : 'Deleted passage'}</span>}{hasDraft(item) && <span className="passage-draft-marker" aria-hidden="true"> · edited</span>}
          </span>;
        })}
      </div>{passage && blockIndex === inspectorBlock && <>
        {breakpoint && passage.id === step?.passageId && <section className="audit-breakpoint" role="region" aria-label="Fidelity breakpoint" tabIndex={-1}>
          <strong>Fidelity breakpoint · before this sentence changes</strong>
          {[...new Set(stepConcerns.map(item => item.reason))].map(reason => <p key={reason}>{reason}</p>)}
          <p>Accept or reject this passage, or edit the proposal below and use your edited text. Your decision is saved before playback continues. Decisions apply to the entire passage, including grouped sentence splits and merges.</p>
          {hasDraft(passage) && <p>These findings concern the model proposal. Your edited text is checked when you return to writing.</p>}
          <button disabled={busy} onClick={() => canvas.current?.querySelector<HTMLTextAreaElement>('#passage-replacement')?.focus()}>Edit proposal</button>
        </section>}
        <PassageInspector key={passage.id} run={run} passage={passage} index={passages.indexOf(passage)} count={passages.length} readOnly={readOnly} busy={busy} finalResult={finalResult} breakpoint={breakpoint}
        text={!readOnly ? drafts[passageKey(run.id, passage.id)] ?? proposedPassageText(run, passage) : proposedPassageText(run, passage)}
        feedback={!readOnly ? feedback[passageKey(run.id, passage.id)] ?? run.passageReviews?.[passage.id]?.feedback ?? '' : run.passageReviews?.[passage.id]?.feedback ?? ''}
        concerns={breakpoint ? [] : concernsFor(passage)} previous={!breakpoint && activeIndex > 0} next={!breakpoint && activeIndex >= 0 && activeIndex < available.length - 1}
        onText={text => onText(passage.id, text)} onFeedback={text => onFeedback(passage.id, text)} onSaveFeedback={() => onSaveFeedback(passage.id)}
        onDecide={async (decision, text, keyboard) => {
          const saved = await decidePassage(passage.id, decision, text);
          if (keyboard) requestAnimationFrame(() => canvas.current?.querySelector<HTMLTextAreaElement>('#passage-replacement')?.focus({ preventScroll: true }));
          return saved;
        }} onNavigate={direction => select(available[activeIndex + direction].id, undefined, true)} onClose={close} onAudit={onAudit} /></>}</Fragment>)}
      {!passages.length && <p className="review-hint">{finalResult ? 'This saved result retains the original text.' : 'No changes were suggested.'}</p>}
      {!pending.length && !readOnly && <p className="review-hint">All passages reviewed. Returning to writing checks your assembled result, including manual changes.</p>}
    </div></div>
  </>;
}
