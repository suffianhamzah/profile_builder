import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  type ConflictDecision,
  type PersistedState,
  type ProfileField,
} from "../lib/domain";
import type { DestinationLookupResult } from "./destinations";
import {
  parseTurnAnalysis,
  type TurnAnalysis,
  turnAnalysisResponseFormat,
} from "./model-analysis";

export { parseTurnAnalysis } from "./model-analysis";

export type AnalyzeTurnInput = {
  state: PersistedState;
  resolvingConflictId?: string;
};

export type RespondToTurnInput = {
  state: PersistedState;
  destinationResults: DestinationLookupResult[];
  resolvedConflict?: {
    decision: ConflictDecision;
    field: ProfileField;
    existingValue: string;
    proposedValue: string;
  };
};

export interface ModelClient {
  analyzeTurn(input: AnalyzeTurnInput): Promise<TurnAnalysis>;
  streamResponse(input: RespondToTurnInput): AsyncIterable<string>;
}

export class OpenAICompatibleModelClient implements ModelClient {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async analyzeTurn(input: AnalyzeTurnInput): Promise<TurnAnalysis> {
    const latestUserMessage = [...input.state.messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!latestUserMessage) {
      throw new Error("The profile analyzer requires a user message.");
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      stream: false,
      temperature: 0,
      response_format: turnAnalysisResponseFormat,
      messages: [
        { role: "system", content: buildAnalyzerInstructions(input) },
        {
          role: "user",
          content: `Analyze ONLY this latest user message:\n${latestUserMessage.content}`,
        },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new Error("The profile analyzer returned no structured output.");
    }
    return parseTurnAnalysis(content);
  }

