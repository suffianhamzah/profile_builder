import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  budgetStyles,
  listProfileFields,
  scalarProfileFields,
  seasons,
  travelPaces,
  type AppState,
  type CustomConflictResolution,
  type DestinationLookupResult,
  type ListProfileField,
  type ProfileField,
  type ProfileOperation,
  type SemanticConflictProposal,
  type TurnAnalysis,
} from "../lib/contracts";

export type AnalyzeTurnInput = {
  state: AppState;
  resolvingConflictId?: string;
};

export type RespondToTurnInput = {
  state: AppState;
  destinationResults: DestinationLookupResult[];
};

export interface ModelClient {
  analyzeTurn(input: AnalyzeTurnInput): Promise<TurnAnalysis>;
  streamResponse(input: RespondToTurnInput): AsyncIterable<string>;
}

const listOperationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["add", "remove"] },
    field: { type: "string", enum: [...listProfileFields] },
    values: { type: "array", items: { type: "string" } },
  },
  required: ["kind", "field", "values"],
} as const;

const operationSchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", const: "set" },
        field: { type: "string", const: "budgetStyle" },
        value: { type: "string", enum: [...budgetStyles] },
      },
      required: ["kind", "field", "value"],
    },
    {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", const: "set" },
        field: { type: "string", const: "travelPace" },
        value: { type: "string", enum: [...travelPaces] },
      },
      required: ["kind", "field", "value"],
    },
    listOperationSchema,
  ],
} as const;

const analysisJsonSchema = {
  name: "travel_profile_turn_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      operations: { type: "array", items: operationSchema },
      semanticConflicts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: {
              type: "string",
              enum: [...scalarProfileFields, ...listProfileFields],
            },
            existingValue: { type: "string" },
            proposedValue: { type: "string" },
            reason: { type: "string" },
            proposedOperations: { type: "array", items: operationSchema },
          },
          required: [
            "field",
            "existingValue",
            "proposedValue",
            "reason",
            "proposedOperations",
          ],
        },
      },
      mentionedDestinations: {
        type: "array",
        items: { type: "string" },
      },
      customConflictResolution: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              conflictId: { type: "string" },
              understood: { type: "boolean" },
              summary: { type: "string" },
              operations: { type: "array", items: operationSchema },
            },
            required: ["conflictId", "understood", "summary", "operations"],
          },
          { type: "null" },
        ],
      },
    },
    required: [
      "operations",
      "semanticConflicts",
      "mentionedDestinations",
      "customConflictResolution",
    ],
  },
} as const;

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
      response_format: {
        type: "json_schema",
        json_schema: analysisJsonSchema,
      },
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

export function parseTurnAnalysis(content: string): TurnAnalysis {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("The profile analyzer returned invalid JSON.");
  }

  if (!isRecord(value)) throw invalidAnalysis();
  const operations = parseOperations(value.operations);
  const semanticConflicts = parseSemanticConflicts(value.semanticConflicts);
  const mentionedDestinations = parseStringArray(value.mentionedDestinations);
  const customConflictResolution = parseCustomResolution(
    value.customConflictResolution,
  );

  return {
    operations,
    semanticConflicts,
    mentionedDestinations,
    ...(customConflictResolution ? { customConflictResolution } : {}),
  };
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

Application code has already analyzed and saved this turn. You may describe the resulting state, but you cannot change it and must not claim that a pending conflict was applied. If a conflict is pending, briefly direct the user to the clarification controls.

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

CURRENT DESTINATION LOOKUPS:
${JSON.stringify(input.destinationResults)}`;
}

function recentMessages(state: AppState): ChatCompletionMessageParam[] {
  return state.messages.slice(-20).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function parseOperations(value: unknown): ProfileOperation[] {
  if (!Array.isArray(value)) throw invalidAnalysis();
  return value.map(parseOperation);
}

function parseOperation(value: unknown): ProfileOperation {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw invalidAnalysis();
  }

  if (value.kind === "set") {
    if (value.field === "budgetStyle" && includes(budgetStyles, value.value)) {
      return { kind: "set", field: "budgetStyle", value: value.value };
    }
    if (value.field === "travelPace" && includes(travelPaces, value.value)) {
      return { kind: "set", field: "travelPace", value: value.value };
    }
    throw invalidAnalysis();
  }

  if (
    (value.kind === "add" || value.kind === "remove") &&
    includes(listProfileFields, value.field)
  ) {
    return {
      kind: value.kind,
      field: value.field as ListProfileField,
      values: parseStringArray(value.values),
    };
  }
  throw invalidAnalysis();
}

function parseSemanticConflicts(value: unknown): SemanticConflictProposal[] {
  if (!Array.isArray(value)) throw invalidAnalysis();
  return value.map((item) => {
    if (
      !isRecord(item) ||
      !isProfileField(item.field) ||
      typeof item.existingValue !== "string" ||
      typeof item.proposedValue !== "string" ||
      typeof item.reason !== "string"
    ) {
      throw invalidAnalysis();
    }
    return {
      field: item.field,
      existingValue: item.existingValue,
      proposedValue: item.proposedValue,
      reason: item.reason,
      proposedOperations: parseOperations(item.proposedOperations),
    };
  });
}

function parseCustomResolution(
  value: unknown,
): CustomConflictResolution | undefined {
  if (value === null || value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value.conflictId !== "string" ||
    typeof value.understood !== "boolean" ||
    typeof value.summary !== "string"
  ) {
    throw invalidAnalysis();
  }
  return {
    conflictId: value.conflictId,
    understood: value.understood,
    summary: value.summary,
    operations: parseOperations(value.operations),
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw invalidAnalysis();
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function isProfileField(value: unknown): value is ProfileField {
  return (
    includes(scalarProfileFields, value) || includes(listProfileFields, value)
  );
}

function includes<T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidAnalysis(): Error {
  return new Error("The profile analyzer returned an invalid structured result.");
}
