export type Decision = 'pending' | 'accepted' | 'rejected';
export interface Rule { id: string; text: string; enabled: boolean }
export interface Edit { id: string; before: string; after: string; start: number; end: number; flag: boolean; reason: string; decision: Decision; feedback: string }
export interface Segment { text?: string; editId?: string }
export interface Clause { id: string; text: string; kind: 'request' | 'prohibition'; status: 'fulfilled' | 'review' | 'violated'; editIds: string[] }
export interface Run { id: string; original: string; revised: string; instruction: string; rules: Rule[]; edits: Edit[]; segments: Segment[]; clauses: Clause[]; createdAt: string; mode: 'generated' | 'manual'; model?: string }
