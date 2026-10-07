import Fastify from 'fastify';
import staticFiles from '@fastify/static';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { audit } from './core.js';
import { type Rule, type Run } from '../shared/types.js';
import { revise, auditWithModel, inferRule } from './model.js';
mkdirSync('data', { recursive: true });
const db = new DatabaseSync('data/difflens.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
app.setErrorHandler((error, _req, reply) => { const validation = error instanceof Error && 'validation' in error; reply.code(validation ? 400 : 502).send({ message: validation ? 'Invalid request. Check your input.' : error instanceof Error ? error.message : 'Request failed.' }); });
const ruleSchema = { type: 'object', additionalProperties: false, required: ['id', 'text', 'enabled'], properties: { id: { type: 'string' }, text: { type: 'string', maxLength: 1000 }, enabled: { type: 'boolean' } } };
app.post<{ Body: { original: string; revised?: string; instruction: string; rules: Rule[] } }>('/api/runs', {
  schema: { body: { type: 'object', additionalProperties: false, required: ['original', 'instruction', 'rules'], properties: { original: { type: 'string', minLength: 1, maxLength: 30000 }, revised: { type: 'string', maxLength: 30000 }, instruction: { type: 'string', minLength: 1, maxLength: 5000 }, rules: { type: 'array', maxItems: 50, items: ruleSchema } } } },
}, async (req, reply) => {
  const { original, instruction, rules, revised } = req.body;
  const text = revised ?? await revise(original, instruction, rules);
  const run = await auditWithModel(audit(original, text, instruction, rules, revised === undefined ? 'generated' : 'manual'));
  db.prepare('INSERT INTO runs VALUES (?, ?)').run(run.id, JSON.stringify(run));
  return run;
});
app.get('/api/runs', async () => db.prepare('SELECT body FROM runs ORDER BY rowid DESC LIMIT 20').all().map(row => JSON.parse(row.body as string)));
app.post('/api/rules/infer', async () => {
  const runs = db.prepare('SELECT body FROM runs ORDER BY rowid DESC LIMIT 20').all().map(row => JSON.parse(row.body as string) as Run);
  return { rule: await inferRule(runs) };
});
app.patch<{ Params: { id: string }; Body: { edits: { id: string; decision: string; feedback: string }[] } }>('/api/runs/:id', {
  schema: { body: { type: 'object', additionalProperties: false, required: ['edits'], properties: { edits: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'decision', 'feedback'], properties: { id: { type: 'string' }, decision: { enum: ['pending', 'accepted', 'rejected'] }, feedback: { type: 'string', maxLength: 5000 } } } } } } },
}, async (req, reply) => {
  const row = db.prepare('SELECT body FROM runs WHERE id = ?').get(req.params.id);
  if (!row) return reply.code(404).send({ message: 'Revision not found' });
  const run: Run = JSON.parse(row.body as string);
  for (const update of req.body.edits) { const edit = run.edits.find(e => e.id === update.id); if (edit) { edit.decision = update.decision as typeof edit.decision; edit.feedback = update.feedback; } }
  db.prepare('UPDATE runs SET body = ? WHERE id = ?').run(JSON.stringify(run), run.id);
  return run;
});
if (existsSync('dist')) { await app.register(staticFiles, { root: resolve('dist') }); }
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
