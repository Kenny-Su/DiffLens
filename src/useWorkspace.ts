import { useEffect, useRef, useState } from 'react';
import { compose } from '../shared/compose';
import type { Decision, EditUpdate, Rule, Run, TextSelection } from '../shared/types';
import { api } from './lib/api';
import { emptyDraft, readDraft, resultDraft, writeDraft, type Draft } from './lib/draft';

function initialDraft() {
  try { return { draft: readDraft(localStorage), error: '' }; }
  catch (error) { return { draft: emptyDraft(), error: `Draft storage unavailable: ${(error as Error).message}` }; }
}
function initialRules() {
  try {
    const rules: Rule[] = JSON.parse(localStorage.getItem('difflens-rules') || '[]');
    if (!Array.isArray(rules) || rules.some(rule => !rule || typeof rule.id !== 'string' || typeof rule.text !== 'string' || typeof rule.enabled !== 'boolean')) throw new Error('Invalid saved rules.');
    return { rules, error: '' };
  } catch { return { rules: [] as Rule[], error: 'Saved rules could not be read. Your stored copy has not been changed.' }; }
}

export function useWorkspace() {
  const [initial] = useState(initialDraft);
  const [initialRuleState] = useState(initialRules);
  const [draft, setDraft] = useState(initial.draft);
  const draftRef = useRef(draft);
  const [storageError, setStorageError] = useState(initial.error);
  const [rulesError, setRulesError] = useState(initialRuleState.error);
  const [rules, updateRules] = useState(initialRuleState.rules);
  const [run, setRun] = useState<Run | null>(null);
  const [preview, setPreview] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [sidebar, setSidebar] = useState<'revise' | 'history' | 'rules' | null>(null);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [busy, setBusy] = useState(initial.draft.activeRunId ? 'Restoring review…' : '');
  const operation = useRef(!!initial.draft.activeRunId);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [candidate, setCandidate] = useState('');

  function persist(next: Draft) {
    draftRef.current = next;
    setDraft(next);
    try { writeDraft(localStorage, next); setStorageError(''); }
    catch { setStorageError('Your draft is still open, but this browser could not save it. Copy or download it before leaving.'); }
  }
  function setRules(next: Rule[]) {
    updateRules(next);
    try { localStorage.setItem('difflens-rules', JSON.stringify(next)); setRulesError(''); }
    catch { setRulesError('Rules could not be saved in this browser. They remain available in this session.'); }
  }
  function begin(label: string) {
    if (operation.current) return false;
    operation.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    return true;
  }
  function end() { operation.current = false; setBusy(''); }
  function remember(result: Run) { setHistory(items => [result, ...items.filter(item => item.id !== result.id)].slice(0, 20)); }

  useEffect(() => {
    let mounted = true;
    api<Run[]>('/api/runs').then(items => { if (mounted) setHistory(items); }).catch(() => { if (mounted) setError('Revision history could not be loaded. Open History to retry.'); });
    const id = initial.draft.activeRunId;
    if (id) api<Run>(`/api/runs/${id}`).then(result => {
      if (mounted) setRun(result);
    }).catch(error => {
      if (mounted) { setError(`Could not restore your review: ${error.message}`); setRestoreFailed(true); }
    }).finally(() => { if (mounted) end(); });
    return () => { mounted = false; };
  }, [initial]);

  async function restore() {
    if (!draft.activeRunId || !begin('Restoring review…')) return;
    try { setRun(await api<Run>(`/api/runs/${draft.activeRunId}`)); setRestoreFailed(false); }
    catch (error) { setError((error as Error).message); }
    finally { end(); }
  }
  function continueWithoutReview() {
    persist({ ...draftRef.current, activeRunId: null, feedback: {} });
    setRestoreFailed(false);
    setError('');
  }
  function editText(text: string) {
    if (run || preview || operation.current || draft.activeRunId) return;
    persist({ ...draftRef.current, text });
    setSelection(null);
  }
  function captureSelection(start: number, end: number) {
    if (run || preview || operation.current) return;
    const next = end > start ? { start, end } : null;
    setSelection(next);
  }
  async function openSidebar(next: 'revise' | 'history') {
    setSidebar(current => current === next ? null : next);
    if (next === 'history') {
      try { setHistory(await api<Run[]>('/api/runs')); }
      catch { setError('Revision history could not be loaded. Close and reopen History to retry.'); }
    }
  }
  async function generate() {
    if (run || preview || draft.activeRunId || !begin('Revising…')) return;
    try {
      const result = await api<Run>('/api/runs', { method: 'POST', body: JSON.stringify({ original: draft.text, instruction: draft.instruction, rules, ...(selection ? { selection } : {}) }) });
      remember(result);
      setSidebar(null);
      setSelection(null);
      if (result.edits.length) {
        persist({ ...draftRef.current, activeRunId: result.id, feedback: {} });
        setRun(result);
      } else setNotice('No changes suggested. Your text is ready to keep working on.');
    } catch (error) { setError((error as Error).message); }
    finally { end(); }
  }
  async function patch(edits: EditUpdate[]) {
    const result = await api<Run>(`/api/runs/${run!.id}`, { method: 'PATCH', body: JSON.stringify({ edits }) });
    setRun(result);
    setHistory(items => items.map(item => item.id === result.id ? result : item));
    const feedback = { ...draftRef.current.feedback };
    for (const edit of edits) delete feedback[edit.id];
    persist({ ...draftRef.current, feedback });
    return result;
  }
  async function decide(ids: string[], decision: Decision) {
    if (!run || !ids.length || !begin('Saving changes…')) return;
    try { await patch(run.edits.filter(edit => ids.includes(edit.id)).map(edit => ({ id: edit.id, decision, feedback: draftRef.current.feedback[edit.id] ?? edit.feedback }))); }
    catch (error) { setError(`Changes were not saved: ${(error as Error).message}`); }
    finally { end(); }
  }
  function editFeedback(id: string, feedback: string) { persist({ ...draftRef.current, feedback: { ...draftRef.current.feedback, [id]: feedback } }); }
  async function finishReview() {
    if (!run || !begin('Saving review…')) return;
    try {
      const edits = run.edits.filter(edit => draftRef.current.feedback[edit.id] !== undefined && draftRef.current.feedback[edit.id] !== edit.feedback).map(edit => ({ id: edit.id, decision: edit.decision, feedback: draftRef.current.feedback[edit.id] }));
      const result = edits.length ? await patch(edits) : run;
      persist(resultDraft(draftRef.current, result));
      setRun(null);
      setSelection(null);
    } catch (error) { setError(`Your feedback could not be saved: ${(error as Error).message}`); }
    finally { end(); }
  }
  async function proposeRule() {
    if (!begin('Finding a preference…')) return;
    try {
      const result = await api<{ rule: string | null }>('/api/rules/infer', { method: 'POST', body: '{}' });
      setCandidate(result.rule || '');
      if (!result.rule) setNotice('No recurring preference found in your feedback yet.');
    } catch (error) { setError((error as Error).message); }
    finally { end(); }
  }
  function newDraft() {
    persist(emptyDraft()); setRun(null); setPreview(null); setSelection(null); setSidebar(null); setRestoreFailed(false); setCandidate(''); setError(''); setNotice('');
  }
  function useResult(saved: Run) {
    persist(resultDraft({ ...draftRef.current, instruction: saved.instruction }, saved));
    setRun(null); setPreview(null); setSelection(null); setSidebar(null); setRestoreFailed(false); setError(''); setNotice('');
  }
  const currentText = run ? compose(run) : draft.text;
  const visibleText = preview ? compose(preview) : currentText;
  return {
    draft, rules, run, preview, history, sidebar, selection, busy, restoreFailed, error, notice, storageError, rulesError, candidate, currentText, visibleText,
    setError, setNotice, setSidebar, setPreview, setCandidate, setRules, editText, captureSelection, openSidebar, generate, decide, editFeedback, finishReview, proposeRule, newDraft, useResult, restore, continueWithoutReview,
    editInstruction: (instruction: string) => persist({ ...draftRef.current, instruction }),
    retryStorage: () => persist(draftRef.current),
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
