# Implementation Plan

## Outcome

Deliver the complete Must Have travel-profile loop in roughly 60 to 75 minutes:

- Streamed chat responses
- Structured travel-profile extraction
- JSON persistence across reloads
- Side-by-side read-only profile
- Shared typed client-server contracts
- Hardcoded destination information used in follow-up questions
- Deterministic conflict confirmation with human approval

## Phase 1: Shared foundation

Target: 10 minutes.

- Create a minimal Next.js and TypeScript application.
- Add only the required runtime and test dependencies.
- Define shared domain, API, and SSE contracts.
- Establish server and client module boundaries.
- Add `.env.example` and ignore `.env.local`.
- Verify the initial test, type-check, and build commands.

This phase is sequential because every parallel workstream depends on the same contracts and file layout.

## Phase 2: Parallel workstreams

Target: 25 to 30 minutes.

### Workstream A: Domain and persistence

Exclusive ownership:

- JSON `StateStore` implementation
- Hardcoded destination source and `getDestinationInfo`
- Profile update and conflict guard
- Deterministic conflict resolution
- Focused domain and persistence tests

### Workstream B: Model and chat API

Exclusive ownership:

- OpenAI-compatible `ModelClient`
- Strict analyzer schema and prompt
- Streaming responder prompt
- Two-stage turn orchestration
- SSE encoding and chat route
- Focused model-boundary and SSE tests

### Workstream C: User interface

Exclusive ownership:

- Side-by-side desktop layout
- Chat composer and streamed message rendering
- Read-only structured profile panel
- Initial persisted-state loading
- One-at-a-time Codex-style conflict clarification
- Accept, reject, and free-form controls

## Phase 3: Integration

Target: 15 minutes.

- Add state and conflict-resolution API routes.
- Reconcile any contract mismatches without expanding scope.
- Handle missing configuration and server errors clearly.
- Run tests, type-check, and the production build.
- Fix integration failures before adding polish.

## Phase 4: Acceptance and handoff

Target: 15 to 20 minutes.

- Run the manual acceptance walkthrough from `docs/decisions.md`.
- Fix failures in Must Have behavior.
- Complete the README with setup, architecture, decisions, limitations, and a five-minute walkthrough.
- Update `docs/task-list.md` with final status and deferred work.

## Scope locks

Do not add during the initial build:

- OpenAI Agents SDK
- Multiple conversations or users
- Authentication
- SQLite or a generic repository framework
- Conversation summarization
- Automated live-model evals
- Extensive responsive styling
- Nice-to-have logging unless it is effectively free

If time becomes constrained, reduce visual polish first. Implement deterministic accept and reject before the free-form conflict path, but keep all three in the intended first cut.

## Parallel-work rules

- The primary agent owns scaffolding, shared contracts, dependency files, cross-workstream integration, and final verification.
- Only the primary agent edits `package.json`, shared contracts, README, or planning documents.
- Workstream agents stay within assigned files and communicate needed contract changes instead of editing shared contracts.
- Run the smallest relevant test after each minimum coherent change.
