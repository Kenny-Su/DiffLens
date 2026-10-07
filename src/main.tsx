import { useEffect, useRef, useState, Fragment, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { diffWordsWithSpace } from 'diff';
import type { Run, Rule, Decision } from '../shared/types';
import './style.css';

type IconName = 'plus' | 'arrow' | 'file' | 'check' | 'close' | 'download' | 'sliders' | 'chevron' | 'undo';
function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    file: <><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" /></>,
    sliders: <><path d="M4 7h4m4 0h8M4 17h8m4 0h4" /><circle cx="10" cy="7" r="2" /><circle cx="14" cy="17" r="2" /></>,
    chevron: <path d="m8 10 4 4 4-4" />,
    undo: <><path d="M9 5 4 10l5 5M4 10h10a5 5 0 0 1 0 10" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function App() {
  const [original, setOriginal] = useState('');
  const [instruction, setInstruction] = useState('');
  const [revised, setRevised] = useState('');
  const [manual, setManual] = useState(false);
  const [rules, setRules] = useState<Rule[]>(() => {
    try { return JSON.parse(localStorage.getItem('difflens-rules') || '[]'); }
    catch { return []; }
  });
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState<'changes' | 'instruction'>('changes');
  const [view, setView] = useState<'diff' | 'final'>('diff');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [candidate, setCandidate] = useState('');
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const reviewRef = useRef<HTMLElement>(null);

  useEffect(() => { setFeedbackDraft(run?.edits.find(e => e.id === selected)?.feedback || ''); }, [selected, run?.id]);
  useEffect(() => { api<Run[]>('/api/runs').then(setHistory).catch(e => setError(e.message)); }, []);
  useEffect(() => { localStorage.setItem('difflens-rules', JSON.stringify(rules)); }, [rules]);

  function openRevision(saved: Run) {
    setRun(saved);
    setOriginal(saved.original);
    setInstruction(saved.instruction);
    setManual(saved.mode === 'manual');
    setRevised(saved.mode === 'manual' ? saved.revised : '');
    setSelected(saved.edits[0]?.id || '');
    setTab('changes');
    setView('diff');
    setError('');
    setNotice('');
    requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ block: 'start' }));
  }

  function newRevision() {
    setRun(null);
    setOriginal('');
    setInstruction('');
    setRevised('');
    setManual(false);
    setSelected('');
    setTab('changes');
    setView('diff');
    setError('');
    setNotice('');
    setCandidate('');
    window.scrollTo({ top: 0 });
  }

  async function generate() {
    setBusy(manual ? 'Auditing revision…' : 'Revising and auditing…');
    setError('');
    setNotice('');
    try {
      const result = await api<Run>('/api/runs', { method: 'POST', body: JSON.stringify({ original, instruction, rules, ...(manual ? { revised } : {}) }) });
      setHistory(items => [result, ...items].slice(0, 20));
      openRevision(result);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  async function update(id: string, decision: Decision, feedback?: string) {
    if (!run) return;
    const edit = run.edits.find(e => e.id === id)!;
    setBusy('Saving review…');
    setError('');
    try {
      const result = await api<Run>(`/api/runs/${run.id}`, { method: 'PATCH', body: JSON.stringify({ edits: [{ id, decision, feedback: feedback ?? edit.feedback }] }) });
      setRun(result);
      setHistory(items => items.map(item => item.id === result.id ? result : item));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  async function propose() {
    setBusy('Finding a recurring preference…');
    setError('');
    setNotice('');
    try {
      const result = await api<{ rule: string | null }>('/api/rules/infer', { method: 'POST', body: '{}' });
      setCandidate(result.rule || '');
      if (!result.rule) setNotice('No recurring preference found in the feedback yet.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  const edit = run?.edits.find(item => item.id === selected);
  const flagged = run?.edits.filter(item => item.flag).length || 0;
  const reviewed = run?.edits.filter(item => item.decision !== 'pending').length || 0;
  const enabledRules = rules.filter(rule => rule.enabled).length;
  const words = original.trim().split(/\s+/).filter(Boolean).length;
  const finalText = run?.segments.map(segment => {
    if (segment.text !== undefined) return segment.text;
    const item = run.edits.find(item => item.id === segment.editId)!;
    return item.decision === 'accepted' ? item.after : item.before;
  }).join('') || '';

  function exportRun() {
    if (!run) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...run, finalText }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `difflens-${run.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="app">
    <header className="topbar">
      <a className="brand" href="/" aria-label="DiffLens home">
        <span className="brand-mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M4 4h4v12H4M12 4h4v12h-4M7 7h6M7 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        DiffLens
      </a>
      <div className="header-actions">
        <select aria-label="Revision history" className="history-dropdown" value={run?.id || ''} disabled={!!busy} onChange={event => { const saved = history.find(item => item.id === event.target.value); if (saved) openRevision(saved); }}>
          <option value="">History</option>
          {history.map(item => <option key={item.id} value={item.id}>{item.original.slice(0, 35)}</option>)}
        </select>
        <button className="secondary new-revision" onClick={newRevision} disabled={!!busy} aria-label="New revision"><Icon name="plus" /><span>New revision</span></button>
      </div>
    </header>

    <div className="app-body">
      <aside className="history-sidebar" aria-labelledby="history-heading">
        <h2 id="history-heading">Revision history <span className="count">{history.length}</span></h2>
        <div className="history-list">
          {history.length === 0 ? <div className="history-empty"><Icon name="file" size={20} /><p>No revisions yet</p></div> : history.map(item => <button key={item.id} className={`history-item ${run?.id === item.id ? 'active' : ''}`} aria-current={run?.id === item.id ? 'true' : undefined} disabled={!!busy} onClick={() => openRevision(item)}>
            <Icon name="file" />
            <span><strong>{item.original.slice(0, 65)}</strong><small>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}<span>·</span>{item.edits.length} edits</small></span>
          </button>)}
        </div>
      </aside>

      <main className="main-content">
        <div className="page-heading"><h1>{run ? 'Revision' : 'New revision'}</h1></div>
        {error && <div role="alert" className="message error"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" /></button></div>}
        {notice && <div role="status" className="message notice">{notice}</div>}

        <section className="composer panel" aria-label="Revision editor" aria-busy={!!busy}>
          <div className="composer-heading"><h2>Source text</h2><div className="mode-switch" aria-label="Revision mode">
            <button aria-pressed={!manual} className={!manual ? 'active' : ''} disabled={!!busy} onClick={() => setManual(false)}>Revise text</button>
            <button aria-pressed={manual} className={manual ? 'active' : ''} disabled={!!busy} onClick={() => setManual(true)}>Audit revision</button>
          </div></div>
          <textarea className="source-input" aria-label="Source passage" placeholder="Paste your text…" value={original} disabled={!!busy} onChange={event => setOriginal(event.target.value)} />
          <div className="word-count">{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</div>
          {manual && <div className="input-section proposed-section"><label htmlFor="proposed">Proposed revision</label><textarea id="proposed" aria-label="Proposed revision" placeholder="Paste a revision…" value={revised} disabled={!!busy} onChange={event => setRevised(event.target.value)} /></div>}
          <div className="input-section instruction-section"><div className="field-heading"><label htmlFor="instruction">Instruction</label></div><textarea id="instruction" aria-label="Editing instruction" placeholder="What should change?" value={instruction} disabled={!!busy} onChange={event => setInstruction(event.target.value)} /></div>

          <details className="rules-settings">
            <summary><Icon name="sliders" /><span>Standing rules</span>{enabledRules > 0 && <span className="count">{enabledRules}</span>}<Icon name="chevron" /></summary>
            <div className="rules-content">
              <p className="help-text">Applied to every revision.</p>
              {rules.length === 0 && <p className="rules-empty">No rules yet.</p>}
              <div className="rules-list">{rules.map((rule, index) => <div className="rule" key={rule.id}>
                <textarea aria-label={`Rule ${index + 1}`} placeholder="What should stay?" value={rule.text} disabled={!!busy} onChange={event => setRules(items => items.map(item => item.id === rule.id ? { ...item, text: event.target.value } : item))} />
                <div className="rule-actions"><button className={`switch ${rule.enabled ? 'on' : ''}`} role="switch" aria-checked={rule.enabled} aria-label={`Enable rule ${index + 1}`} disabled={!!busy} onClick={() => setRules(items => items.map(item => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}><span /></button><button className="icon-button" aria-label={`Remove rule ${index + 1}`} disabled={!!busy} onClick={() => setRules(items => items.filter(item => item.id !== rule.id))}><Icon name="close" /></button></div>
              </div>)}</div>
              <div className="rules-actions"><button className="text-button" disabled={!!busy} onClick={() => setRules(items => [...items, { id: crypto.randomUUID(), text: '', enabled: true }])}><Icon name="plus" />Add rule</button><button className="text-button" disabled={!!busy} onClick={propose}>Suggest from feedback<Icon name="arrow" /></button></div>
              {candidate && <div className="rule-candidate"><label htmlFor="candidate">Suggested rule</label><textarea id="candidate" value={candidate} onChange={event => setCandidate(event.target.value)} /><div><button className="secondary" onClick={() => { setRules(items => [...items, { id: crypto.randomUUID(), text: candidate, enabled: true }]); setCandidate(''); }}>Add rule</button><button className="text-button" onClick={() => setCandidate('')}>Dismiss</button></div></div>}
            </div>
          </details>
          <div className="composer-footer"><button className="primary" onClick={generate} disabled={!!busy || !original.trim() || !instruction.trim() || (manual && !revised.trim())}>{busy ? <><span className="spinner" />{busy}</> : <>{manual ? 'Audit revision' : 'Revise & audit'}<Icon name="arrow" /></>}</button></div>
        </section>

        <section className="review-section" ref={reviewRef} aria-labelledby="review-heading">
          <div className="section-heading"><h2 id="review-heading">Review</h2>{run && <span className="review-progress">{reviewed} of {run.edits.length} reviewed</span>}{run && <button className="text-button export-button" onClick={exportRun}><Icon name="download" />Export</button>}</div>
          <div className="panel review-panel">
            {!run ? <div className="review-empty"><div className="review-empty-icon"><Icon name="file" size={22} /></div><h3>No revision yet</h3></div> : <>
              <div className="review-tabs" role="tablist" aria-label="Review views"><button role="tab" aria-selected={tab === 'changes'} aria-controls="review-content" id="changes-tab" className={tab === 'changes' ? 'active' : ''} onClick={() => setTab('changes')}>Changes<span className="count">{run.edits.length}</span></button><button role="tab" aria-selected={tab === 'instruction'} aria-controls="review-content" id="instruction-tab" className={tab === 'instruction' ? 'active' : ''} onClick={() => setTab('instruction')}>Instruction audit</button></div>
              <div id="review-content" role="tabpanel" aria-labelledby={tab === 'changes' ? 'changes-tab' : 'instruction-tab'}>
                {tab === 'instruction' ? <div className="clause-list">{run.clauses.length === 0 && <p className="help-text">No instruction clauses.</p>}{run.clauses.map(clause => <article className="clause" key={clause.id}><div><span className="eyebrow">{clause.kind}</span><span className={`status ${clause.status}`}>{clause.status === 'review' ? 'Needs review' : clause.status}</span></div><h3>{clause.text}</h3><div className="edit-links">{clause.editIds.map(id => <button className="secondary" key={id} onClick={() => { setSelected(id); setTab('changes'); setView('diff'); }}>Change {id.replace(/^e/, '')}<Icon name="arrow" /></button>)}{!clause.editIds.length && <span className="help-text">No linked changes</span>}</div></article>)}</div> : <>
                  <div className="review-toolbar"><span className={flagged ? 'attention' : 'help-text'}>{flagged ? `${flagged} ${flagged === 1 ? 'change needs' : 'changes need'} attention` : 'Nothing flagged'}</span><div className="mode-switch"><button aria-pressed={view === 'diff'} className={view === 'diff' ? 'active' : ''} onClick={() => setView('diff')}>Changes</button><button aria-pressed={view === 'final'} className={view === 'final' ? 'active' : ''} onClick={() => setView('final')}>Your result</button></div></div>
                  <div className={`review-body ${edit && view === 'diff' ? 'with-inspector' : ''}`}>
                    <div className="passage-column"><div className="passage">{view === 'final' ? finalText : run.segments.map((segment, index) => {
                      if (segment.text !== undefined) return <Fragment key={index}>{segment.text}</Fragment>;
                      const item = run.edits.find(item => item.id === segment.editId)!;
                      return <button key={index} title={item.reason} className={`inline-edit ${item.flag ? 'flagged' : ''} ${selected === item.id ? 'focused' : ''} ${item.decision}`} onClick={() => setSelected(item.id)} aria-label={`Review ${item.id}: ${item.before} to ${item.after}`}>
                        {diffWordsWithSpace(item.before, item.after).map((part, partIndex) => part.removed ? <del key={partIndex}>{part.value}</del> : part.added ? <ins key={partIndex}>{part.value}</ins> : <Fragment key={partIndex}>{part.value}</Fragment>)}{item.flag && <sup>!</sup>}
                      </button>;
                    })}</div>{!run.edits.length && <p className="no-changes">No changes.</p>}</div>
                    {edit && view === 'diff' && <aside className="edit-inspector" aria-label="Selected change"><div className="inspector-heading"><h3>Change {edit.id.replace(/^e/, '')}</h3><span className={`status ${edit.flag ? 'review' : 'fulfilled'}`}>{edit.flag ? 'Needs attention' : 'No flag'}</span></div><div className="before-after"><span className="eyebrow">Original</span><p>{edit.before || '(insertion)'}</p><span className="eyebrow">Proposed</span><p>{edit.after || '(deletion)'}</p></div><div className="assessment"><h4>Audit assessment</h4><p>{edit.reason}</p></div><label className="feedback-label" htmlFor="feedback">Feedback</label><textarea id="feedback" aria-label="Feedback on selected edit" placeholder="Add feedback…" value={feedbackDraft} disabled={!!busy} onChange={event => setFeedbackDraft(event.target.value)} /><button className="text-button save-feedback" disabled={!!busy || feedbackDraft === edit.feedback} onClick={() => update(edit.id, edit.decision, feedbackDraft)}>Save feedback</button><div className="decision-buttons"><button className={`secondary ${edit.decision === 'accepted' ? 'accepted' : ''}`} aria-pressed={edit.decision === 'accepted'} disabled={!!busy} onClick={() => update(edit.id, 'accepted', feedbackDraft)}><Icon name="check" />Accept</button><button className={`secondary ${edit.decision === 'rejected' ? 'rejected' : ''}`} aria-pressed={edit.decision === 'rejected'} disabled={!!busy} onClick={() => update(edit.id, 'rejected', feedbackDraft)}><Icon name="close" />Reject</button></div>{edit.decision !== 'pending' && <button className="text-button undo-button" disabled={!!busy} onClick={() => update(edit.id, 'pending', feedbackDraft)}><Icon name="undo" />Undo decision</button>}</aside>}
                  </div>
                  <div className="review-footer">{view === 'final' ? <span>Accepted changes only.</span> : <><div className="legend"><span><i className="added" />Added</span><span><i className="removed" />Removed</span></div><span>Select a change.</span></>}</div>
                </>}
              </div>
            </>}
          </div>
        </section>
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
