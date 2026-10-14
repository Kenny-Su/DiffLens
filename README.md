# DiffLens

A plain-text editor that generates revisions, lets you accept, reject, or manually rewrite proposed passages, and checks fidelity to your original instruction. Both model proposals and the author's assembled result are assessed: accepting a problematic change or rejecting a requested change can leave a concern. Built with React, TypeScript, Vite, Fastify, and SQLite (Node's built-in SQLite module).

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
2. To revise a passage, select it and click **Revise selection** beside the text (or press **Alt+Enter**). Enter an instruction in the floating box and press **Send**. To revise the whole document, hover over **Revise** in the bottom-right corner to expand the floating instruction input, or click it on touch devices and with a keyboard. The input stays open while you type; Escape or clicking outside closes it. Standing rules are available through its settings icon. Both instruction boxes autosave the same unsent instruction. Successful submission clears it; failed requests preserve it for retry. Using or reopening a saved revision does not repopulate the input with its historical instruction. Opening either input does not change the draft.
3. Generate suggestions. The review highlights each changed sentence, then deletes and inserts characters within it before moving to the next sentence and settling on the proposal. Related sentence splits and merges play as a group. The default playback speed is 1×, with a pause before each sentence and readable character timing; Unicode graphemes such as emoji remain intact. Pause, change playback speed, finish the animation, replay the document or a selected passage, or switch between original and proposed text. Reduced-motion users skip character animation while retaining audit breakpoints. Playback waits for the proposal audit and pauses before an unresolved sentence with a linked fidelity concern. The breakpoint shows its reason and the passage controls. Accepting, rejecting, or applying edited text saves the passage decision before playback continues; a failed save keeps it paused. Rejections retain the original, and manual replacements are used in subsequent playback. Decisions apply to the whole passage, including grouped splits and merges. Finish animation stops at the next unresolved concern. Failed audits offer retry or explicit continuation without an audit. Playback itself does not apply decisions. Select a passage to open its original text and an editable proposal beneath the paragraph. **Accept** applies the proposal, **Reject** keeps the original, and typing changes the apply action to **Use edited text**. Changes are presented through transformation playback rather than a static diff. The rest of the document stays read-only during review.
4. Review while **Proposal fidelity** runs in the background. Amber markers identify passages linked to findings; selecting one shows the explanation. Findings concern the original model proposal, not a manual rewrite. **Accept remaining** includes flagged passages. **Show resolved** exposes completed decisions and undo; flagged resolved passages remain selectable. Undoing a manual replacement restores it as an unapplied draft.
5. Manual typing autosaves locally without applying the decision. Close the inspector, navigate, or reload without losing it. **Reset to proposal** restores the model wording. Returning to writing or using a bulk action opens the first unapplied edit for resolution. Once resolved, **Return to writing** saves accepted passages and manual replacements; untouched pending and rejected changes retain the original wording. It checks that result against the original instruction and rules while you continue writing. This includes mistakes introduced by manual rewriting, requests left unmet by over-rejection, and problems from combining decisions. The footer links to the check. If you edit the draft, the status says **Earlier revision** and opens the saved snapshot, never annotating or replacing newer writing. **Revisit review** restores saved decisions, with confirmation before replacing a different draft.
6. Open **History** to preview a saved revision without replacing the draft. **Use result** explicitly replaces the working draft. Both replacement and starting a new draft protect existing writing with a confirmation.
7. During review, **Copy reviewed text** and **Download reviewed text** use committed decisions, not pending proposals or unapplied typing. JSON exports include passage boundaries, the immutable model proposal, applied author replacements, rule snapshots, assessments, successive results, decisions, and feedback.
8. Disagree with any mistaken assessment, optionally explain why, or undo the disagreement. The original model judgment remains visible. Rule suggestions are user-triggered and use recurring evidence from passage/edit feedback and audit disagreements, with distinct provenance and current rules. Manual replacements provide context but are not treated as expressed preferences by themselves. Suggestions take effect only after you add them.

There is one working draft per browser, stored under `difflens-draft-v1` in local storage, including the instruction, active review ID, latest revision/result references, unfinished passage/edit/audit feedback, and unapplied manual text keyed by run and passage. Reloading restores the review and relevant background checks independently. If storage, review restoration, or auditing fails, the interface preserves the draft and offers recovery actions. Failed audits can be retried without regenerating text.

Standing rules are stored separately under `difflens-rules`. New collections receive four editable scientific defaults covering claim strength and attribution, numbers and units, citations and their associations, and material conditions and limitations. Each permits changes explicitly requested by the author. Existing collections, including intentionally empty ones, stay unchanged.

Revisions and decisions persist in `data/difflens.sqlite`. The history panel shows the latest 20 revisions; an active review can be retrieved by ID even if it is older. This version supports plain text, with no named-document library.

## Revision API

