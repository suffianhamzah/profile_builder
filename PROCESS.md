# Session transcripts
its located in `./transcript.md`

# Prompt highlights
## 1. Architecture review & scope reduction

**Prompt**

> review my design and plan as a senior engineer at a small startup. The requirements for the app is laid out in requirements.md, and my interpretation of the architecture, priorities, assumptions, and risks to completing the Must Have scope within two hours. dont implement anything, prioritize your feedback

**What I was trying to do**

Before writing any code, I wanted to validate the overall architecture and identify the highest-risk parts of the design. My goal was to maximize my chances of delivering the Must Have requirements within the time limit, not build the most extensible system.

**What the tool gave me back (briefly)**

It challenged my initial architecture, recommending that I collapse multiple services into a single Next.js application, remove unnecessary infrastructure, and focus on one complete vertical slice.

**What I kept, changed, or threw away — and why**

I intentionally simplified the architecture by removing FastAPI, multiple agents, SQLite, and evaluation infrastructure. The reduced design significantly lowered integration risk while still meeting the assignment requirements.

---

## 2. Decision log before coding

**Prompt**

> ok thanks, thats a good feeedback. I agree with cutting architecture scope, and focus on whats realistic in the next hour or so. Showing the profile side by side definitely helps with making this work. So conflicts happen if its a semantic or a preference - i think a conflict can arise if its different from the preivous value. Its important that this kicks off a confirmation (require human approval) - since we should let the human decide instead of the AI. As for travel profile, i agree with your take that it shouldnt be leaking private details, since its a travel. As for scope and data flow, lets go through one by one, and record it in docs/decisions.md so that i decide before we build. Then we'll come up with a plan, and parallelize the task since we have limited time.

**What I was trying to do**

I wanted to make the major architectural decisions up front instead of redesigning while implementing. I also wanted a written record of why each decision was made.

**What the tool gave me back (briefly)**

It proposed stepping through each design decision individually, documenting agreed decisions while leaving unresolved questions open until they were discussed.

**What I kept, changed, or threw away — and why**

I kept the decision log approach and delayed implementation until the major architectural questions were answered. This made implementation more focused and reduced backtracking later.

---

## 3. Deterministic conflict handling

**Prompt**

> So conflicts happen if its a semantic or a preference - i think a conflict can arise if its different from the preivous value. Its important that this kicks off a confirmation (require human approval) - since we should let the human decide instead of the AI.

**What I was trying to do**

I wanted profile updates to behave predictably whenever the model extracted information that conflicted with existing profile data.

**What the tool gave me back (briefly)**

It proposed a hybrid approach where the model identifies semantic conflicts, while the server deterministically prevents conflicting updates from being applied without confirmation.

**What I kept, changed, or threw away — and why**

I kept the deterministic confirmation model because I didn't want profile state to depend solely on LLM output. Requiring explicit confirmation made updates predictable and easier to reason about.

---

## 4. Two-stage analyzer/responder architecture

**Prompt**

> yes, this seems like a good idea to keep it simple. We also constraint where one LLM clal is responsible for anaalyzinf the user information. But we'll also need to pass in the conversation messaage / summary to the response creator

**What I was trying to do**

I wanted to separate structured data extraction from conversational response generation so each model call had a single responsibility.

**What the tool gave me back (briefly)**

It proposed a two-stage flow where one model analyzes structured profile updates, deterministic server logic executes them, and a second streamed model call generates the conversational response.

**What I kept, changed, or threw away — and why**

I adopted the two-stage architecture and extended it by ensuring the responder also received conversation history and the updated profile. I preferred having structured extraction happen independently from response generation.

---

## 5. Clarification UX

**Prompt**

> i think this is good - let the user pick and confirm, and aalso provide their own answer. Instead of showing all cards at once on the UI, i would like to keep it styled to how to codex ask for clarifyqing conflicts

**What I was trying to do**

I wanted resolving profile conflicts to feel like a natural conversation instead of interrupting the user with multiple confirmation dialogs.

**What the tool gave me back (briefly)**

It initially proposed rendering every pending conflict as a persistent card above the chat input with explicit accept and reject actions. After I suggested a Codex-inspired interaction, it proposed a queued clarification flow where only the oldest unresolved conflict is surfaced while the rest remain pending.

**What I kept, changed, or threw away — and why**

I threw away the original "multiple cards" UI. Instead, I adopted the queued clarification approach because it better matched the conversational experience I wanted. Users still have deterministic controls ("Use proposed", "Keep current", or provide their own answer), but the interaction feels like a natural dialogue instead of a form with multiple outstanding decisions.

---

## 6. Provider abstraction

**Prompt**

> yes lets keep openrouter since it opens up to using different models to test from, but use the OpenAI API responses so we can swap with different providers if we need to. This eliminiates the risk of needing to update our API should we decide to change providers. ANd yes, lets keep a separate .env file, and yes structured outputs is importaant

**What I was trying to do**

I wanted to use OpenRouter while avoiding tight coupling to a specific model provider.

**What the tool gave me back (briefly)**

It recommended hiding provider-specific details behind a small `ModelClient` abstraction while using an OpenAI-compatible interface.

