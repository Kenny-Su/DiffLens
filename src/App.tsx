import { useState } from 'react';
import { compose } from '../shared/compose';
import { useWorkspace } from './useWorkspace';
import { download } from './lib/api';
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
  const visibleRun = w.preview || w.run;
  const words = w.visibleText.trim().split(/\s+/).filter(Boolean).length;
  const locked = !!w.busy || !!w.draft.activeRunId;
  function newDraft() {
    if (w.currentText || w.draft.instruction || w.draft.activeRunId) setConfirmation({ title: 'Start a new draft?', message: 'This replaces your working draft. Saved revisions stay in history. Copy or download any writing you want to keep.', confirmLabel: 'New draft', action: w.newDraft });
    else w.newDraft();
  }
  function useResult() {
    const saved = w.preview!;
    if ((w.currentText && compose(saved) !== w.currentText) || w.draft.activeRunId) setConfirmation({ title: 'Replace your working draft?', message: 'This uses the saved revision’s accepted changes and ends any current review. Your existing draft will be replaced.', confirmLabel: 'Use result', action: () => w.useResult(saved) });
    else w.useResult(saved);
  }
  async function copyText() {
    try { await navigator.clipboard.writeText(w.visibleText); w.setNotice('Text copied.'); }
    catch { w.setError('Could not access the clipboard. You can download your text instead.'); }
  }
  function exportRevision() {
    if (visibleRun) download(JSON.stringify({ ...visibleRun, finalText: compose(visibleRun) }, null, 2), `difflens-${visibleRun.id}.json`, 'application/json');
  }
  return <div className="app-shell">
    <header className="topbar" inert={narrow && !!w.sidebar}><div className="brand"><span className="brand-mark" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M4 4h4v12H4M12 4h4v12h-4M7 7h6M7 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></span><span>DiffLens</span></div>
      <div className="toolbar-start"><button className="toolbar-button" onClick={newDraft} disabled={!!w.busy} title="New draft"><Icon name="plus" /><span>New draft</span></button><button className={`toolbar-button ${w.sidebar === 'history' ? 'active' : ''}`} aria-expanded={w.sidebar === 'history'} onClick={() => w.openSidebar('history')} disabled={!!w.busy} title="History"><Icon name="history" /><span>History</span></button></div>
      <div className="toolbar-end"><button className="toolbar-button" onClick={copyText} disabled={!w.visibleText} title="Copy text"><Icon name="copy" /><span>Copy text</span></button><button className="toolbar-button" onClick={() => download(w.visibleText, 'difflens-draft.txt', 'text/plain;charset=utf-8')} disabled={!w.visibleText} title="Download text"><Icon name="download" /><span>Download text</span></button><button className={`primary revise-toggle ${w.sidebar === 'revise' ? 'active' : ''}`} aria-expanded={w.sidebar === 'revise'} onClick={() => w.openSidebar('revise')} disabled={locked || !!visibleRun}><Icon name="edit" />Revise</button></div>
    </header>
    {(!narrow || !w.sidebar) && <Messages workspace={w} />}
    <div className="workspace"><main inert={narrow && !!w.sidebar} className="document-workspace" aria-label="Document workspace" aria-busy={!!w.busy}>
      {w.restoreFailed && <div className="restore-actions"><span>Your draft is preserved. Retry the review or continue with the saved draft text.</span><button disabled={!!w.busy} onClick={w.restore}>Retry review</button><button disabled={!!w.busy} onClick={w.continueWithoutReview}>Continue writing</button></div>}
      {visibleRun ? <Review key={`${w.preview ? 'history' : 'active'}-${visibleRun.id}`} run={visibleRun} readOnly={!!w.preview} busy={!!w.busy} feedback={w.draft.feedback} onFeedback={w.editFeedback} onDecide={w.decide} onFinish={w.finishReview} onBack={() => w.setPreview(null)} onUseResult={useResult} onExport={exportRevision} /> : <Editor text={w.draft.text} locked={locked} focus={!w.sidebar} onChange={w.editText} onSelection={w.captureSelection} />}
      <footer className="document-footer"><span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}{w.selection && !visibleRun && <span className="selection-count"> · {w.draft.text.slice(w.selection.start, w.selection.end).trim().split(/\s+/).filter(Boolean).length} selected</span>}</span><span className="save-status" role="status">{w.busy ? <><span className="spinner" />{w.busy}</> : w.preview ? 'Viewing saved revision' : w.storageError ? 'Not saved locally' : <><span className="saved-dot" />Saved locally</>}</span></footer>
    </main>{w.sidebar && <Sidebar workspace={w} mobile={narrow} />}</div>
    {confirmation && <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)} />}
  </div>;
}
