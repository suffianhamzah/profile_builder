# Product and Architecture Decisions

This document records decisions made before implementation. The target is a working Must Have scope within roughly one hour of build time.

## Decided

### D1. Optimize for one complete core loop

**Decision:** Cut architecture and product scope until one end-to-end loop is reliable: chat, structured profile extraction, persistence, destination lookup, conflict confirmation, and a read-only profile view.

**Reasoning:** Correct Must Have behavior is more valuable than incomplete supporting features under the time constraint.

### D2. Show chat and profile side by side

**Decision:** Use a desktop split view with chat on one side and the current read-only travel profile on the other.

**Reasoning:** The user can immediately see what the assistant learned without navigating away from the conversation. A dedicated profile page and chat-history UI are unnecessary for the core loop.

### D3. Collect travel-relevant information only

**Decision:** Do not ask for a full address, age, or occupation. The profile should contain only information that directly improves travel recommendations. All progressively collected fields are optional.

**Reasoning:** Avoid unnecessary private data and avoid using weak proxies, such as age for preferred travel pace.

### D4. Require human approval for conflicting changes

**Decision:** A newly inferred preference that differs from an existing value is a proposed change, not an automatic overwrite. Preserve the existing value, surface the conflict, and ask the user to confirm whether the proposed value should replace it.

**Reasoning:** The human owns the profile. The model may identify a potential semantic conflict, but it must not resolve that conflict on the user's behalf.

**Initial behavior:**

1. The model proposes a structured profile change.
2. Server-side code compares the proposal with the stored profile.
3. Non-conflicting additions are saved.
4. Conflicting replacements remain pending and are shown in both the assistant response and a deterministic UI notice.
5. Only explicit user confirmation applies the replacement.

### D5. Use one Next.js application

**Decision:** Implement the UI and server-side API routes in a single Next.js and TypeScript application. Share TypeScript contracts between the client and server. Keep model credentials, tool execution, and persistence server-side.

**Reasoning:** One application removes the FastAPI integration boundary, avoids cross-language contract drift and CORS setup, and makes the required typed client-server contract straightforward.

**Explicit cuts:** Do not add FastAPI, a separate Python service, the OpenAI Agents SDK, or separate orchestrator and profile-saver services.

### D6. Start with a small, travel-specific profile

**Decision:** Use the following initial profile shape. All scalar fields are optional and all collection fields default to empty arrays.

```ts
type Season = "spring" | "summer" | "fall" | "winter";

type TravelProfile = {
  budgetStyle?: "budget" | "midRange" | "luxury";
  travelPace?: "relaxed" | "balanced" | "packed";
  wishlist: string[];
  visitedDestinations: string[];
  interests: string[];
  preferredSeasons: Season[];
  dietaryPreferences: string[];
  accommodationPreferences: string[];
  additionalPreferences: string[];
};
```

**Update semantics:**

- A new value for an already populated scalar field is a conflict.
- New collection values are additive and deduplicated.
- Removing or semantically contradicting an existing collection value is a conflict.
- The first contradictory message creates a pending proposal and does not modify the stored profile.
- Name, age, occupation, full address, and personal visa information are excluded from the initial profile.

**Reasoning:** These fields directly improve destination recommendations without collecting unnecessary personal information. The schema is intentionally extensible after the base workflow works.

### D7. Enforce conflict confirmation outside the model

**Decision:** Conflict confirmation is a deterministic application behavior, not solely an LLM instruction. When the profile update guard rejects a proposed change, the server emits a typed conflict payload and the client renders a confirmation prompt independently of the assistant's text.

**Reasoning:** The model may omit a requested confirmation from its prose. A server guard and explicit UI state guarantee that the conflict remains visible and that stored data is not overwritten without human approval.

**Testing implication:** Include a focused test proving that a conflicting proposal leaves the original value unchanged and returns a pending conflict for the UI.

### D8. Persist one application state in JSON behind a thin interface

**Decision:** Persist a single user's profile, conversation messages, and pending conflicts in one server-side JSON file.

