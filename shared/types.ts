export type Decision = 'pending' | 'accepted' | 'rejected';
export interface Rule { id: string; text: string; enabled: boolean }
export interface TextSelection { start: number; end: number }
export interface Edit { id: string; before: string; after: string; start: number; end: number; decision: Decision; feedback: string }
export interface Segment { text?: string; editId?: string }
export interface EditUpdate { id: string; decision: Decision; feedback: string }
export type AssessmentKind = 'edit' | 'request' | 'prohibition' | 'rule' | 'conflict';
export type AssessmentOutcome = 'acceptable' | 'unacceptable' | 'fulfilled' | 'partial' | 'unfulfilled' | 'respected' | 'violated' | 'not_applicable' | 'uncertain' | 'conflict';
export interface Assessment {
  id: string; kind: AssessmentKind; subjectId: string | null; text: string; outcome: AssessmentOutcome; reason: string;
  editIds: string[]; proposalEditIds: string[]; ruleIds: string[];
}
export interface AuditFeedback { disagreed: boolean; text: string; updatedAt: string }
export interface FidelityAudit {
  id: string; status: 'pending' | 'running' | 'complete' | 'failed'; attempt: number; promptVersion: string; model?: string;
  createdAt: string; completedAt?: string; error?: string; assessments: Assessment[]; feedback: Record<string, AuditFeedback>;
}
export interface FinalReview {
  id: string; text: string; edits: Edit[]; segments: Segment[]; decisions: EditUpdate[]; decisionKey: string; createdAt: string; audit: FidelityAudit;
}
export interface Run {
  id: string; original: string; revised: string; instruction: string; rules: Rule[]; edits: Edit[]; segments: Segment[]; createdAt: string;
  selection?: TextSelection; model?: string; version?: number; proposalAudit?: FidelityAudit; finalReviews?: FinalReview[];
}
export interface RevisionRequest { original: string; instruction: string; rules: Rule[]; selection?: TextSelection }
export interface FinalizeResponse { run: Run; finalReviewId: string }
