import type { Workspace } from '../useWorkspace';
import { Icon } from './Icon';

export function StandingRules({ workspace: w }: { workspace: Workspace }) {
  return <>
    <p className="field-hint">Preferences to use with every revision.</p>
    {w.rules.map((rule, index) => <div className="rule-item" key={rule.id}>
      <textarea aria-label={`Rule ${index + 1}`} value={rule.text} placeholder="Keep my tone of voice…" maxLength={1000} disabled={!!w.busy} onChange={event => w.setRules(w.rules.map(item => item.id === rule.id ? { ...item, text: event.target.value } : item))} />
      <div className="rule-actions"><label><input type="checkbox" checked={rule.enabled} disabled={!!w.busy} onChange={event => w.setRules(w.rules.map(item => item.id === rule.id ? { ...item, enabled: event.target.checked } : item))} />Enabled</label><button className="icon-button" aria-label={`Remove rule ${index + 1}`} disabled={!!w.busy} onClick={() => w.setRules(w.rules.filter(item => item.id !== rule.id))}><Icon name="close" /></button></div>
    </div>)}
    <button className="text-button add-rule" disabled={!!w.busy || w.rules.length >= 50} onClick={() => w.setRules([...w.rules, { id: crypto.randomUUID(), text: '', enabled: true }])}><Icon name="plus" />Add rule</button>
    <button className="text-button suggest-rule" disabled={!!w.busy} onClick={w.proposeRule}>Suggest a rule from feedback<Icon name="arrow" /></button>
    {w.candidate && <div className="rule-candidate"><label className="field-label" htmlFor="candidate">Suggested rule</label><textarea id="candidate" value={w.candidate} maxLength={1000} disabled={!!w.busy} onChange={event => w.setCandidate(event.target.value)} /><div className="rule-candidate-actions"><button disabled={!!w.busy || !w.candidate.trim() || w.rules.length >= 50} onClick={() => { w.setRules([...w.rules, { id: crypto.randomUUID(), text: w.candidate, enabled: true }]); w.setCandidate(''); }}>Add rule</button><button className="text-button" disabled={!!w.busy} onClick={() => w.setCandidate('')}>Dismiss</button></div></div>}
  </>;
}