```ts
type PersistedState = {
  profile: TravelProfile;
  messages: ChatMessage[];
  pendingConflicts: ProfileConflict[];
};
```

Use a minimal persistence boundary:

```ts
interface StateStore {
  load(): Promise<PersistedState>;
  save(state: PersistedState): Promise<void>;
}
```

The initial implementation provides only `JsonStateStore`. It should write safely using a temporary file followed by a rename so an interrupted write does not leave invalid JSON.

**Reasoning:** A JSON file is sufficient for the single-user local demonstration and preserves a coherent profile, chat, and confirmation state across reloads. The narrow interface leaves a seam for SQLite later without introducing repositories, factories, or database-specific abstractions now.

**Explicit limitations:** This persistence is not intended for serverless deployment, concurrent processes, authentication, multiple users, or multiple conversations. Document those limitations in the README.

### D9. Use a two-stage model turn with one analysis owner

**Decision:** Process each user turn in two model stages with deterministic application work between them.

1. **Analyze, non-streaming:** One analyzer call is solely responsible for interpreting the latest user message into structured profile operations, possible semantic conflicts, and mentioned destination names. It does not produce user-facing prose.
2. **Execute in application code:** Validate the analyzer output, call `getDestinationInfo` for every mentioned destination, apply safe profile changes, and create pending conflicts for rejected changes.
3. **Respond, streaming:** A responder call receives the computed results and streams warm conversational text. It cannot propose or persist additional profile changes and cannot call tools.

**Analyzer context:** Supply the latest user message, current profile, unresolved conflicts, and a small window of recent messages when needed for references such as "there" or "that trip."

**Responder context:** Supply a bounded window of persisted conversation messages, the current profile after safe updates, unresolved conflicts, and the exact destination-tool results from the current turn. The responder must treat an unknown destination result as unavailable and must not invent destination facts.

**Initial context policy:** Persist the full conversation but send only the most recent 20 messages to model calls. Do not add conversation summarization in the initial build; the durable structured profile carries the important long-term user preferences.

**Reasoning:** Separating interpretation from response generation gives one component ownership of profile extraction, keeps tool execution deterministic, and makes the streamed responder simpler. Two model calls add latency and cost but are acceptable for the local demonstration.

**Known limitation:** The application can guarantee that an identified conflict requires confirmation, but it cannot deterministically recognize every natural-language semantic contradiction. Test the analyzer prompt against the required examples and test the application guard independently with fixed structured inputs.

### D10. Stream typed events using SSE framing

**Decision:** `POST /api/chat` accepts a typed JSON request and returns a streamed response using Server-Sent Events framing with the `text/event-stream` content type. Because the request is a `POST`, the client uses `fetch()` and reads the response stream rather than using the GET-only browser `EventSource` API.

```ts
type ChatRequest = {
  message: string;
};

type ChatEvent =
  | {
      type: "user.message.created";
      userMessage: ChatMessage;
    }
  | {
      type: "state.updated";
      profile: TravelProfile;
      pendingConflicts: ProfileConflict[];
    }
  | {
      type: "assistant.delta";
      text: string;
    }
  | {
      type: "turn.completed";
      assistantMessage: ChatMessage;
    }
  | {
      type: "error";
      message: string;
    };
```

Request, response, and event contracts live in `src/lib/api-contracts.ts`, imported by both server routes and React components. Their durable payload types come from `src/lib/domain.ts`.

Both streaming routes use the same server-side SSE response builder, and both browser actions use the same incremental SSE parser. This keeps framing, headers, stream errors, and chunk-boundary behavior consistent.

**Event order:**

1. Analyze the user turn and execute deterministic profile and destination operations.
2. Emit `state.updated` so accepted changes and pending conflicts become visible.
3. Emit one or more `assistant.delta` events from the responder model.
4. Persist the complete assistant message.
5. Emit `turn.completed`.

`GET /api/state` returns the `PersistedState` snapshot on initial page load.

**Reasoning:** SSE is a conventional and reviewer-friendly streaming format, supports named event types, and needs no additional client dependency.