**What I kept, changed, or threw away — and why**

I kept the abstraction layer and hid provider-specific implementation details behind a small interface. This made it straightforward to switch providers later without affecting the rest of the application.

---

## 7. Agents SDK tradeoff

**Prompt**

> yes lets keep with Chat completions for now, Actuaally how much scope is it to use Agents SDK for the conversation responder? The idea here is extensibility

**What I was trying to do**

I wanted to understand whether introducing the Agents SDK would meaningfully improve the design or simply add implementation complexity.

**What the tool gave me back (briefly)**

It explained how the SDK could fit into the architecture, estimated the integration cost, and recommended deferring it because it would mainly wrap a single streaming model call.

**What I kept, changed, or threw away — and why**

I decided to defer the Agents SDK and instead keep a clean `ModelClient` interface as the extension point. That preserved extensibility without adding unnecessary complexity to the assignment.

---

## 8. Generalizing conflict detection after implementation

**Prompt**

> I noticed during testing that conflict detection is only focusing on dietary preferences. I would like this to be generalized, not focused on dietary restrictions.

**What I was trying to do**

While testing, I noticed conflict detection only worked for dietary preferences. Rather than patching a single case, I wanted to determine whether the abstraction itself should be generalized so any profile field could participate in the same workflow.

**What the tool gave me back (briefly)**

It agreed that conflict detection should operate on profile fields generically, with dietary preferences treated as just one example instead of a special case.

**What I kept, changed, or threw away — and why**

I generalized the conflict model so any profile field could participate in the same confirmation workflow. This removed field-specific logic and produced a more reusable, extensible design rather than solving only the immediate bug.

# Reflections

## Overall approach

1. I began by reading the assignment and writing my initial interpretation in `requirements.md` without agent assistance. I intentionally left those notes unpolished to preserve my original thought process.
2. I then used Codex as a coding assistant, first asking it to review my requirements and identify what was and was not feasible within the time limit. That review exposed scope creep in my initial architecture and helped me clarify my priorities. I worked through the major decisions with the agent and recorded them in `docs/decisions.md`, along with separate planning and task-tracking documents. For the initial implementation, I used subagents within one Codex session to parallelize independent workstreams.
3. I stayed in tight control of scope and architectural decisions while allowing the agent to drive much of the implementation. For verification, I asked it to use the `web-browser` skill in addition to the unit tests so that I could exercise the application as a user would.
4. I progressively tested the application against the requirements, fixed several functional and product-experience issues, and then documented the result. I stopped further refinement as I approached the end of the two-hour limit.

## Time breakdown
I used ~3hours and here's the breakdown
1. 20 minutes of writing `requirements.md`
2. ~2 hours of planning, implementing, and validating the application
3. 40 minutes of writing `PROCESS.md`, and ensuring the repo is updated well.

## What I reviewed by hand vs. what I trusted

1. I reviewed the core two-stage model flow, its prompts, the conflict-resolution logic, and the profile-update code line by line because those areas controlled the application's most important behavior.
2. I skimmed the remaining code, including the shared interfaces, frontend, API routes, and persistence layer. I relied on focused tests and browser verification more heavily than line-by-line review in those areas.
3. I delegated most of the initial UI implementation to the model. I verified its behavior manually in the browser, but I did not inspect every line of the resulting component and CSS code before shipping it.

## What I would do differently next time

1. I would spend less time designing the data model and architecture alone and use AI as a thought partner earlier. I spent roughly 20 minutes writing `requirements.md` before asking for feedback, and an earlier review would have exposed the unnecessary complexity sooner.
2. I would prioritize a working end-to-end path earlier. The core model loop, product experience, and correctness mattered more for this assignment than a highly extensible architecture. I would still keep focused tests around deterministic behavior, but I would begin browser-based end-to-end testing sooner instead of waiting until most of the system was implemented.

## If I had to run it at scale

1. I would keep the two-stage separation between analysis and response generation, but make each stage independently configurable, measurable, and deployable.
2. I would evaluate different models for the two stages. The analyzer should be optimized for extraction accuracy, schema adherence, conflict detection, latency, and cost. The response generator should be optimized for conversational quality and streaming performance. I would benchmark candidate models on representative traffic rather than assume that one model is best for both stages. An LLM gateway could also provide model or provider fallback when the primary request fails.
3. I would version the prompts and extraction schema, keep the schema narrow, and introduce changes through backward-compatible migrations. I would also define retry and fallback behavior for invalid structured output instead of treating every model failure the same way.
4. I would build multi-turn evaluations from anonymized production traces and synthetic scenarios. The suite would measure whether the conversation achieves the user's intent, using metrics such as extraction accuracy, schema-valid response rate, conflict precision and recall, destination hallucination rate, and useful follow-up rate. Results would be segmented by model version, prompt version, schema version, and scenario type. Prompt or model changes would have to pass the evaluation suite before being rolled out gradually.
5. To support 10,000 requests per hour, I would replace file persistence with a production database, add authentication, rate limiting, observability, request tracing, and queueing or backpressure where needed. I would also track per-stage latency, token usage, cost, and failure rates so capacity and model-routing decisions could be based on production data.