`POST /api/runs` accepts `original`, `instruction`, `rules`, and an optional `selection: { start, end }`. Selection offsets use JavaScript UTF-16 code units and must describe a nonempty range of complete characters containing non-whitespace text. The full document provides model context; only the selected passage is replaced. Unselected text and whitespace at the selection boundaries are preserved exactly. Both saved text snapshots represent the complete document.

`GET /api/runs` returns recent revisions, and `GET /api/runs/:id` restores one revision. Runs store immutable `passages` with source/target ranges and member word-edit IDs, plus separate `passageReviews` for manual replacements and feedback. Sentence/paragraph boundaries are aligned through unchanged spans, with conservative merging for splits, merges, and abbreviations. Unchanged boundary whitespace remains outside editable passages. Selection boundaries are hard limits. Groups are persisted once; existing revisions receive additive metadata without changing saved decisions or audit IDs.

`PATCH /api/runs/:id` accepts exactly one of:

- `{ passages: [{ id, decision, feedback, replacementText? }] }`: apply whole-passage decisions atomically. Replacement text is allowed only with `accepted`; an empty string deletes the passage. Omitting it uses the model proposal. Reject/undo clear the applied replacement.
- `{ edits: [{ id, decision, feedback }] }`: legacy fine-grained updates. They cannot change decisions beneath a manual replacement; feedback-only updates remain allowed.
- `{ restoreFinalReviewId }`: restore a saved decision/manual-replacement snapshot.

`PATCH /api/runs/:id/passages/:passageId/feedback` accepts `{ feedback }` without changing decisions or manual text. Invalid IDs, duplicate IDs, mixed update formats, or oversized assembled results reject the entire update. Documents, generated proposals, and composed results are limited to 30,000 characters; there is no sentence-count limit. Legacy mixed decisions remain partially reviewed until the author chooses a whole-passage decision.

Generation persists and returns the proposal with its audit pending. A single background worker processes queued audits. Pending/running status is durable in SQLite, recovered after restart, and deduplicated. Completion reloads the latest run before saving its audit; monotonically increasing run versions also prevent older polling responses from overwriting decisions or newer attempts in the browser.

- `POST /api/runs/:id/finalize` composes accepted changes, snapshots decisions, and queues a separate final check. Returns `{ run, finalReviewId }`. Identical decisions and applied manual text reuse their existing snapshot; different manual replacements or reconsidered decisions preserve successive results.
- `POST /api/runs/:id/audits/:auditId/retry` retries a failed check, without another revision request.
- `PATCH /api/runs/:id/audits/:auditId/feedback` accepts `{ assessmentId, disagreed, text }`. It retains model assessments and separate author feedback.
- `POST /api/rules/infer` accepts `{ rules }` for the current rule collection. It proposes one rule or returns `null` when no recurring preference is supported.

Each assessment receives the full original, target snapshot, instruction, selection boundaries, enabled rules, and diff. Final checks also receive proposal edits, saved decisions, and author replacements as distinct contributions. Each final result gets a fresh exact diff against the original. Structured output is validated for complete edit/rule coverage, instruction assessments, valid outcomes, and all referenced IDs. Refused, incomplete, malformed, or failed responses produce **Check unavailable**, never a clean result. Conflicts and uncertainty are explicit; fidelity checks do not perform external factual verification.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Deterministic tests use mocked model responses and temporary databases for asynchronous completion, retries, restart recovery, finalization, disagreements, passage grouping, manual replacements, selection safety, local draft guards, and persistence. Randomized alignment cases check exact reconstruction; browser checks use an isolated mocked server. The scientific quality smoke evaluation is separate and makes real API calls using synthetic documents only:

```sh
npm run eval:fidelity
```

It evaluates 14 labeled examples, including hedge removal, number/citation/condition changes, explicit prohibitions, authorized meaning changes, ignored instructions, conflicting rules, over-rejection, mixed decisions, manual claim strengthening, and manual corrections. The report at `data/fidelity-evaluation.json` records model/prompt versions, complete assessments, and revision-level concern detection. This small set is a smoke test, not a calibrated research benchmark.

## Prototype scope

This is a local, single-user prototype. It does not implement authentication, participant-study instrumentation, or edit boundary adjustment. Do not expose the local server publicly. Rule inference uses feedback from the 20 most recent revisions. A revision uses one generation call and one separate proposal assessment; each new final result adds its own assessment. Prompt text, document snapshots, enabled rules, and relevant decisions/feedback are sent to the configured API provider with `store: false`.

Existing revisions without audit metadata remain readable and display **Not checked**. Existing draft data is read with defaults for new optional references; no local-data reset is required.

API calls use explicit developer instructions and a separate user data message. Rule proposals and fidelity assessments use strict JSON Schema through Responses `text.format`; revision generation returns plain text. Refused, incomplete, or empty generation responses are rejected before saving a revision. Audit failures preserve the generated text and all author decisions.
