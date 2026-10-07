# DiffLens

A plain-text editor for passage-level scientific revision and fidelity auditing. Built with React, TypeScript, Vite, Fastify, and SQLite (Node's built-in SQLite module).

## Run

Requires Node.js 24.21 or newer within the Node 24 LTS line. `.nvmrc` and `.node-version` select Node 24. Keep `@types/node` on major 24.

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

The build type-checks the browser and tooling, compiles the Node server into `dist-server/`, and bundles the frontend into `dist/`. `npm start` runs the compiled server with Node, without requiring development dependencies. After a build, Fastify serves the app at http://127.0.0.1:3001.

For deployment, build with development dependencies installed, then install runtime dependencies with `npm ci --omit=dev`. Keep both build directories and run from the project root.

## Workflow

1. Paste a passage and editing instruction; optionally add your own standing rules. New browsers start with no rules.
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

This is a local, single-user prototype. It does not implement authentication, participant-study instrumentation, or edit boundary adjustment. Do not expose the local server publicly. Model-generated audits require human review. Rule inference uses feedback from the 20 most recent revisions. Generation and audit are sequential model calls; failed audits do not save a completed run. Prompt text, passage text, and enabled rules are sent to the configured API provider with `store: false`.

The project is unreleased. Local data is disposable; schema changes do not preserve older data formats or include migrations. Start with fresh local data when its shape changes.

## Local evaluation

Annotated revision exports are local data. Keep them in `fixtures/`; the entire directory is ignored by Git and is not bundled into the application. Evaluation reports in `data/` are also ignored. The app builds and runs without these files.

To evaluate an export such as `fixtures/my-passage.json`, run:

```sh
npm run evaluate:example -- my-passage
```

The evaluator uses the annotated edit boundaries and the original instruction, with no additional standing rules. Human labels and reasons are withheld from the API request. It writes model predictions, an edit-level confusion matrix, precision/recall/F1, prevalence, and clause comparisons to `data/my-passage-evaluation.json`. Undefined metrics are null. Clause outcomes are scored only for exact clause-text matches; unmatched clauses remain unscored. One passage is a smoke evaluation, not a general performance estimate.

Run `npm run evaluate:all` to evaluate all local exports. Each invocation requests fresh model judgments and overwrites the corresponding local reports. Confirmed-only and draft-only scores are reported separately in `data/evaluation-summary.json`; comparisons against draft annotations are exploratory.

API calls use explicit developer instructions and a separate user data message. Audits and rule proposals use strict JSON Schema through Responses `text.format`; passage generation returns plain text. Refused, incomplete, or empty responses are rejected before parsing. Semantic edit-ID validation still runs after schema-constrained output.
