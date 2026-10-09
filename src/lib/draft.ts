import { compose } from '../../shared/compose.js';
import type { Run } from '../../shared/types.js';

export const DRAFT_KEY = 'difflens-draft-v1';
export interface Draft { version: 1; text: string; instruction: string; activeRunId: string | null; feedback: Record<string, string> }
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const emptyDraft = (): Draft => ({ version: 1, text: '', instruction: '', activeRunId: null, feedback: {} });
export function readDraft(storage: StoragePort): Draft {
  const raw = storage.getItem(DRAFT_KEY);
  if (!raw) return emptyDraft();
  const draft = JSON.parse(raw);
  if (draft?.version !== 1 || typeof draft.text !== 'string' || typeof draft.instruction !== 'string' || (draft.activeRunId !== null && typeof draft.activeRunId !== 'string') || !draft.feedback || typeof draft.feedback !== 'object' || Array.isArray(draft.feedback) || Object.values(draft.feedback).some(value => typeof value !== 'string')) throw new Error('The saved draft could not be read. The stored copy has not been changed.');
  return draft;
}
export function writeDraft(storage: StoragePort, draft: Draft) { storage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
export function resultDraft(draft: Draft, run: Run): Draft {
  return { ...draft, text: compose(run), activeRunId: null, feedback: {} };
}