### D11. Resolve conflicts through one queued clarification at a time

**Decision:** Persist every pending conflict, but show only the oldest unresolved conflict in a Codex-style inline clarification panel near the chat composer. After it is resolved, show the next pending conflict.

While a clarification is visible, the main message composer becomes the single place to provide a custom answer and automatically targets that conflict. The application disables unrelated starter actions and does not render a second input inside the clarification panel. If the analyzer cannot apply the answer, the server keeps the conflict pending and returns deterministic clarification copy instead of allowing the responder to imply that the profile changed.

When a turn creates a conflict, the server also skips the general responder call. It persists one deterministic assistant message directing attention to the clarification UI, then focuses the composer when the turn finishes. This keeps the assistant response, pending state, and available action synchronized.

When a typed custom answer resolves the conflict, the responder receives explicit transient context identifying it as a completed custom resolution. This lets it acknowledge the newly applied profile value without mistaking the post-update snapshot for a value that was already present.

The panel displays the affected field, current value, proposed value, and short reason, with three response paths:

- **Use proposed value:** Apply the proposed change and remove the conflict.
- **Keep current value:** Leave the profile unchanged and remove the conflict.
- **Provide another answer:** Submit free-form clarification through the chat flow with the pending conflict ID attached.

```ts
type ResolveConflictRequest =
  | { decision: "accept" }
  | { decision: "reject" };
```

`POST /api/conflicts/:id/resolve` applies the two button choices deterministically without rerunning the analyzer. The selected current or proposed value is first persisted as a user message and emitted as `user.message.created`. The server then streams a responder-only turn that confirms what was kept or changed and continues with one useful follow-up question. The resolved conflict is passed as explicit context, and the resulting assistant message is persisted.

A free-form answer uses `POST /api/chat` with an optional `resolvingConflictId`. The analyzer receives that conflict as explicit context. If its structured result clearly resolves the targeted field, the server applies the human-provided resolution and removes the conflict. If the answer remains ambiguous or changes another field, the original conflict stays pending.

**Guardrails:**

- The model cannot dismiss or overwrite a conflict directly.
- The current persisted `pendingConflicts` list is authoritative; old conversation text cannot make the responder claim that a resolved conflict is still pending.
- Chat remains usable while a conflict is pending.
- Unresolved conflicts survive reloads.
- The responder should acknowledge a conflict, but the inline clarification panel is the guaranteed interaction.
- Pending conflicts are queued in creation order rather than displayed all at once.

**Reasoning:** A single focused question is calmer and easier to answer than a stack of conflict cards. Free-form clarification preserves user control without forcing every preference into a binary choice. Streaming a responder-only turn after a deterministic button choice closes the conversational loop without asking the analyzer to reinterpret a decision the application already understands.

### D12. Test deterministic behavior and manually verify model behavior

**Decision:** Keep the automated suite focused on deterministic behavior:

1. Destination lookup for known names, normalized names, and unknown destinations
2. Safe profile merging and list deduplication
3. Conflict creation without overwriting the stored value
4. Accept, reject, and ambiguous free-form conflict resolution behavior
5. JSON state save and load round trips
6. SSE event framing and parsing

Use a short manual acceptance walkthrough for the model-dependent behavior:

1. State a preference and see it appear in the profile.
2. Reload and confirm that the chat and profile remain.
3. Mention a supported destination and verify that the response uses its hardcoded tool data.
4. Mention an unsupported destination and verify that the response does not invent facts.
5. Contradict an existing preference and verify that the inline clarification appears even if the assistant prose omits it.
6. Exercise proposed, current, and free-form conflict resolution paths.

**Reasoning:** Automated live-model tests would be nondeterministic and consume disproportionate time. Unit tests prove the application guardrails, while the manual walkthrough checks the analyzer's actual semantic behavior.

### D13. Configure the model provider externally and require structured analysis

**Decision:** Use OpenRouter as the initial model gateway so different compatible models can be tested without changing application code. Keep the application isolated from provider details behind a small model boundary:

