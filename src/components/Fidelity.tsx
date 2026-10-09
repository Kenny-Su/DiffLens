import type { Assessment, FidelityAudit } from '../../shared/types';
import { auditLabel, isChecking, needsAttention } from '../../shared/fidelity';
import type { Workspace } from '../useWorkspace';
import { Icon } from './Icon';

export function FidelityStatus({ audit, onClick, prefix = 'Fidelity' }: { audit?: FidelityAudit; onClick: () => void; prefix?: string }) {
  const concern = audit?.status === 'complete' && audit.assessments.some(needsAttention);
  return <button className={`fidelity-status ${concern ? 'attention' : ''}`} onClick={onClick} aria-label={`${prefix}: ${auditLabel(audit)}`}>
    {isChecking(audit) ? <span className="spinner" /> : <span className="fidelity-dot" />}{prefix}: <span role="status">{auditLabel(audit)}</span>
  </button>;
}
function Finding({ item, workspace: w }: { item: Assessment; workspace: Workspace }) {
  const run = w.inspectedRun!, audit = w.inspectedAudit!;
  const saved = audit.feedback[item.id], key = `${audit.id}/${item.id}`;
  const note = w.draft.auditFeedback[key] ?? saved?.text ?? '';
  async function save(disagreed: boolean, button: HTMLButtonElement, fromKeyboard: boolean) {
    await w.saveAuditFeedback(run, audit.id, item.id, disagreed, note);
    if (fromKeyboard) requestAnimationFrame(() => {
      const target = button.disabled ? button.closest('.audit-feedback')?.querySelector('textarea') : button;
      target?.focus();
    });
  }
  return <details className={`audit-finding ${needsAttention(item) ? 'attention' : ''}`}>
    <summary><span>{item.text}</span><small>{item.outcome.replaceAll('_', ' ')}{saved?.disagreed ? ' · You disagreed' : ''}</small></summary>
    <p>{item.reason}</p>
    {!!item.ruleIds.length && <div className="audit-rule-refs">{item.ruleIds.map(id => <p key={id}>Rule: {run.rules.find(rule => rule.id === id)?.text}</p>)}</div>}
    <div className="audit-links">
      {item.editIds.map(id => <button className="text-button" key={id} onClick={() => w.inspectSnapshot(run, w.auditFinalId, id)}>View change {id.slice(1)}<Icon name="arrow" /></button>)}
      {!!w.auditFinal && item.proposalEditIds.map(id => <button className="text-button" key={id} onClick={() => w.inspectProposal(run, w.auditFinal!.id, id)}>Proposal change {id.slice(1)} ({w.auditFinal!.decisions.find(edit => edit.id === id)?.decision || 'pending'})<Icon name="arrow" /></button>)}
    </div>
    <button className="text-button disagreement-button" disabled={!!w.auditBusy} onClick={event => save(!saved?.disagreed, event.currentTarget, event.detail === 0)}>{saved?.disagreed ? 'Undo disagreement' : 'Disagree with this finding'}</button>
    {(saved?.disagreed || w.draft.auditFeedback[key] !== undefined) && <div className="audit-feedback"><label className="field-label" htmlFor={`audit-note-${item.id}`}>Your explanation (optional)</label><textarea id={`audit-note-${item.id}`} value={note} maxLength={5000} disabled={!!w.auditBusy} onChange={event => w.editAuditFeedback(key, event.target.value)} placeholder="What did the check miss?" /><button disabled={!!w.auditBusy || note === (saved?.text ?? '')} onClick={event => save(true, event.currentTarget, event.detail === 0)}>Save feedback</button></div>}
  </details>;
}
export function FidelityDetails({ workspace: w, onRevisit }: { workspace: Workspace; onRevisit: () => void }) {
  const run = w.inspectedRun, audit = w.inspectedAudit;
  if (!run) return null;
  const groups = [
    { name: 'Changed text', kinds: ['edit'] }, { name: 'Instruction fulfillment', kinds: ['request', 'prohibition', 'conflict'] }, { name: 'Standing rules', kinds: ['rule'] },
  ];
  return <>
    <div className="audit-snapshots" aria-label="Revision snapshots"><button className={!w.auditFinalId ? 'active' : ''} aria-pressed={!w.auditFinalId} onClick={() => w.openAudit(run)}>Proposal</button>{run.finalReviews?.map((review, index) => <button key={review.id} className={w.auditFinalId === review.id ? 'active' : ''} aria-pressed={w.auditFinalId === review.id} onClick={() => w.openAudit(run, review.id)}>Result {index + 1}</button>)}</div>
    <p className="field-hint">{w.auditFinal ? 'Checks the saved result against your original instruction, including requests left unmet during review.' : 'Checks the full proposed revision against your original text, instruction, and enabled rules.'}</p>
    <blockquote className="audit-instruction">{run.instruction}</blockquote>
    <div className="audit-snapshot-actions"><button className="text-button" onClick={() => w.inspectSnapshot(run, w.auditFinalId)}>Inspect saved text<Icon name="arrow" /></button>{w.auditFinal && <button className="text-button" onClick={onRevisit} disabled={!!w.busy}>Revisit review<Icon name="undo" /></button>}</div>
    <p className="audit-state" role="status">{auditLabel(audit)}</p>
    {w.auditPollError && <div className="field-error">{w.auditPollError} <button className="text-button" onClick={w.retryPolling}>Retry refresh</button></div>}
    {audit?.status === 'failed' && <div className="field-error"><p>{audit.error}</p><button disabled={!!w.auditBusy} onClick={() => w.retryAudit(run, audit.id)}>Retry check</button></div>}
    {audit?.status === 'complete' && <>
      {groups.map(group => {
        const items = audit.assessments.filter(item => group.kinds.includes(item.kind));
        const concerns = items.filter(needsAttention), other = items.filter(item => !needsAttention(item));
        return <section className="audit-group" key={group.name}><h3>{group.name}</h3>
          {concerns.map(item => <Finding key={`${audit.id}/${item.id}`} item={item} workspace={w} />)}
          {!!other.length && <details key={audit.id} className="audit-other"><summary>{other.length} other {other.length === 1 ? 'check' : 'checks'}</summary>{other.map(item => <Finding key={item.id} item={item} workspace={w} />)}</details>}
          {!items.length && <p className="field-hint">No applicable checks.</p>}
        </section>;
      })}
      <p className="field-hint audit-caveat">Model judgments can be mistaken. Your decisions and disagreements are saved separately.</p>
    </>}
  </>;
}
