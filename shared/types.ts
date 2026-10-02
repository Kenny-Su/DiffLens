export type Decision = 'pending' | 'accepted' | 'rejected';
export interface Rule { id: string; text: string; enabled: boolean }
export interface Edit { id: string; before: string; after: string; start: number; end: number; flag: boolean; reason: string; decision: Decision; feedback: string }
export interface Segment { text?: string; editId?: string }
export interface Clause { id: string; text: string; kind: 'request' | 'prohibition'; status: 'fulfilled' | 'review' | 'violated'; editIds: string[] }
export interface Run { id: string; original: string; revised: string; instruction: string; rules: Rule[]; edits: Edit[]; segments: Segment[]; clauses: Clause[]; createdAt: string; mode: 'generated' | 'manual'; model?: string; candidateRule?: string }
export const sample = 'We evaluated the interface with 24 participants across two sessions. Our results suggest that the interface may reduce task completion time by 18.7% under controlled laboratory conditions. However, the difference was not statistically significant (p = 0.08). Participants reported that the visual cues were helpful, although three participants found the initial layout confusing. These findings indicate that the approach could support scientific revision, but further evaluation is needed to establish its generalizability.';
export const defaultRules: Rule[] = [
  { id: 'hedges', text: 'Preserve uncertainty and the strength of scientific claims.', enabled: true },
  { id: 'numbers', text: 'Keep numerical values, statistics, and sample sizes unchanged.', enabled: true },
  { id: 'conditions', text: 'Retain limitations, conditions, and contradictory evidence.', enabled: true },
];
