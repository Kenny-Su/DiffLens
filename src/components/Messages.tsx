import type { Workspace } from '../useWorkspace';
import { Icon } from './Icon';

export function Messages({ workspace: w }: { workspace: Workspace }) {
  return <>
    {(w.error || w.notice || w.storageError || w.rulesError || w.draft.text.length > 30000) && <div className="messages">
      {w.error && <div className="message error" role="alert"><span>{w.error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => w.setError('')}><Icon name="close" /></button></div>}
      {w.storageError && <div className="message error" role="alert"><span>{w.storageError}</span><button onClick={w.retryStorage}>Retry saving</button></div>}
      {w.rulesError && <div className="message error" role="alert"><span>{w.rulesError}</span><button onClick={() => w.setRules(w.rules)}>Retry saving rules</button></div>}
      {w.notice && <div className="message notice" role="status"><span>{w.notice}</span><button className="icon-button" aria-label="Dismiss notice" onClick={() => w.setNotice('')}><Icon name="close" /></button></div>}
      {w.draft.text.length > 30000 && <div className="message error" role="alert">Your draft is saved, but AI revisions support up to 30,000 characters. Shorten the document before revising.</div>}
    </div>}
  </>;
}
