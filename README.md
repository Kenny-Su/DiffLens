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

1. Write or paste text into the document workspace. The working draft and revision instruction autosave in this browser.
2. Optionally select a passage, then open **Revise**. Enter an instruction and press **Send**. A selected passage is revised automatically; without a selection, the revision applies to the whole document. Standing rules are available through the settings icon in the sidebar heading.
3. Generate suggestions. The document is temporarily read-only during generation and review. Each contiguous word-level change can be accepted or rejected independently.
4. Select a highlighted change for accept/reject controls and optional feedback. Use **Show resolved** to inspect completed decisions and undo them, or accept/reject all remaining suggestions.
5. Choose **Return to writing**. Accepted changes become draft text; pending and rejected changes retain the original wording. Unsaved feedback is saved before leaving review.
6. Open **History** to preview a saved revision without replacing the draft. **Use result** explicitly replaces the working draft. Both replacement and starting a new draft protect existing writing with a confirmation.
7. Copy or download the current text. JSON exports in review/history include the revision, selection scope, rule snapshot, decisions, feedback, and composed result.
8. After explaining at least two rejected changes, request a standing-rule suggestion from feedback. Edit, add, or dismiss the proposal.

There is one working draft per browser, stored under `difflens-draft-v1` in local storage, including the instruction, active review ID, and feedback drafts. Reloading restores the active review from the server. If storage or review restoration fails, the interface preserves the open draft and offers recovery actions. Standing rules are stored separately in browser local storage.

Revisions and decisions persist in `data/difflens.sqlite`. The history panel shows the latest 20 revisions; an active review can be retrieved by ID even if it is older. This version supports plain text, with no named-document library.

## Revision API

`POST /api/runs` accepts `original`, `instruction`, `rules`, and an optional `selection: { start, end }`. Selection offsets use JavaScript UTF-16 code units and must describe a nonempty range of complete characters containing non-whitespace text. The full document provides model context; only the selected passage is replaced. Unselected text and whitespace at the selection boundaries are preserved exactly. Both saved text snapshots represent the complete document.

`GET /api/runs` returns recent revisions, and `GET /api/runs/:id` restores one revision. `PATCH /api/runs/:id` saves individual or bulk edit decisions and feedback. Invalid edit IDs reject the entire update. Documents and generated results are limited to 30,000 characters; there is no sentence-count limit.

## Checks

```sh
npm test
npm run build
```

## Prototype scope

This is a local, single-user prototype. It does not implement authentication, participant-study instrumentation, or edit boundary adjustment. Do not expose the local server publicly. Rule inference uses feedback from the 20 most recent revisions. Each revision uses one model call, followed by local diff computation. Prompt text, passage text, and enabled rules are sent to the configured API provider with `store: false`.

The project is unreleased. Local data is disposable; schema changes do not preserve older data formats or include migrations. Start with fresh local data when its shape changes.

API calls use explicit developer instructions and a separate user data message. Rule proposals use strict JSON Schema through Responses `text.format`; text generation returns plain text. Refused, incomplete, or empty responses are rejected before saving a result.