  async *streamResponse(input: RespondToTurnInput): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      temperature: 0.7,
      messages: [
        { role: "system", content: buildResponderInstructions(input) },
        ...recentMessages(input.state),
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}

export function createModelClient(
  environment: Record<string, string | undefined> = process.env,
): ModelClient {
  const apiKey = environment.MODEL_API_KEY?.trim();
  const baseURL = environment.MODEL_BASE_URL?.trim();
  const model = environment.MODEL_NAME?.trim();
  const missing = [
    !apiKey && "MODEL_API_KEY",
    !baseURL && "MODEL_BASE_URL",
    !model && "MODEL_NAME",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing model configuration: ${missing.join(", ")}`);
  }

  return new OpenAICompatibleModelClient(
    new OpenAI({ apiKey, baseURL }),
    model as string,
  );
}

export function buildAnalyzerInstructions(input: AnalyzeTurnInput): string {
  const activeConflict = input.resolvingConflictId
    ? input.state.pendingConflicts.find(
        (conflict) => conflict.id === input.resolvingConflictId,
      )
    : undefined;

  return `You are the profile-change analyzer for a travel application. Return only the required JSON schema. You never speak to the user.

Your job is to interpret ONLY the latest user message, compare every proposed profile change with the CURRENT PROFILE, and separate safe additions from changes that require human confirmation. Recent conversation is reference context only; never extract a preference from an assistant message and never infer private attributes.

PROFILE SEMANTICS
- budgetStyle and travelPace are single-choice scalar fields.
- wishlist, visitedDestinations, interests, preferredSeasons, dietaryPreferences, accommodationPreferences, and additionalPreferences are collections.
- Collection values normally coexist. Treat them as conflicting only when the user explicitly replaces, retracts, corrects, or avoids a saved value, or when the new preference is logically incompatible with a saved value in the same field.

ANALYSIS PROCEDURE
1. Extract candidate changes from the latest user message.
2. For each candidate, inspect the current value or values for that exact field.
3. Classify it as either:
   - compatible: genuinely new information that can coexist with the current field; put it in operations.
   - conflict: a replacement, correction, withdrawal, or likely incompatibility; put it in semanticConflicts and do not put any operation for that field in operations.
4. If compatibility is genuinely uncertain, prefer a semantic conflict so the user can decide. Do not invent a conflict merely because two different list values are present.

CONFLICT OUTPUT RULES
- existingValue must quote or summarize the relevant value currently stored in that field.
- proposedValue must concisely describe what the latest user message would change it to.
- reason must neutrally explain why the values may not coexist; do not decide for the user.
- proposedOperations must contain the complete change to apply after approval and every operation must target the conflict's field.
- Replacing a list value normally requires both remove(existing) and add(proposed).
- A field present in semanticConflicts must not also appear in operations.

EXAMPLES
- Existing travelPace "relaxed" plus "I prefer packed itineraries now" is a conflict.
- Existing accommodation preference "quiet boutique hotels" plus "party hostels are my priority" is a likely conflict.
- Existing budgetStyle "budget" plus "make every trip luxury" is a conflict.
- Existing preferred season "summer" plus "also interested in winter" is compatible; "I avoid summer now and only want winter" is a conflict.
- Existing interest "food" plus new interest "architecture" is compatible.
- Existing dietary preference "vegetarian" plus a recurring steakhouse preference is a likely conflict that needs clarification.

OPERATION RULES
- Use set only for budgetStyle or travelPace.
- Use add for compatible collection values. Keep values short and user-readable.
- Use remove only for an explicit withdrawal; application code will still require confirmation.
- Mention only destinations literally discussed in the latest user turn. Preserve a useful city or country name.
- customConflictResolution must be null unless a targeted conflict is shown below. If the answer clearly resolves that conflict, use its exact ID and operations only for its field. If unclear, set understood false with no operations.

Current profile:
${JSON.stringify(input.state.profile)}

Pending conflicts:
${JSON.stringify(input.state.pendingConflicts)}

Targeted conflict for this clarification:
${JSON.stringify(activeConflict ?? null)}

Recent conversation for resolving references only:
${JSON.stringify(input.state.messages.slice(-8))}`;
}

export function buildResponderInstructions(input: RespondToTurnInput): string {
  return `You are Atlas, a warm and concise travel-profile assistant. Respond to the latest user message and help the user build a useful travel profile one detail at a time.

Application code has already analyzed and saved this turn. You may describe the resulting state, but you cannot change it and must not claim that a pending conflict was applied.

STATE AUTHORITY
- Current profile and Pending conflicts below are the sole source of truth for saved state. Never infer that a conflict is still pending from recent conversation text.
- If Pending conflicts is empty, never say that a conflict is pending.
- If RESOLVED CONFLICT THIS TURN is present, briefly confirm the completed choice before continuing. For "accept", confirm the proposed value was saved. For "reject", confirm the existing value was kept.
- If another conflict remains pending after that resolution, direct the user only to the oldest visible clarification.

FOLLOW-UP CALL TO ACTION
- Ask at most one short, easy-to-answer question in a response. Never list several missing fields or turn the response into a questionnaire.
- If a conflict is pending, the only call to action is to resolve the oldest visible clarification. Do not ask for another profile detail in the same response.
- Otherwise, ask about the highest-priority useful detail that is still missing:
  1. A destination or region they may want to visit when wishlist is empty.
  2. The experiences or interests they value when interests is empty.
  3. Their preferred travel pace when travelPace is missing.
  4. Their general budget style when budgetStyle is missing.
  5. Their accommodation preferences when accommodationPreferences is empty.
  6. Their preferred travel season when preferredSeasons is empty.
- When the current turn includes a known destination lookup, prefer one relevant question that connects a literal lookup fact to the highest-priority missing detail.
- Do not ask for dietary preferences unless the user is already discussing food or dining.
- Do not repeat a question already asked in the recent conversation. Move to the next useful missing detail, or ask no question if another would feel forced.
- If the profile already has enough detail for the current conversation, a follow-up is optional. Keep the response focused on what the user just said.

Destination facts may come ONLY from the literal fields and values in CURRENT DESTINATION LOOKUPS below. Do not add examples, attractions, dishes, neighborhoods, prices, seasons, or visa facts from your general knowledge, even for a known destination. For a null result, say that verified destination information is unavailable. When asking a destination-based follow-up for a known result, naturally anchor it in one listed knownFor, bestSeasons, or budget value. Do not give personalized visa advice.

Current profile:
${JSON.stringify(input.state.profile)}

Pending conflicts:
${JSON.stringify(input.state.pendingConflicts)}

RESOLVED CONFLICT THIS TURN:
${JSON.stringify(input.resolvedConflict ?? null)}

CURRENT DESTINATION LOOKUPS:
${JSON.stringify(input.destinationResults)}`;
}

function recentMessages(state: PersistedState): ChatCompletionMessageParam[] {
  return state.messages.slice(-20).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}
