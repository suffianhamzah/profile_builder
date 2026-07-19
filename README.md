# Atlas Travel Profile Builder

A small single-user application that builds a durable travel profile through conversation. The chat streams assistant responses while a read-only profile remains visible beside it. Profile changes are persisted locally, and conflicting changes require explicit human confirmation.

## Run locally

Requirements: Node.js 20.9 or newer and an OpenRouter API key.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Configure `.env.local`:

```text
MODEL_API_KEY=your-openrouter-key
MODEL_BASE_URL=https://openrouter.ai/api/v1
MODEL_NAME=a-model-that-supports-json-schema-structured-outputs
STATE_FILE_PATH=./data/state.json
```

Open [http://localhost:3000](http://localhost:3000). Never prefix the API key with `NEXT_PUBLIC_`; model calls run only on the server.

## Verify

```bash
npm test
npm run typecheck
npm run build
```

## Five-minute walkthrough

1. Start with an empty profile and say, “I prefer relaxed trips, local food, and boutique hotels.”
2. Watch the assistant response stream and the structured profile update beside it.
3. Mention a supported destination and verify that the assistant asks a follow-up using the hardcoded seasonal, activity, or budget information.
4. Mention an unsupported destination and verify that the assistant says destination facts are unavailable rather than inventing them.
5. Contradict a stored preference. Confirm that the original remains unchanged and an inline clarification offers the proposed value, current value, and a free-form answer.
6. Resolve the clarification and confirm that Atlas acknowledges the saved choice before asking one next question. Reload and confirm that the profile, chat, and unresolved conflicts persist.

## Architecture

The implementation is one Next.js and TypeScript application. Client and server share the contracts in `src/lib/contracts.ts`.

Each chat turn has three steps:

1. A non-streaming analyzer call returns validated structured profile operations, semantic conflict proposals, and destination mentions.
2. Application code calls `getDestinationInfo`, applies safe changes, and turns conflicting changes into pending confirmations without overwriting existing values.
3. A separate responder call receives the resulting profile, recent conversation, pending conflicts, and exact destination results. Its text is streamed to the browser as typed SSE events.

The analyzer is the only model component allowed to propose structured changes. The responder cannot write the profile or run tools. The conflict card is rendered from persisted application state, so confirmation does not depend on the responder remembering to mention it.

Accepting or rejecting a conflict is applied deterministically without another analyzer call. The selected preference is persisted and rendered as a user message, then the server streams a responder-only confirmation using the saved profile and resolved conflict as authoritative context. Progressive profile collection continues with at most one question.

`JsonStateStore` persists one `AppState` containing the profile, conversation, and pending conflicts. Its narrow interface leaves room for a later SQLite implementation without adding database abstractions now.

## Deliberate scope cuts

- One local user and one conversation
- JSON file persistence rather than a database
- No authentication or chat-history navigation
- No conversation summarization; model context is limited to the latest 20 messages
- No Agents SDK until the responder needs tools, handoffs, or other agentic behavior
- No automated live-model evals; deterministic behavior has unit tests and model behavior has a manual walkthrough

JSON persistence is designed for this local demonstration, not serverless deployment, concurrent processes, or multiple users.

Detailed product and architecture choices are recorded in [`docs/decisions.md`](docs/decisions.md). The implementation sequence is in [`docs/plan.md`](docs/plan.md), and live progress is tracked in [`docs/task-list.md`](docs/task-list.md).
