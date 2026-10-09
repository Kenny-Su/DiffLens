import type { Run } from './types.js';

export function compose(run: Run): string {
  return run.segments.map(segment => {
    if (segment.text !== undefined) return segment.text;
    const edit = run.edits.find(edit => edit.id === segment.editId)!;
    return edit.decision === 'accepted' ? edit.after : edit.before;
  }).join('');
}
