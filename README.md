# DiffLens

A plain-text editor that generates revisions, lets you accept or reject individual changes, and checks fidelity to your original instruction. Both model proposals and the author's assembled result are assessed: accepting a problematic change or rejecting a requested change can leave a concern. Built with React, TypeScript, Vite, Fastify, and SQLite (Node's built-in SQLite module).

## Run

Requires Node.js 24.21 or newer within the Node 24 LTS line. `.nvmrc` and `.node-version` select Node 24. Keep `@types/node` on major 24.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies API calls to Fastify on port 3001.

The server reads `OPENAI_API_KEY`, `OPENAI_MODEL`, and optional `OPENAI_BASE_URL` from this project’s `.env`. Existing environment variables take precedence. Keys remain on the server. Revision generation, separate fidelity assessments, and rule inference use the configured Responses API. Assessments and rule inference require structured-output support.

```sh
npm run build
npm start
```

The build clears previous output, type-checks the browser and tooling, compiles the Node server into `dist-server/`, and bundles the frontend into `dist/`. Type checks also reject unused locals and parameters. `npm run clean` removes both build directories. `npm start` runs the compiled server with Node, without requiring development dependencies. After a build, Fastify serves the app at http://127.0.0.1:3001.

For deployment, build with development dependencies installed, then install runtime dependencies with `npm ci --omit=dev`. Keep both build directories and run from the project root.

## Workflow

1. Write or paste text into the document workspace. The working draft and revision instruction autosave in this browser.
2. To revise a passage, select it and click **Revise selection** beside the text (or press **Alt+Enter**). Enter an instruction in the floating box and press **Send**. To revise the whole document, use **Revise** in the toolbar. Standing rules are available through the settings icon in that sidebar. Both instruction boxes autosave the same instruction; opening either does not change the draft.
3. Generate suggestions. The document is temporarily read-only during generation and review. Each contiguous word-level change can be accepted or rejected independently.
4. Review while the proposal's fidelity check runs in the background. **Fidelity** opens details in the existing sidebar. Amber markers identify edits linked to findings; selecting an edit shows its explanation. Findings are advisory: **Accept remaining** includes flagged edits. Use **Show resolved** to inspect completed decisions and undo them.
5. Choose **Return to writing**. The server saves a result snapshot with accepted changes; pending and rejected changes retain the original wording. It checks that result against the original instruction and rules while you continue writing. This includes requests left unmet by over-rejection and problems from combining decisions. The footer links to the check. If you edit the draft, the status says **Earlier revision** and opens the saved snapshot, never annotating or replacing newer writing. **Revisit review** restores saved decisions, with confirmation before replacing a different draft.
6. Open **History** to preview a saved revision without replacing the draft. **Use result** explicitly replaces the working draft. Both replacement and starting a new draft protect existing writing with a confirmation.
7. Copy or download the current text. JSON exports include selection scope, rule snapshot, proposal and final assessments, successive result snapshots, saved decisions, audit disagreements, edit feedback, and the displayed result.
8. Disagree with any mistaken assessment, optionally explain why, or undo the disagreement. The original model judgment remains visible. Rule suggestions are user-triggered and use recurring evidence from edit feedback and audit disagreements, with distinct provenance and current rules. Suggestions take effect only after you add them.

There is one working draft per browser, stored under `difflens-draft-v1` in local storage, including the instruction, active review ID, latest revision/result references, and unfinished edit/audit feedback. Reloading restores the review and relevant background checks independently. If storage, review restoration, or auditing fails, the interface preserves the draft and offers recovery actions. Failed audits can be retried without regenerating text.

Standing rules are stored separately under `difflens-rules`. New collections receive four editable scientific defaults covering claim strength and attribution, numbers and units, citations and their associations, and material conditions and limitations. Each permits changes explicitly requested by the author. Existing collections, including intentionally empty ones, stay unchanged.

Revisions and decisions persist in `data/difflens.sqlite`. The history panel shows the latest 20 revisions; an active review can be retrieved by ID even if it is older. This version supports plain text, with no named-document library.

## Revision API

`POST /api/runs` accepts `original`, `instruction`, `rules`, and an optional `selection: { start, end }`. Selection offsets use JavaScript UTF-16 code units and must describe a nonempty range of complete characters containing non-whitespace text. The full document provides model context; only the selected passage is replaced. Unselected text and whitespace at the selection boundaries are preserved exactly. Both saved text snapshots represent the complete document.

`GET /api/runs` returns recent revisions, and `GET /api/runs/:id` restores one revision. `PATCH /api/runs/:id` saves individual or bulk edit decisions and feedback. Invalid edit IDs reject the entire update. Documents and generated results are limited to 30,000 characters; there is no sentence-count limit.

Generation persists and returns the proposal with its audit pending. A single background worker processes queued audits. Pending/running status is durable in SQLite, recovered after restart, and deduplicated. Completion reloads the latest run before saving its audit; monotonically increasing run versions also prevent older polling responses from overwriting decisions or newer attempts in the browser.

- `POST /api/runs/:id/finalize` composes accepted changes, snapshots decisions, and queues a separate final check. Returns `{ run, finalReviewId }`. Identical decisions reuse their existing snapshot; reconsidered decisions preserve successive results.
- `POST /api/runs/:id/audits/:auditId/retry` retries a failed check, without another revision request.
- `PATCH /api/runs/:id/audits/:auditId/feedback` accepts `{ assessmentId, disagreed, text }`. It retains model assessments and separate author feedback.
- `POST /api/rules/infer` accepts `{ rules }` for the current rule collection. It proposes one rule or returns `null` when no recurring preference is supported.

Each assessment receives the full original, target snapshot, instruction, selection boundaries, enabled rules, and diff. Final checks also receive proposal edits and saved review decisions. Structured output is validated for complete edit/rule coverage, instruction assessments, valid outcomes, and all referenced IDs. Refused, incomplete, malformed, or failed responses produce **Check unavailable**, never a clean result. Conflicts and uncertainty are explicit; fidelity checks do not perform external factual verification.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Deterministic tests use mocked model responses and temporary databases for asynchronous completion, retries, restart recovery, finalization, disagreements, selection safety, and persistence. The scientific quality smoke evaluation is separate and makes real API calls using synthetic documents only:

```sh
npm run eval:fidelity
```

It evaluates 12 labeled examples, including hedge removal, number/citation/condition changes, explicit prohibitions, authorized meaning changes, ignored instructions, conflicting rules, over-rejection, and mixed decisions. The report at `data/fidelity-evaluation.json` records model/prompt versions, complete assessments, and revision-level concern detection. This small set is a smoke test, not a calibrated research benchmark.

## Prototype scope

This is a local, single-user prototype. It does not implement authentication, participant-study instrumentation, or edit boundary adjustment. Do not expose the local server publicly. Rule inference uses feedback from the 20 most recent revisions. A revision uses one generation call and one separate proposal assessment; each new final result adds its own assessment. Prompt text, document snapshots, enabled rules, and relevant decisions/feedback are sent to the configured API provider with `store: false`.

Existing revisions without audit metadata remain readable and display **Not checked**. Existing draft data is read with defaults for new optional references; no local-data reset is required.

API calls use explicit developer instructions and a separate user data message. Rule proposals and fidelity assessments use strict JSON Schema through Responses `text.format`; revision generation returns plain text. Refused, incomplete, or empty generation responses are rejected before saving a revision. Audit failures preserve the generated text and all author decisions.
