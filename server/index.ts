import staticFiles from '@fastify/static';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';

mkdirSync('data', { recursive: true });
const app = createApp(new DatabaseSync('data/difflens.sqlite'));
if (existsSync('dist')) await app.register(staticFiles, { root: resolve('dist') });
await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
