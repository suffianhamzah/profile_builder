# Implementation Task List

Updated as implementation progresses. Status values are `pending`, `in progress`, `blocked`, and `complete`.

## Foundation

- [x] **complete** — Create the Next.js and TypeScript scaffold.
- [x] **complete** — Add minimal runtime and test dependencies.
- [x] **complete** — Define shared domain, API, conflict, and SSE contracts.
- [x] **complete** — Add `.env.example` and ignore `.env.local` and persisted runtime data.
- [x] **complete** — Verify the empty application test, type-check, and build commands.

## Domain and persistence

- [x] **complete** — Implement the `StateStore` boundary and atomic JSON storage.
- [x] **complete** — Implement default application state and single-conversation persistence.
- [x] **complete** — Implement five or more hardcoded destinations and `getDestinationInfo`.
- [x] **complete** — Implement safe profile merging and list deduplication.
- [x] **complete** — Implement pending-conflict creation without automatic overwrite.
- [x] **complete** — Implement accept and reject conflict resolution.
- [x] **complete** — Test destination, profile, conflict, and persistence behavior.

## Model and orchestration

- [x] **complete** — Implement the OpenAI-compatible Chat Completions client.
- [x] **complete** — Implement and validate strict structured analyzer output.
- [x] **complete** — Implement destination enrichment for detected names.
- [x] **complete** — Implement the responder with recent messages, profile, conflicts, and tool results.
- [x] **complete** — Guide the responder to collect one high-value missing profile detail at a time.
- [x] **complete** — Implement the two-stage turn orchestration.
- [x] **complete** — Implement and test SSE framing.
- [x] **complete** — Implement the streamed chat route.

## User interface

- [x] **complete** — Implement the side-by-side chat and profile layout.
- [x] **complete** — Load and display persisted state.
- [x] **complete** — Render streamed assistant deltas.
- [x] **complete** — Render structured profile fields read-only.
- [x] **complete** — Show only the oldest pending conflict as an inline clarification.
- [x] **complete** — Implement proposed-value and current-value actions.
- [x] **complete** — Stream a persisted confirmation and next question after deterministic conflict resolution.
- [x] **complete** — Implement the free-form clarification path.
- [x] **complete** — Show loading and error states.

## Integration and verification

- [x] **complete** — Implement the state-loading route.
- [x] **complete** — Implement the deterministic conflict-resolution route.
- [x] **complete** — Run the full unit test suite.
- [x] **complete** — Run TypeScript checks and the production build.
- [x] **complete** — Exercise the manual acceptance walkthrough.
- [x] **complete** — Complete the README five-minute walkthrough.
- [x] **complete** — Record final limitations and deferred work.

## Verification log

- **Automated:** 33 tests across nine files pass.
- **Static:** TypeScript checks pass.
- **Build:** Next.js production build passes with all expected routes.
- **Dependency audit:** No high or critical findings; npm reports two moderate findings through Next.js's nested PostCSS version.
- **Browser:** Verified initial empty state, SSE chat streaming, structured profile updates, reload persistence, known Tokyo lookup, unknown Atlantis fallback, scalar conflict handling, and semantic vegetarian/steakhouse conflict handling.
- **Browser fixes:** Added current-turn-only destination filtering, generalized semantic conflict instructions with a field-level application guard, deterministic explicit custom resolution, authoritative pending-conflict responder context, and an application icon after browser verification exposed gaps.
- **Handoff state:** Browser-test state was moved out of the repository so manual testing starts from an empty profile.
