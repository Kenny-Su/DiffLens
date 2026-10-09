import Fastify from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { createRevision } from './core.js';
import { selectionError } from '../shared/selection.js';
import type { EditUpdate, RevisionRequest, Run } from '../shared/types.js';
import * as modelService from './model.js';

type Models = Pick<typeof modelService, 'revise' | 'inferRule' | 'model'>;
export function createApp(db: DatabaseSync, models: Models = modelService, logger = true) {
  db.exec('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
  const app = Fastify({ logger, bodyLimit: 1024 * 1024, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  app.addHook('onClose', async () => { db.close(); });
  app.setErrorHandler((error, _req, reply) => {
    const validation = error instanceof Error && 'validation' in error;
    reply.code(validation ? 400 : 502).send({ message: validation ? 'Invalid request. Check your input.' : error instanceof Error ? error.message : 'Request failed.' });
  });
  const recentRuns = () => db.prepare('SELECT body FROM runs ORDER BY rowid DESC LIMIT 20').all().map(row => JSON.parse(row.body as string) as Run);
  const findRun = (id: string): Run | null => {
    const row = db.prepare('SELECT body FROM runs WHERE id = ?').get(id);
    return row ? JSON.parse(row.body as string) as Run : null;
  };
  const ruleSchema = { type: 'object', additionalProperties: false, required: ['id', 'text', 'enabled'], properties: { id: { type: 'string' }, text: { type: 'string', maxLength: 1000 }, enabled: { type: 'boolean' } } };
  app.post<{ Body: RevisionRequest }>('/api/runs', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['original', 'instruction', 'rules'], properties: {
      original: { type: 'string', minLength: 1, maxLength: 30000 }, instruction: { type: 'string', minLength: 1, maxLength: 5000 },
      rules: { type: 'array', maxItems: 50, items: ruleSchema },
      selection: { type: 'object', additionalProperties: false, required: ['start', 'end'], properties: { start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 } } },
    } } },
  }, async (req, reply) => {
    const { original, instruction, rules, selection } = req.body;
    if (original.length > 30000) return reply.code(400).send({ message: 'Use a document of at most 30,000 characters.' });
    if (!original.trim() || !instruction.trim()) return reply.code(400).send({ message: 'Enter text and an editing instruction.' });
    if (selection) {
      const error = selectionError(original, selection);
      if (error) return reply.code(400).send({ message: error });
    }
    const replacement = await models.revise(original, instruction, rules, selection);
    const run = { ...createRevision(original, replacement, instruction, rules, selection), model: models.model };
    db.prepare('INSERT INTO runs VALUES (?, ?)').run(run.id, JSON.stringify(run));
    return run;
  });
  app.get('/api/runs', async () => recentRuns());
  app.get<{ Params: { id: string } }>('/api/runs/:id', async (req, reply) => {
    return findRun(req.params.id) ?? reply.code(404).send({ message: 'Revision not found' });
  });
  app.post('/api/rules/infer', async () => ({ rule: await models.inferRule(recentRuns()) }));
  app.patch<{ Params: { id: string }; Body: { edits: EditUpdate[] } }>('/api/runs/:id', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['edits'], properties: { edits: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['id', 'decision', 'feedback'], properties: { id: { type: 'string' }, decision: { enum: ['pending', 'accepted', 'rejected'] }, feedback: { type: 'string', maxLength: 5000 } },
    } } } } },
  }, async (req, reply) => {
    const run = findRun(req.params.id);
    if (!run) return reply.code(404).send({ message: 'Revision not found' });
    if (req.body.edits.some(update => !run.edits.some(edit => edit.id === update.id))) return reply.code(400).send({ message: 'A selected change no longer exists.' });
    for (const update of req.body.edits) Object.assign(run.edits.find(edit => edit.id === update.id)!, { decision: update.decision, feedback: update.feedback });
    db.prepare('UPDATE runs SET body = ? WHERE id = ?').run(JSON.stringify(run), run.id);
    return run;
  });
  return app;
}
