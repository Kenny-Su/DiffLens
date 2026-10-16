import { Fragment, type ReactNode } from 'react';
import type { reviewDocument } from '../lib/reviewDocument';

interface Props {
  content: ReturnType<typeof reviewDocument>;
  passages: { id: string; label: string; concern: boolean; draft: boolean }[];
  selected: string | null; selectedPosition: number | null;
  onSelect: (id: string, position: number, focus: boolean) => void;
  children: ReactNode;
}
export function ReviewDocument({ content, passages, selected, selectedPosition, onSelect, children }: Props) {
  const selectedBlock = content.blocks.findIndex(block => block.some(chunk => chunk.passageId === selected && chunk.start === selectedPosition));
  const inspectorBlock = selectedBlock >= 0 ? selectedBlock : content.blocks.findIndex(block => block.some(chunk => chunk.passageId === selected));
  return <div className="document-text review-text" role="document" aria-label="Revision document">
    {content.blocks.map((block, blockIndex) => <Fragment key={blockIndex}>
      {block.map((chunk, index) => {
        const passage = passages.find(item => item.id === chunk.passageId);
        const text = chunk.parts?.map((part, index) => part.removed ? <del key={index}>{part.text}</del> : part.added ? <ins key={index}>{part.text}</ins> : <Fragment key={index}>{part.text}</Fragment>) ?? chunk.text;
        if (!passage) return <Fragment key={index}>{text}</Fragment>;
        return <span key={index} role="button" tabIndex={0} data-passage={passage.id}
          className={`review-passage${passage.id === selected ? ' selected' : ''}${passage.concern ? ' has-concern' : ''}${passage.draft ? ' has-draft' : ''}`}
          aria-label={passage.label} aria-expanded={passage.id === selected}
          onClick={event => onSelect(passage.id, chunk.start, event.detail === 0)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (!event.repeat) onSelect(passage.id, chunk.start, true);
            }
          }}>
          {passage.concern && <span className="audit-marker" aria-hidden="true">!</span>}
          {chunk.text ? text : <span className="empty-passage">Empty passage</span>}
        </span>;
      })}
      {selected && blockIndex === inspectorBlock && <div className="review-inspector-host">{children}</div>}</Fragment>)}
  </div>;
}
