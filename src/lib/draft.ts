import { compose } from '../../shared/compose.js';
import type { Run } from '../../shared/types.js';

export const DRAFT_KEY = 'difflens-draft-v1';
export interface Draft { text: string; instruction: string; activeRunId: string | null; lastRevisionId: string | null; lastFinalReviewId: string | null; auditFeedback: Record<string, string>; passageDrafts: Record<string, string>; passageFeedback: Record<string, string> }
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const emptyDraft = (): Draft => ({ text: '', instruction: '', activeRunId: null, lastRevisionId: null, lastFinalReviewId: null, auditFeedback: {}, passageDrafts: {}, passageFeedback: {} });
export function readDraft(storage: StoragePort): Draft {
  const saved = JSON.parse(storage.getItem(DRAFT_KEY) || '{}');
  return Object.fromEntries(Object.entries(emptyDraft()).map(([key, fallback]) => [key, saved[key] ?? fallback])) as Draft;
}
export function writeDraft(storage: StoragePort, draft: Draft) { storage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
export function resultDraft(draft: Draft, run: Run): Draft {
  return { ...draft, text: compose(run), activeRunId: null, lastRevisionId: run.id, lastFinalReviewId: null };
}
