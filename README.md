# DiffLens

A passage-level scientific revision workspace built with React, TypeScript, Vite, Fastify, and SQLite (Node's built-in SQLite module).

## Run

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies API calls to Fastify on port 3001.

The server reads `OPENAI_API_KEY`, `OPENAI_MODEL`, and optional `OPENAI_BASE_URL` from this project’s `.env`. Existing environment variables take precedence. Keys remain on the server. There is no demo generation or heuristic audit fallback: generation, fidelity auditing, and rule inference use the configured Responses API.

```sh
npm run build
npm start
```

After a build, Fastify serves the app at http://127.0.0.1:3001.

## Workflow

1. Paste a passage and editing instruction; edit or toggle standing rules.
2. Generate and audit a revision, or supply your own proposed revision to audit.
3. Select changes in the unified diff. Accept or reject them and save feedback.
4. Inspect instruction fulfillment and prohibition violations with linked edit IDs.
5. View the composed result. Only accepted edits are applied; pending and rejected edits preserve original text.
6. After explaining at least two rejected edits, request a model-inferred standing rule. Edit, accept, or dismiss the proposal.
7. Export the revision, model judgments, rule snapshot, decisions, feedback, and composed result as JSON.

Revisions and decisions persist in `data/difflens.sqlite`. Current standing rules persist in browser local storage; each run freezes its own rule snapshot. Recent revision history is limited to 20 entries in the interface. All offsets are JavaScript UTF-16 code units.

## Checks

```sh
npm test
npm run build
```

## Prototype scope

This is a local, single-user prototype. It does not implement authentication, participant-study instrumentation, edit boundary adjustment, or full manuscript formatting. Model-generated audits require human review. Rule inference uses feedback from the 20 most recent revisions. Generation and audit are sequential model calls; failed audits do not save a completed run. Prompt text, passage text, and enabled rules are sent to the configured API provider with `store: false`.