```ts
interface ModelClient {
  analyzeTurn(input: AnalyzeTurnInput): Promise<TurnAnalysis>;
  streamResponse(input: RespondToTurnInput): AsyncIterable<string>;
}
```

The analyzer must request strict JSON-schema structured output, and the application must validate the parsed result before applying any operation. The configured model must support structured outputs.

Use provider-neutral environment names:

```text
MODEL_API_KEY=...
MODEL_BASE_URL=https://openrouter.ai/api/v1
MODEL_NAME=...
```

Store real local values in an ignored `.env.local` file and commit only a `.env.example` template. Never expose the API key through a `NEXT_PUBLIC_` variable.

**Reasoning:** Provider configuration and model choice should not leak into profile, orchestration, or UI code. The two-method boundary is enough to replace the model client later without building a generic provider framework.

**API surface:** Use the stable OpenAI-compatible Chat Completions interface through the `openai` TypeScript package. Do not initially target OpenRouter's OpenAI-compatible Responses endpoint because OpenRouter currently labels that endpoint beta.

### D14. Defer the OpenAI Agents SDK until the responder is agentic

**Decision:** Use the plain OpenAI-compatible client for both the analyzer and responder in the initial build. Do not add the OpenAI Agents SDK yet.

**Reasoning:** The responder currently performs one tool-free streaming model call. It has no handoffs, tools, profile-writing authority, or approval execution, so an agent run loop would add provider, streaming, tracing, and lifecycle integration without improving the Must Have behavior.

The `ModelClient.streamResponse` boundary is the extension seam. An Agents SDK implementation can replace it later without changing the orchestration, API routes, SSE contract, or UI.

**Revisit when:** The responder gains a concrete need for tools, handoffs, model guardrails, agent-managed approvals, or tracing across multi-step runs.

### D15. Build through a short foundation followed by bounded parallel work

**Decision:** Follow the time-boxed implementation plan in [`docs/plan.md`](./plan.md) and track work in [`docs/task-list.md`](./task-list.md). Establish the application scaffold and shared contracts first, then run three parallel workstreams with exclusive file ownership for domain persistence, model orchestration, and UI work.

**Reasoning:** A short sequential foundation prevents agents from inventing incompatible contracts. File-level ownership lets independent work proceed concurrently without creating avoidable merge conflicts.

**Progress policy:** Update the task list at workstream boundaries and after verification. Ask for clarification only when a missing choice would materially change agreed behavior or require additional authority.

### D16. Collect profile detail through one focused follow-up

**Decision:** The responder should normally end with at most one short, easy-to-answer follow-up. Pending conflict resolution takes precedence over collecting new information. Otherwise, it should ask for the highest-value missing detail in this order: destination, interests, travel pace, budget style, accommodation, then season. Dietary preferences should only be requested when food or dining is already relevant.

The responder must not list missing fields, repeat a recently asked question, or force a follow-up when the profile is already sufficient for the current conversation.

**Reasoning:** Progressive collection keeps the conversation useful without making profile setup feel like a form. A stable priority gives the model a clear call to action while preserving room for a natural, destination-aware question.

### D17. Separate durable domain, wire, and transient model types

**Decision:** Organize types by lifecycle rather than keeping every shape in one contracts file:

- `src/lib/domain.ts` owns durable business objects, including `TravelProfile`, `ChatMessage`, `ProfileConflict`, `ProfileOperation`, and the complete `PersistedState` JSON snapshot. It also contains stable destination reference data types.
- `src/lib/api-contracts.ts` owns only browser/server wire shapes: requests, JSON responses, SSE events, and API errors.
- `src/server/model-analysis.ts` owns transient analyzer proposals and results derived from the Zod structured-output schema.
- `src/server/destinations.ts` owns the transient destination lookup result passed between orchestration and the responder.

**Reasoning:** File location and type names should answer whether a value is durable, crosses an API boundary, or exists only during one server turn. Keeping transient model output out of shared client contracts also reduces accidental coupling between model implementation details and the UI.

## Open decisions

No blocking product or architecture decisions remain for the initial build.
