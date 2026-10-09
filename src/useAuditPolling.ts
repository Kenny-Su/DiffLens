import { useEffect, useRef, useState } from 'react';
import { isChecking, runAudits } from '../shared/fidelity';
import type { Run } from '../shared/types';
import { api } from './lib/api';

export function useAuditPolling(runs: (Run | null)[], receive: (run: Run) => void) {
  const latest = useRef(runs);
  latest.current = runs;
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const ids = [...new Set(runs.filter(Boolean).map(run => run!.id))].sort().join(',');
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout>, failures = 0;
    async function poll() {
      const pending = new Map(latest.current.filter((run): run is Run => !!run && runAudits(run).some(isChecking)).map(run => [run.id, run]));
      const results = await Promise.allSettled([...pending.keys()].map(id => api<Run>(`/api/runs/${id}`)));
      if (cancelled) return;
      let failed = false;
      for (const result of results) {
        if (result.status === 'fulfilled') receive(result.value); else failed = true;
      }
      setError(failed ? 'Check status could not be refreshed.' : '');
      if (results.length) {
        failures = failed ? failures + 1 : 0;
      }
      timer = setTimeout(() => { void poll(); }, Math.min(1500 * 2 ** failures, 12000));
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ids, receive, retry]);
  return { error, retry: () => setRetry(value => value + 1) };
}
