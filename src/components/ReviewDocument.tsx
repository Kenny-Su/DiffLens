import { Fragment, type ReactNode } from 'react';
import { chunkAnimation, type ReviewChunk, type reviewDocument, type PassageDecoration, type AnimationDecoration } from '../lib/reviewDocument';

interface Props {
  content: ReturnType<typeof reviewDocument>; passages: PassageDecoration[]; animation?: AnimationDecoration;
  selected: string | null; selectedPosition: number | null; originalView: boolean;
  onSelect: (id: string, position: number, focus: boolean) => void;
  children: ReactNode;
}
function AnimatedText({ chunk, animation }: { chunk: ReviewChunk; animation?: AnimationDecoration }) {
  const frame = chunkAnimation(chunk, animation);
  if (!frame) return chunk.text;
  return <>{chunk.text.slice(0, frame.start)}<span className="transformation-sentence">
    {frame.caret === undefined ? chunk.text.slice(frame.start, frame.end) : <>{chunk.text.slice(frame.start, frame.caret)}<span className="transformation-caret" aria-hidden="true" />{chunk.text.slice(frame.caret, frame.end)}</>}
  </span>{chunk.text.slice(frame.end)}</>;
}
export function ReviewDocument({ content, passages, animation, selected, selectedPosition, originalView, onSelect, children }: Props) {
  const selectedBlock = content.blocks.findIndex(block => block.some(chunk => chunk.passageId === selected && chunk.start === selectedPosition));
  const inspectorBlock = selectedBlock >= 0 ? selectedBlock : content.blocks.findIndex(block => block.some(chunk => chunk.passageId === selected));
  return <div className="document-text review-text" role="document" aria-label="Revision document">
    {content.blocks.map((block, blockIndex) => <Fragment key={blockIndex}><span className="review-text-block">
      {block.map((chunk, index) => {
        const passage = passages.find(item => item.id === chunk.passageId);
        if (!passage) return <Fragment key={index}>{chunk.text}</Fragment>;
        return <span key={index} role="button" tabIndex={0} data-passage={passage.id}
          className={`review-passage${passage.selected ? ' selected' : ''}${passage.concern ? ' has-concern' : ''}${passage.draft ? ' has-draft' : ''}`}
          aria-label={passage.label} aria-expanded={passage.selected}
          onClick={event => onSelect(passage.id, chunk.start, event.detail === 0)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (!event.repeat) onSelect(passage.id, chunk.start, true);
            }
          }}>
          {passage.concern && <span className="audit-marker" aria-hidden="true">!</span>}
          {chunk.text ? <AnimatedText chunk={chunk} animation={animation} /> : <span className="deleted-passage">{originalView ? 'New passage' : 'Deleted passage'}</span>}
        </span>;
      })}
    </span>{selected && blockIndex === inspectorBlock && <div className="review-inspector-host">{children}</div>}</Fragment>)}
  </div>;
}
