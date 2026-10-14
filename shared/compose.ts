import type { Run } from './types.js';
import { passageText } from './passages.js';

export function compose(run: Run): string {
  if (run.passages && Object.values(run.passageReviews ?? {}).some(review => review.replacementText !== undefined)) {
    let offset = 0, text = '';
    for (const passage of run.passages) {
      text += run.original.slice(offset, passage.start) + passageText(run, passage);
      offset = passage.end;
    }
    return text + run.original.slice(offset);
  }
  return run.segments.map(segment => {
    if (segment.text !== undefined) return segment.text;
    const edit = run.edits.find(edit => edit.id === segment.editId)!;
    return edit.decision === 'accepted' ? edit.after : edit.before;
  }).join('');
}
