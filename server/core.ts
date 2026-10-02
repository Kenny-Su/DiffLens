import { diffWordsWithSpace } from 'diff';
import { randomUUID } from 'node:crypto';
import type { Run, Rule, Edit, Segment } from '../shared/types.js';
function sentences(text: string): { start: number; end: number; text: string }[] {
  const spans: { start: number; end: number; text: string }[] = [];
  const splitter = new Intl.Segmenter('en', { granularity: 'sentence' });
  for (const s of splitter.segment(text)) spans.push({ start: s.index, end: s.index + s.segment.length, text: s.segment });
  return spans;
}
export function audit(original: string, revised: string, instruction: string, rules: Rule[], mode: Run['mode']): Run {
  const a = sentences(original), b = sentences(revised), n = a.length, m = b.length;
  if (n > 200 || m > 200) throw new Error('Use a passage of at most 200 sentences for this prototype.');
  const costs = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(Infinity));
  const previous = new Map<string, [number, number]>();
  costs[0][0] = 0;
  const text = (spans: typeof a, index: number, count: number) => spans.slice(index,index + count).map(s => s.text).join('');
  const steps = [[1,1],[1,2],[2,1],[1,0],[0,1]];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    if (!Number.isFinite(costs[i][j])) continue;
    for (const [x,y] of steps) {
      if (i+x > n || j+y > m) continue;
      const left = text(a,i,x), right = text(b,j,y);
      const common = diffWordsWithSpace(left.trim(),right.trim()).filter(p => !p.added && !p.removed).reduce((sum,p) => sum+p.value.length,0);
      const ratio = 2*common / Math.max(1,left.trim().length+right.trim().length);
      const cost = x && y ? (1-ratio)*(x+y)/2 + .2*(x+y-2) : .8;
      if (costs[i][j]+cost < costs[i+x][j+y]) { costs[i+x][j+y] = costs[i][j]+cost; previous.set(`${i+x},${j+y}`,[i,j]); }
    }
  }
  const aligned: [number,number,number,number][] = [];
  let i = n, j = m;
  while (i || j) { const [p,q] = previous.get(`${i},${j}`)!; aligned.push([p,i,q,j]); i=p;j=q; }
  const edits: Edit[] = [], segments: Segment[] = [];
  for (const [p,i,q,j] of aligned.reverse()) {
    const before = text(a,p,i-p), after = text(b,q,j-q);
    if (before === after) { segments.push({text:before}); continue; }
    const start = a[p]?.start ?? original.length;
    const end = i > p ? a[i-1].end : start;
    const edit: Edit = { id: `e${edits.length+1}`, before, after, start, end, flag: false, reason: '', decision: 'pending', feedback: '' };
    edits.push(edit);segments.push({editId:edit.id});
  }
  return { id: randomUUID(), original, revised, instruction, rules, edits, segments, clauses: [], createdAt: new Date().toISOString(), mode };
}
export function compose(run: Run): string {
  return run.segments.map(s => s.text ?? (() => { const e = run.edits.find(e => e.id === s.editId)!; return e.decision === 'accepted' ? e.after : e.before; })()).join('');
}
