# DiffLens

A text editing tool that generates revisions from your instructions and lets you accept or reject individual changes. Built with React, TypeScript, Vite, Fastify, and SQLite (Node's built-in SQLite module).

## Run

Requires Node.js 24.21 or newer within the Node 24 LTS line. `.nvmrc` and `.node-version` select Node 24. Keep `@types/node` on major 24.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies API calls to Fastify on port 3001.

The server reads `OPENAI_API_KEY`, `OPENAI_MODEL`, and optional `OPENAI_BASE_URL` from this project’s `.env`. Existing environment variables take precedence. Keys remain on the server. Text generation and rule inference use the configured Responses API.

```sh
npm run build
npm start
```

The build clears previous output, type-checks the browser and tooling, compiles the Node server into `dist-server/`, and bundles the frontend into `dist/`. Type checks also reject unused locals and parameters. `npm run clean` removes both build directories. `npm start` runs the compiled server with Node, without requiring development dependencies. After a build, Fastify serves the app at http://127.0.0.1:3001.

For deployment, build with development dependencies installed, then install runtime dependencies with `npm ci --omit=dev`. Keep both build directories and run from the project root.

## Workflow

1. Paste a passage and editing instruction; optionally add your own standing rules. New browsers start with no rules.
2. Generate a revision from your editing instruction and enabled standing rules.
3. Select changes in the unified diff. Accept or reject them and save feedback.
4. View the composed result. Only accepted edits are applied; pending and rejected edits preserve original text.
5. After explaining at least two rejected edits, request a model-inferred standing rule. Edit, accept, or dismiss the proposal.
6. Export the revision, rule snapshot, decisions, feedback, and composed result as JSON.

Revisions and decisions persist in `data/difflens.sqlite`. Current standing rules persist in browser local storage; each run freezes its own rule snapshot. Recent revision history is limited to 20 entries in the interface. All offsets are JavaScript UTF-16 code units.

## Checks

```sh
npm test
npm run build
```

## Prototype scope

This is a local, single-user prototype. It does not implement authentication, participant-study instrumentation, or edit boundary adjustment. Do not expose the local server publicly. Rule inference uses feedback from the 20 most recent revisions. Each revision uses one model call, followed by local diff computation. Prompt text, passage text, and enabled rules are sent to the configured API provider with `store: false`.

The project is unreleased. Local data is disposable; schema changes do not preserve older data formats or include migrations. Start with fresh local data when its shape changes.

API calls use explicit developer instructions and a separate user data message. Rule proposals use strict JSON Schema through Responses `text.format`; text generation returns plain text. Refused, incomplete, or empty responses are rejected before saving a result.
