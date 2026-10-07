import type { ResponseCreateParamsNonStreaming, Response } from 'openai/resources/responses/responses.js';
export type OutputFormat = { name: string; schema: Record<string, unknown> };
export const auditFormat: OutputFormat = {
  name: 'revision_audit',
  schema: {
    type: 'object', additionalProperties: false, required: ['edits', 'clauses'],
    properties: {
      edits: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['id', 'flag', 'reason'],
        properties: { id: { type: 'string' }, flag: { type: 'boolean', description: 'True when the edit is unacceptable under the instruction and applicable rules.' }, reason: { type: 'string' } },
      } },
      clauses: { type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['id', 'text', 'kind', 'status', 'editIds'],
        properties: {
          id: { type: 'string' }, text: { type: 'string' },
          kind: { type: 'string', enum: ['request', 'prohibition'] },
          status: { type: 'string', enum: ['fulfilled', 'review', 'violated'] },
          editIds: { type: 'array', items: { type: 'string' } },
        },
      } },
    },
  },
};
export const ruleFormat: OutputFormat = {
  name: 'rule_proposal',
  schema: { type: 'object', additionalProperties: false, required: ['rule'], properties: { rule: { type: ['string', 'null'] } } },
};
export function buildRequest(model: string, instructions: string, data: unknown, format?: OutputFormat): ResponseCreateParamsNonStreaming {
  return {
    model, store: false,
    input: [ { role: 'developer', content: instructions }, { role: 'user', content: JSON.stringify(data) } ],
    ...(format ? { text: { format: { type: 'json_schema' as const, name: format.name, strict: true, schema: format.schema } } } : {}),
  };
}
export function completedText(response: Pick<Response, 'status' | 'output' | 'output_text'>): string {
  if (response.output.some(item => item.type === 'message' && item.content.some(content => content.type === 'refusal'))) throw new Error('The model declined this request.');
  if (response.status !== 'completed') throw new Error(`The model response was ${response.status}; no result was saved. Please retry.`);
  if (!response.output_text.trim()) throw new Error('The model returned an empty response.');
  return response.output_text.trim();
}
