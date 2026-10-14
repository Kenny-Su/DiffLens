import type { JSONContent } from '@tiptap/react';
import { compose } from '../../shared/compose.js';
import type { Run } from '../../shared/types.js';

export const DRAFT_KEY = 'difflens-draft-v1';
export interface Draft { version: 1; document?: JSONContent; documentText?: string; text: string; instruction: string; activeRunId: string | null; feedback: Record<string, string>; lastRevisionId: string | null; lastFinalReviewId: string | null; auditFeedback: Record<string, string>; passageDrafts: Record<string, string>; passageFeedback: Record<string, string> }
interface StoragePort { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const emptyDraft = (): Draft => ({ version: 1, text: '', instruction: '', activeRunId: null, feedback: {}, lastRevisionId: null, lastFinalReviewId: null, auditFeedback: {}, passageDrafts: {}, passageFeedback: {} });
export function readDraft(storage: StoragePort): Draft {
  const raw = storage.getItem(DRAFT_KEY);
  if (!raw) return emptyDraft();
  const draft = JSON.parse(raw);
  if (draft?.version !== 1 || typeof draft.text !== 'string' || typeof draft.instruction !== 'string' || (draft.activeRunId !== null && typeof draft.activeRunId !== 'string') || !draft.feedback || typeof draft.feedback !== 'object' || Array.isArray(draft.feedback) || Object.values(draft.feedback).some(value => typeof value !== 'string')) throw new Error('The saved draft could not be read. The stored copy has not been changed.');
  if (draft.document !== undefined && (!draft.document || typeof draft.document !== 'object' || draft.document.type !== 'doc' || !Array.isArray(draft.document.content))) throw new Error('Invalid saved document.');
  if (draft.documentText !== undefined && typeof draft.documentText !== 'string') throw new Error('Invalid saved document text.');
  for (const key of ['lastRevisionId', 'lastFinalReviewId']) if (draft[key] !== undefined && draft[key] !== null && typeof draft[key] !== 'string') throw new Error('Invalid saved revision reference.');
  const auditFeedback = draft.auditFeedback ?? {};
  if (!auditFeedback || typeof auditFeedback !== 'object' || Array.isArray(auditFeedback) || Object.values(auditFeedback).some(value => typeof value !== 'string')) throw new Error('Invalid saved audit feedback.');
  const passageDrafts = draft.passageDrafts ?? {}, passageFeedback = draft.passageFeedback ?? {};
  for (const entries of [passageDrafts, passageFeedback]) if (!entries || typeof entries !== 'object' || Array.isArray(entries) || Object.values(entries).some(value => typeof value !== 'string')) throw new Error('Invalid saved passage text.');
  return { ...draft, lastRevisionId: draft.lastRevisionId ?? null, lastFinalReviewId: draft.lastFinalReviewId ?? null, auditFeedback, passageDrafts, passageFeedback };
}
export function writeDraft(storage: StoragePort, draft: Draft) { storage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
export function resultDraft(draft: Draft, run: Run): Draft {
  const keepDocument = (draft.documentText ?? draft.text) === run.original;
  return { ...draft, document: keepDocument ? draft.document : undefined, documentText: keepDocument ? draft.documentText ?? draft.text : undefined, text: compose(run), activeRunId: null, feedback: {}, lastRevisionId: run.id, lastFinalReviewId: null };
}
