# DiffLens

A local research prototype for reviewing AI revisions to plain text. Write, request a revision, inspect fidelity concerns, and accept, reject, or rewrite proposed passages.

## Run

Use Node 24.21+ within the Node 24 line (`.nvmrc`). Copy `.env.example` to `.env` and set `OPENAI_API_KEY` and `OPENAI_MODEL`. `OPENAI_BASE_URL` is optional; the provider must support the Responses API and structured output.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to Fastify on port 3001.

For a compiled build:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3001. The build type-checks the project and replaces `dist/` and `dist-server/`. `npm run clean` removes those outputs.

## Workflow

- Write in the native textarea. There is no formatting toolbar, Markdown/LaTeX renderer, or rich-text document model. Writing and review share typography and page width.
- Use the text bar at the bottom for a document instruction, or select text and choose **Revise selection** (**Alt+Enter**). **Enter** submits; **Shift+Enter** adds a line. Standing rules are available from the revision input.
- Review plays changes sentence by sentence and pauses at linked fidelity concerns. Select a passage to **Accept**, **Reject**, or **Use edited text**. Decisions cover the whole passage, including grouped sentence splits and merges.
- **Return to writing** assembles accepted changes and manual replacements; pending or rejected passages retain the original. It runs a fresh fidelity check on that result.
- **History** previews saved revisions. **Use result** replaces the working draft; **Revisit review** restores its decisions. Copy/download uses committed decisions. JSON export includes the proposal, decisions, feedback, and audit snapshots.
- Disagree with an audit finding or leave passage feedback. Rule suggestions use this feedback and take effect only when added by the author.

Draft text, the unsent instruction, and unfinished passage/feedback edits autosave in browser local storage. Only current plain-text draft fields are retained. Rules are stored separately and start with four editable scientific defaults. Revisions and audits are stored in `data/difflens.sqlite`; history lists the latest 20. Existing saved records remain readable.

## Implementation

React + TypeScript + Vite for the UI; Fastify + Node's SQLite module for persistence. Review renders plain text spans. Selection offsets use UTF-16, with a small adapter for textarea line endings. Documents and composed results are limited to 30,000 characters.

A revision uses one generation call and one background proposal check. Each distinct final result adds another check. Checks receive the original, target, instruction, rules, selection, and edits. Final checks also receive the proposal and author decisions. Passing verdicts use compact ID lists; concerns and instruction clauses get short explanations. Validation requires complete edit/rule coverage. Failed checks remain visibly unavailable and can be retried.

One background worker processes audits and resumes unfinished checks after restart. Run versions prevent stale polling responses from overwriting decisions. These checks evaluate fidelity, not external factual truth.

| API | Purpose |
| --- | --- |
| `POST /api/runs` | Generate from `original`, `instruction`, `rules`, and optional `selection` |
| `GET /api/runs`, `GET /api/runs/:id` | List or load saved revisions |
| `PATCH /api/runs/:id` | Apply `passages: [{ id, decision, feedback, replacementText? }]` or `restoreFinalReviewId` |
| `POST /api/runs/:id/finalize` | Save the composed result and queue its check |
| `PATCH /api/runs/:id/passages/:passageId/feedback` | Save passage feedback |
| `POST /api/runs/:id/audits/:auditId/retry` | Retry a failed check |
| `PATCH /api/runs/:id/audits/:auditId/feedback` | Save an assessment disagreement |
| `POST /api/rules/infer` | Suggest a rule from feedback and current `rules` |

## Checks

```sh
npm test
npm run build
```

Tests use mocked models and temporary databases, covering selection boundaries, passage composition, review playback, manual edits, audit coverage, and persistence. `npm run typecheck` checks types without building.

`npm run eval:fidelity` makes real API calls on 14 synthetic cases and writes `data/fidelity-evaluation.json`. It is a quality smoke test, not a calibrated research benchmark.

The app is single-user and local, without authentication or participant-study instrumentation. Model requests send document snapshots, instructions, rules, and relevant feedback to the configured provider with `store: false`. Keys stay on the server.
