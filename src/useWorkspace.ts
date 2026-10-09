import { useCallback, useEffect, useRef, useState } from 'react';
import { compose } from '../shared/compose';
import type { Decision, EditUpdate, Rule, Run, TextSelection, FinalizeResponse } from '../shared/types';
import { newerRun, finalSnapshot, proposalSnapshot } from '../shared/fidelity';
import { useAuditPolling } from './useAuditPolling';
import { api } from './lib/api';
import { emptyDraft, readDraft, resultDraft, writeDraft, type Draft } from './lib/draft';
import { readRules, RULES_KEY } from './lib/rules';

function initialDraft() {
  try { return { draft: readDraft(localStorage), error: '' }; }
  catch (error) { return { draft: emptyDraft(), error: `Draft storage unavailable: ${(error as Error).message}` }; }
}
function initialRules() {
  try {
    const rules = readRules(localStorage);
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
  const [sidebar, setSidebar] = useState<'revise' | 'history' | 'rules' | 'fidelity' | null>(null);
  const [selection, setSelection] = useState<TextSelection | null>(null);
  const [busy, setBusy] = useState(initial.draft.activeRunId ? 'Restoring review…' : '');
  const operation = useRef(!!initial.draft.activeRunId);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [candidate, setCandidate] = useState('');
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [lastLoadError, setLastLoadError] = useState('');
  const [inspectedRun, setInspectedRun] = useState<Run | null>(null);
  const [auditFinalId, setAuditFinalId] = useState<string | null>(null);
  const [previewFinalId, setPreviewFinalId] = useState<string | null>(null);
  const [previewDecisionId, setPreviewDecisionId] = useState<string | null>(null);
  const [auditBusy, setAuditBusy] = useState('');
  const auditOperation = useRef(false);
  const [focusEdit, setFocusEdit] = useState<{ id: string; nonce: number } | null>(null);
  const focusNonce = useRef(0);
  const receive = useCallback((result: Run) => {
    const merge = (current: Run | null) => current?.id === result.id ? newerRun(current, result) : current;
    setRun(merge); setPreview(merge); setLastRun(merge); setInspectedRun(merge);
    setHistory(items => items.map(item => item.id === result.id ? newerRun(item, result) : item));
  }, []);
  const polling = useAuditPolling([run, preview, lastRun, inspectedRun], receive);


  function persist(next: Draft) {
    draftRef.current = next;
    setDraft(next);
    try { writeDraft(localStorage, next); setStorageError(''); }
    catch { setStorageError('Your draft is still open, but this browser could not save it. Copy or download it before leaving.'); }
  }
  function setRules(next: Rule[]) {
    updateRules(next);
    try { localStorage.setItem(RULES_KEY, JSON.stringify(next)); setRulesError(''); }
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
  function receiveHistory(results: Run[]) {
    setHistory(current => {
      const merged = new Map(current.map(item => [item.id, item]));
      for (const result of results) merged.set(result.id, merged.has(result.id) ? newerRun(merged.get(result.id)!, result) : result);
      return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    });
  }

  useEffect(() => {
    let mounted = true;
    api<Run[]>('/api/runs').then(items => { if (mounted) receiveHistory(items); }).catch(() => { if (mounted) setError('Revision history could not be loaded. Open History to retry.'); });
    const lastId = initial.draft.lastRevisionId;
    if (lastId) api<Run>(`/api/runs/${lastId}`).then(result => { if (mounted && draftRef.current.lastRevisionId === lastId) setLastRun(current => current?.id === result.id ? newerRun(current, result) : result); }).catch(() => { if (mounted && draftRef.current.lastRevisionId === lastId) setLastLoadError('The latest fidelity check could not be loaded.'); });
    if (!initialRuleState.error) {
      try { if (localStorage.getItem(RULES_KEY) === null) localStorage.setItem(RULES_KEY, JSON.stringify(initialRuleState.rules)); }
      catch { setRulesError('Rules could not be saved in this browser. They remain available in this session.'); }
    }
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
    setSelection(current => current?.start === next?.start && current?.end === next?.end ? current : next);
  }
  async function openSidebar(next: 'revise' | 'history') {
    setSidebar(current => current === next ? null : next);
    if (next === 'history') {
      try { receiveHistory(await api<Run[]>('/api/runs')); }
      catch { setError('Revision history could not be loaded. Close and reopen History to retry.'); }
    }
  }
  async function generate(target?: TextSelection) {
    if (run || preview || draft.activeRunId || !begin('Revising…')) return;
    try {
      const result = await api<Run>('/api/runs', { method: 'POST', body: JSON.stringify({ original: draft.text, instruction: draft.instruction, rules, ...(target ? { selection: target } : {}) }) });
      remember(result);
      setLastRun(result); setLastLoadError(''); setPreview(null); setPreviewFinalId(null); setPreviewDecisionId(null);
      persist({ ...draftRef.current, lastRevisionId: result.id, lastFinalReviewId: null });
      setSidebar(null);
      setSelection(null);
      if (result.edits.length) {
        persist({ ...draftRef.current, activeRunId: result.id, feedback: {} });
        setRun(result);
      } else setNotice('No changes suggested.');
    } catch (error) { setError((error as Error).message); }
    finally { end(); }
  }
  async function patch(edits: EditUpdate[]) {
    const result = await api<Run>(`/api/runs/${run!.id}`, { method: 'PATCH', body: JSON.stringify({ edits }) });
    receive(result);
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
      const finalized = await api<FinalizeResponse>(`/api/runs/${result.id}/finalize`, { method: 'POST' });
      const snapshot = finalized.run.finalReviews!.find(item => item.id === finalized.finalReviewId)!;
      receive(finalized.run); setLastRun(finalized.run);
      persist({ ...resultDraft(draftRef.current, finalized.run), text: snapshot.text, lastFinalReviewId: snapshot.id });
      setRun(null);
      setSelection(null);
    } catch (error) { setError(`Your review could not be finalized: ${(error as Error).message}`); }
    finally { end(); }
  }
  async function proposeRule() {
    if (!begin('Finding a preference…')) return;
    try {
      const result = await api<{ rule: string | null }>('/api/rules/infer', { method: 'POST', body: JSON.stringify({ rules }) });
      setCandidate(result.rule || '');
      if (!result.rule) setNotice('No recurring preference found in your feedback yet.');
    } catch (error) { setError((error as Error).message); }
    finally { end(); }
  }
  function newDraft() {
    persist(emptyDraft()); setLastRun(null); setLastLoadError(''); setInspectedRun(null); setPreviewFinalId(null); setPreviewDecisionId(null); setRun(null); setPreview(null); setSelection(null); setSidebar(null); setRestoreFailed(false); setCandidate(''); setError(''); setNotice('');
  }
  function useResult(saved: Run, finalId?: string | null) {
    const snapshot = saved.finalReviews?.find(item => item.id === finalId);
    persist({ ...resultDraft({ ...draftRef.current, instruction: saved.instruction }, saved), ...(snapshot ? { text: snapshot.text, lastFinalReviewId: snapshot.id } : {}) });
    setLastRun(saved); setLastLoadError(''); setRun(null); setPreview(null); setPreviewFinalId(null); setPreviewDecisionId(null); setSelection(null); setSidebar(null); setRestoreFailed(false); setError(''); setNotice('');
  }
  function closePreview() { setPreview(null); setPreviewFinalId(null); setPreviewDecisionId(null); setFocusEdit(null); }
  function previewRun(saved: Run, finalId: string | null = null) { setPreview(saved); setPreviewFinalId(finalId); setPreviewDecisionId(null); setFocusEdit(null); }
  function openAudit(saved: Run, finalId: string | null = null) { setInspectedRun(saved); setAuditFinalId(finalId); setSidebar('fidelity'); }
  function inspectSnapshot(saved: Run, finalId: string | null = null, editId?: string) {
    setPreviewDecisionId(null);
    if (run?.id === saved.id && !finalId) { setPreview(null); setPreviewFinalId(null); }
    else { setPreview(saved); setPreviewFinalId(finalId); }
    setFocusEdit(editId ? { id: editId, nonce: ++focusNonce.current } : null);
    if (matchMedia('(max-width: 900px)').matches) setSidebar(null);
  }
  function inspectProposal(saved: Run, finalId: string, editId: string) {
    setPreview(saved); setPreviewFinalId(null); setPreviewDecisionId(finalId);
    setFocusEdit({ id: editId, nonce: ++focusNonce.current });
    if (matchMedia('(max-width: 900px)').matches) setSidebar(null);
  }
  async function resumeReview(saved: Run, finalId: string | null) {
    if (!begin('Restoring decisions…')) return;
    try {
      const snapshot = saved.finalReviews?.find(item => item.id === finalId);
      const restored = snapshot ? await api<Run>(`/api/runs/${saved.id}`, { method: 'PATCH', body: JSON.stringify({ edits: snapshot.decisions }) }) : await api<Run>(`/api/runs/${saved.id}`);
      receive(restored); setRun(restored); setLastRun(restored);
      persist({ ...draftRef.current, text: compose(restored), instruction: restored.instruction, activeRunId: restored.id, feedback: {}, lastRevisionId: restored.id, lastFinalReviewId: finalId });
      setPreview(null); setPreviewFinalId(null); setPreviewDecisionId(null); setSidebar(null); setRestoreFailed(false);
    } catch (failure) { setError((failure as Error).message); }
    finally { end(); }
  }
  async function retryAudit(saved: Run, auditId: string) {
    if (auditOperation.current) return;
    auditOperation.current = true; setAuditBusy(auditId); setError('');
    try { receive(await api<Run>(`/api/runs/${saved.id}/audits/${auditId}/retry`, { method: 'POST' })); }
    catch (failure) { setError((failure as Error).message); }
    finally { auditOperation.current = false; setAuditBusy(''); }
  }
  async function saveAuditFeedback(saved: Run, auditId: string, assessmentId: string, disagreed: boolean, text: string) {
    if (auditOperation.current) return;
    auditOperation.current = true; setAuditBusy(assessmentId); setError('');
    try {
      receive(await api<Run>(`/api/runs/${saved.id}/audits/${auditId}/feedback`, { method: 'PATCH', body: JSON.stringify({ assessmentId, disagreed, text }) }));
      const auditFeedback = { ...draftRef.current.auditFeedback }, key = `${auditId}/${assessmentId}`;
      if (auditFeedback[key] === text) { delete auditFeedback[key]; persist({ ...draftRef.current, auditFeedback }); }
    } catch (failure) { setError(`Audit feedback could not be saved: ${(failure as Error).message}`); }
    finally { auditOperation.current = false; setAuditBusy(''); }
  }
  async function retryLastCheck() {
    const id = draftRef.current.lastRevisionId;
    if (!id) return;
    try {
      const result = await api<Run>(`/api/runs/${id}`);
      if (draftRef.current.lastRevisionId !== id) return;
      setLastRun(current => current?.id === id ? newerRun(current, result) : result);
      setLastLoadError(''); polling.retry();
    } catch { if (draftRef.current.lastRevisionId === id) setLastLoadError('The latest fidelity check could not be loaded.'); }
  }
  const previewFinal = preview?.finalReviews?.find(item => item.id === previewFinalId);
  const previewDecisions = preview?.finalReviews?.find(item => item.id === previewDecisionId);
  const visibleRun = preview ? previewFinal ? finalSnapshot(preview, previewFinal) : previewDecisions ? proposalSnapshot(preview, previewDecisions) : preview : run;
  const auditFinal = inspectedRun?.finalReviews?.find(item => item.id === auditFinalId);
  const inspectedAudit = auditFinal?.audit || inspectedRun?.proposalAudit;
  const lastFinal = lastRun?.finalReviews?.find(item => item.id === draft.lastFinalReviewId);
  const lastAudit = lastFinal?.audit || lastRun?.proposalAudit;
  const earlierSnapshot = !!lastRun && draft.text !== (lastFinal?.text ?? lastRun.revised);
  const currentText = run ? compose(run) : draft.text;
  const visibleText = visibleRun ? compose(visibleRun) : currentText;
  return {
    draft, rules, run, preview, history, sidebar, selection, busy, restoreFailed, error, notice, storageError, rulesError, candidate, currentText, visibleText,
    visibleRun, previewFinal, previewFinalId, previewDecisionId, previewRun, closePreview, inspectedRun, inspectedAudit, auditFinal, auditFinalId, openAudit, inspectSnapshot, inspectProposal, resumeReview,
    lastRun, lastFinal, lastAudit, earlierSnapshot, lastLoadError, retryLastCheck, auditBusy, retryAudit, saveAuditFeedback, focusEdit,
    auditPollError: polling.error, retryPolling: polling.retry,
    editAuditFeedback: (key: string, text: string) => persist({ ...draftRef.current, auditFeedback: { ...draftRef.current.auditFeedback, [key]: text } }),
    setError, setNotice, setSidebar, setCandidate, setRules, editText, captureSelection, openSidebar, generate, decide, editFeedback, finishReview, proposeRule, newDraft, useResult, restore, continueWithoutReview,
    editInstruction: (instruction: string) => persist({ ...draftRef.current, instruction }),
    retryStorage: () => persist(draftRef.current),
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
