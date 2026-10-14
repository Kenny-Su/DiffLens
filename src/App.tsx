import { useState } from 'react';
import { compose } from '../shared/compose';
import { useWorkspace } from './useWorkspace';
import { download } from './lib/api';
import { FidelityStatus } from './components/Fidelity';
import type { Run } from '../shared/types';
import { Icon } from './components/Icon';
import { Editor } from './components/Editor';
import { Sidebar, useNarrowScreen } from './components/Sidebar';
import { Messages } from './components/Messages';
import { Review } from './components/Review';
import { ConfirmDialog, type Confirmation } from './components/ConfirmDialog';

export function App() {
  const w = useWorkspace();
  const narrow = useNarrowScreen();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const visibleRun = w.visibleRun;
  const words = w.visibleText.trim().split(/\s+/).filter(Boolean).length;
  const locked = !!w.busy || !!w.draft.activeRunId;
  function newDraft() {
    if (w.currentText || w.draft.instruction || w.draft.activeRunId) setConfirmation({ title: 'Start a new draft?', message: 'This replaces your working draft. Saved revisions stay in history. Copy or download any writing you want to keep.', confirmLabel: 'New draft', action: w.newDraft });
    else w.newDraft();
  }
  function useResult() {
    const saved = w.preview!;
    const snapshotId = w.previewFinalId || w.previewDecisionId;
    if ((w.currentText && w.visibleText !== w.currentText) || w.draft.activeRunId) setConfirmation({ title: 'Replace your working draft?', message: 'This uses the saved revision’s accepted changes and ends any current review. Your existing draft will be replaced.', confirmLabel: 'Use result', action: () => w.useResult(saved, snapshotId) });
    else w.useResult(saved, snapshotId);
  }
  function revisit(saved: Run, finalId: string | null) {
    const snapshot = saved.finalReviews?.find(item => item.id === finalId);
    const target = snapshot?.text ?? compose(saved);
    const action = () => w.resumeReview(saved, finalId);
    if (w.currentText !== target || (w.run && w.run.id !== saved.id)) setConfirmation({ title: 'Revisit this review?', message: 'This replaces your working draft with the saved result and restores its decisions. Copy or download any newer writing you want to keep.', confirmLabel: 'Revisit review', action });
    else void action();
  }
  function openLastAudit() {
    if (!w.lastRun) return;
    if (w.earlierSnapshot) w.inspectSnapshot(w.lastRun, w.lastFinal?.id || null);
    w.openAudit(w.lastRun, w.lastFinal?.id || null);
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(w.visibleText); w.setNotice('Text copied.'); }
    catch { w.setError('Could not access the clipboard. You can download your text instead.'); }
  }
  function exportRevision() {
    if (visibleRun) download(JSON.stringify({ ...(w.preview || w.run), displayedSnapshotId: w.previewFinalId || w.previewDecisionId, displayedSnapshotView: w.previewFinal ? 'result' : 'proposal', finalText: w.visibleText }, null, 2), `difflens-${visibleRun.id}.json`, 'application/json');
  }
  return <div className="app-shell">
    <header className="topbar" inert={narrow && !!w.sidebar}><div className="brand"><span className="brand-mark" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M4 4h4v12H4M12 4h4v12h-4M7 7h6M7 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span><span>DiffLens</span></div>
      <div className="toolbar-start"><button className="toolbar-button" onClick={newDraft} disabled={!!w.busy} title="New draft"><Icon name="plus" /><span>New draft</span></button><button className={`toolbar-button ${w.sidebar === 'history' ? 'active' : ''}`} aria-expanded={w.sidebar === 'history'} onClick={() => w.openSidebar('history')} disabled={!!w.busy} title="History"><Icon name="history" /><span>History</span></button></div>
      <div className="toolbar-end"><button className="toolbar-button" onClick={copyText} disabled={!w.visibleText} title={visibleRun ? 'Copy reviewed text' : 'Copy text'} aria-label={visibleRun ? 'Copy reviewed text' : 'Copy text'}><Icon name="copy" /><span>{visibleRun ? 'Copy reviewed text' : 'Copy text'}</span></button><button className="toolbar-button" onClick={() => download(w.visibleText, 'difflens-draft.txt', 'text/plain;charset=utf-8')} disabled={!w.visibleText} title={visibleRun ? 'Download reviewed text' : 'Download text'} aria-label={visibleRun ? 'Download reviewed text' : 'Download text'}><Icon name="download" /><span>{visibleRun ? 'Download reviewed text' : 'Download text'}</span></button><button className={`primary revise-toggle ${w.sidebar === 'revise' ? 'active' : ''}`} aria-expanded={w.sidebar === 'revise'} onClick={() => w.openSidebar('revise')} disabled={locked || !!visibleRun} title="Revise the whole document"><Icon name="edit" />Revise</button></div>
    </header>
    {(!narrow || !w.sidebar) && <Messages workspace={w} />}
    <div className="workspace"><main inert={narrow && !!w.sidebar} className="document-workspace" aria-label="Document workspace" aria-busy={!!w.busy}>
      {w.restoreFailed && <div className="restore-actions"><span>Your draft is preserved. Retry the review or continue with the saved draft text.</span><button disabled={!!w.busy} onClick={w.restore}>Retry review</button><button disabled={!!w.busy} onClick={w.continueWithoutReview}>Continue writing</button></div>}
      {visibleRun ? <Review key={`${w.preview ? 'history' : 'active'}-${visibleRun.id}-${w.previewFinalId || w.previewDecisionId || 'proposal'}`} run={visibleRun} audit={w.previewFinal?.audit || visibleRun.proposalAudit} finalResult={!!w.previewFinal} onAudit={() => w.openAudit((w.preview || w.run)!, w.previewFinalId)} onRevisit={() => revisit((w.preview || w.run)!, w.previewFinalId || w.previewDecisionId)} focusEdit={w.focusEdit} readOnly={!!w.preview} busy={!!w.busy} feedback={w.draft.passageFeedback} drafts={w.draft.passageDrafts} onFeedback={w.editFeedback} onText={w.editPassage} onSaveFeedback={w.savePassageFeedback} onDecide={w.decide} onFinish={w.finishReview} onBack={w.closePreview} onUseResult={useResult} onExport={exportRevision} /> : <Editor text={w.draft.text} locked={locked} focus={!w.sidebar && !confirmation} selection={w.selection} instruction={w.draft.instruction} busy={w.busy} onChange={w.editText} onSelection={w.captureSelection} onInstruction={w.editInstruction} onGenerate={w.generate} />}
      <footer className="document-footer"><span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}{w.selection && !visibleRun && <span className="selection-count"> · {w.draft.text.slice(w.selection.start, w.selection.end).trim().split(/\s+/).filter(Boolean).length} selected</span>}</span><div className="footer-check">{!visibleRun && w.lastRun && <FidelityStatus audit={w.lastAudit} onClick={openLastAudit} prefix={w.earlierSnapshot ? 'Earlier revision' : w.lastFinal ? 'Final check' : 'Fidelity'} />}{!visibleRun && (w.lastLoadError || w.auditPollError) && <button className="text-button" onClick={w.lastLoadError ? w.retryLastCheck : w.retryPolling}>Check status unavailable · Retry</button>}<span className="save-status" role="status">{w.busy ? <><span className="spinner" />{w.busy}</> : w.preview ? 'Viewing saved revision' : w.storageError ? 'Not saved locally' : <><span className="saved-dot" />Saved locally</>}</span></div></footer>
    </main>{w.sidebar && <Sidebar workspace={w} mobile={narrow} onRevisit={() => w.inspectedRun && revisit(w.inspectedRun, w.auditFinalId)} />}</div>
    {confirmation && <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />}
  </div>;
}
