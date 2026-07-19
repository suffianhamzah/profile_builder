# Profile Builder
- SPA that helps traver create a durable traaavel profile through conversation
- Chat UI where the usr taks to the assitant about travel preferences
- Conversation progresses, the assistant extracts structured fields and build a profile
- Read only view of the UI that lists the current travel preferences
- Side Panel, section below the chat, separate page (up to you)
- Profile persists across Reloads

# Requirements
# Must Have
- Working Chat UI with streaamed responses
- Structured Profile data from conversation
- Profile must be persisted (SQLITE, JSON file, Vercel KV)
- Read only UI view that listt current travel preferences
- TYPED contract between client and server
- Destination tool for app calls. `getDestinationInfo` and use result to ask informed follow-up qs
```
async function getDestinationInfo(name: string): Promise<DestinationInfo | null>

type DestinationInfo = {
  name: string;
  bestSeasons: Array<'spring' | 'summer' | 'fall' | 'winter'>;
  knownFor: string[]; // e.g., ["food", "architecture", "hiking"]
  averageDailyBudgetUSD: { budget: number; midRange: number; luxury: number };
  visaNotes?: string;
};

# Hardcode at least 5 destinations - returns null for unknown distination
Hardcode data for at least 5 destinations of your choosing. Return null for unknown destinations — and make sure your agent does something sensible with that case rather than hallucinating. Feel free to extend the schema if it makes the conversation richer; just keep the function name and the existing fields.

Native LLM tool-calling is welcome but not required. An explicit orchestration step (detect the destination in app code, call the function, inject the result back into the prompt) is also fine if you can defend it.
```
- `Conflict Detection` When new conversation contradicts an already-extracted profile field (e.g., the user said "vegetarian" earlier, now mentions a steakhouse), the agent must surface the contradiction rather than silently overwriting. How you surface it — ask the user, flag it in the UI, propose a resolution — is your call.
- README.md - 5 minutes and walks us through your decisions.

# Nice to have
- Structured logs for LLM calls and tool calls (model, latency, token counts, request IDs). JSON to stdout is fine.
- Live updates to the profile view as the conversation progresses (vs. only after the turn completes).
- Handling for the assistant changing its mind or correcting earlier extractions.
- Anything else that shows judgment about the experience.

# Out of scope
- Authentication, accounts, or any notion of multiple users; assume one user.
- Real travel data or third-party travel APIs; getDestinationInfo is the only source of truth.
- Mobile or responsive polish. Desktop only; "doesn't break at smaller widths" is plenty.
- Bookings, payments, sharing, search history, or any feature beyond the core loop.
- Test coverage. A few targeted tests on parts that would hurt if they broke is welcome; full coverage is not.
- A "polished" product. Two hours is short; cutting scope intelligently is part of the exercise.

My calls
- What fields belong on a travel profile, and why those.
- How proactive the assistant is — does it interview the user, or does it draft a profile and ask for corrections?
- How and where the profile view sits in the layout.
- How you handle ambiguity, contradictions, or the user changing their mind.
- Where you stop. Two hours is the budget; cutting scope intelligently is part of the exercise.

# Assumptions
- Fields for a travel profile
```
Goal - collect informaation of user, sufficient enough to recommend personal travel ideas
travelProfile
- name
- current address # where they live
- job # what kind of work they do
- age # how much energy they have
- favorite destination
- travel budget
- places traveled in the past
- travel wishlist
- favorite activities
- preferences # open ended, collect preferences to tailor locations
```
- Proactivity of the assistant -  User experience is important - would be nice to import a user information from somewhere (trip, booking) - can ask structured questions to build a profile (make it like a fun quiz to gatheer info). MAKE IT very easy for the user to collect info from them
- Assistant must have a fun and warm personality

# Architecture
## Data models
- ProfileData
```
id - uuid
clientId - str # serverside generated
name - str
age - int
address - str
future destinations - list[str]
travel budget - DailyBudget
past travel locales -
current_occupation -
favorite activities
travel_seasons - Enum
visaNotes
```

- Enums
Seasons - Array<'spring' | 'summer' | 'fall' | 'winter'>;
DailyBudget - { budget: number; midRange: number; luxury: number }

- Conversation
# keeps track of conversations - a user can have multiple conversations with the same assistant
```
profile_id
createdAt
updatedAt
messages
```
- Message
# keeps track of each  message
```
role: <user, assistant>
content
createdAt
updatedAt
conversationId
```

## Data Flow
1. User initiates conversation through Chat UI and gets a rsponse
User -> Client -> Server -> LLM Loop -> LLM API -> Server -> Client -> User
2. Code stores the structured profile data that is extracted
3. UI fetches profile information
Client -> Server -> Profile Data of user
4. LLM fetch travel information through Tool Call

## Interfaces
UI Interfaces
getProfileData(clientId) -> ProfileData
{
    ProfileData
}

getConversation(conversationId) -> Conversation with its messages

createConversation(clientId) -> Conversation

createMessage(conversationId, message) -> Message

Internal

GetDestinationInfo
saveProfileInfo(profileId, profileData) -> Return conflicts (helps with handling contradiction and surfacing it)
getProfileInfo(profileId)

# UI interface
- Start with a chatbox
- ConversationView if there is already a conversattion started
- Profile View (dedicated page), can add sliding (need to test UX)
- Start new Chat (nice to have)
- Past Conversations

# LLM Intefaces for tools
```
async function getDestinationInfo(name: string): Promise<DestinationInfo | null>

type DestinationInfo = {
  name: string;
  bestSeasons: Array<'spring' | 'summer' | 'fall' | 'winter'>;
  knownFor: string[]; // e.g., ["food", "architecture", "hiking"]
  averageDailyBudgetUSD: { budget: number; midRange: number; luxury: number };
  visaNotes?: string;
};
```

```
saveProfileInfo(profileData: {fields from ProfileData}) -> Success | OverwriteError (reason)
```

# System Architecture

Chat UI
 - SPA for interacting with the User
 - Use next.js

 Webserver
 - Holds APIs
- use python FastAPI

 Model Provider (configuration of Model)

 Agent Tools
- Fetch Destination Tool
- Store Profile Data (TBD, maybe subagent)
 Client APIs
 - Destination API

 Repository
 - Profile
 - Conversation
 - Persisted using sqlite

Orchestrator Agent
- Understands User Intent
- Decides to fetch destination info, figures out what questions to ask

ProfileSaverAgent
- Responsible for storing profile info
- Responsible for detecting conflict, and provide reasoning

Core Agent Loop
User Query -> Orchestrator (identify user intent, call destination tool, save profile info) -> User Response

Deterministic
- Fetch Profile Info, Save Profile Info (if conflict, dont overwrite)

# Testing
- E2E test using Agent if possible of main flow (conversation, save profile, show profile)
- Evals for Multi turn conversation

# Technology
- FE Next.js
- BE - Python FastAPI
- Agent SDK - OpenAI Agent SDK
- Model Provider - OpenRouter

# Decisions
1. UI is a chat box similar to ChatGPT, that changes into a list of chats
2. User can see past chats
3. A streamed quiz is passed back where users can type their answers
4. LLM will return response, as well as capture (separate tool LLM call, or deeterministic update?)
    - Handling conflict - LLM must surfaace the areaa
5. Ideally have an Eval set to validate the responses
6. Priority is functionality, followed
7. use OpenAI AAgents sdk
8. For local dev, use OpenRouter
9. Test different models
10. Must persist data

Tradeoffs
- Focus on building E2E, polish can come later
- Use Python for Backend (due to familiarity)

# Risks
- Cant polish the code or the UI in time
