import {
  type ChatEvent,
  type ChatRequest,
} from "../lib/api-contracts";
import type {
  ChatMessage,
  ConflictDecision,
  PersistedState,
  ProfileConflict,
} from "../lib/domain";
import {
  getDestinationInfo,
  type DestinationLookupResult,
} from "./destinations";
import type { ModelClient } from "./model-client";
import {
  applyTurnAnalysis,
  requirePendingConflict,
  resolveConflict,
  withExplicitConflictResolution,
} from "./profile-updates";
import type { StateStore } from "./state-store";

export type ChatTurnDependencies = {
  modelClient: ModelClient;
  store: StateStore;
};

export type ResolvedConflictTurn = {
  state: PersistedState;
  userMessage: ChatMessage;
  resolution: {
    decision: ConflictDecision;
    field: ProfileConflict["field"];
    existingValue: string;
    proposedValue: string;
  };
};

export async function* runChatTurn(
  request: ChatRequest,
  dependencies: ChatTurnDependencies,
): AsyncGenerator<ChatEvent> {
  const userMessage = createMessage("user", request.message.trim());
  let state = await dependencies.store.load();
  state = { ...state, messages: [...state.messages, userMessage] };
  await dependencies.store.save(state);

  try {
    const modelAnalysis = await dependencies.modelClient.analyzeTurn({
      state,
      resolvingConflictId: request.resolvingConflictId,
    });
    const analysis = request.resolvingConflictId
      ? withExplicitConflictResolution(
          state,
          modelAnalysis,
          request.message,
          request.resolvingConflictId,
        )
      : modelAnalysis;
    state = applyTurnAnalysis(
      state,
      analysis,
      request.resolvingConflictId,
    );
    const destinationResults = await lookupDestinations(
      analysis.mentionedDestinations,
      request.message,
    );
    await dependencies.store.save(state);

    yield {
      type: "state.updated",
      profile: state.profile,
      pendingConflicts: state.pendingConflicts,
    };

    const targetedConflictIsStillPending =
      request.resolvingConflictId !== undefined &&
      state.pendingConflicts.some(
        (conflict) => conflict.id === request.resolvingConflictId,
      );
    if (targetedConflictIsStillPending) {
      yield* persistAssistantText(
        state,
        "I couldn't tell which preference you want me to remember. Please choose the current value, the proposed value, or give me a more specific answer.",
        dependencies.store,
      );
      return;
    }

    yield* streamAndPersistResponse(
      state,
      { state, destinationResults },
      dependencies,
    );
  } catch (error) {
    console.error("Chat turn failed", error);
    yield {
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : "Atlas could not complete that turn.",
    };
  }
}

export async function applyConflictDecision(
  id: string,
  decision: ConflictDecision,
  store: StateStore,
): Promise<ResolvedConflictTurn> {
  const currentState = await store.load();
  const conflict = requirePendingConflict(currentState, id);

  const userMessage = createMessage(
    "user",
    decision === "accept" ? conflict.proposedValue : conflict.existingValue,
  );
  const state = resolveConflict(
    {
      ...currentState,
      messages: [...currentState.messages, userMessage],
    },
    id,
    decision,
  );
  await store.save(state);
  return {
    state,
    userMessage,
    resolution: {
      decision,
      field: conflict.field,
      existingValue: conflict.existingValue,
      proposedValue: conflict.proposedValue,
    },
  };
}

export async function* runConflictResolutionResponse(
  turn: ResolvedConflictTurn,
  dependencies: ChatTurnDependencies,
): AsyncGenerator<ChatEvent> {
  yield { type: "user.message.created", userMessage: turn.userMessage };
  yield {
    type: "state.updated",
    profile: turn.state.profile,
    pendingConflicts: turn.state.pendingConflicts,
  };
  yield* streamAndPersistResponse(
    turn.state,
    {
      state: turn.state,
      destinationResults: [],
      resolvedConflict: turn.resolution,
    },
    dependencies,
  );
}

async function* streamAndPersistResponse(
  state: PersistedState,
  input: Parameters<ModelClient["streamResponse"]>[0],
  dependencies: ChatTurnDependencies,
): AsyncGenerator<ChatEvent> {
  let assistantText = "";
  for await (const text of dependencies.modelClient.streamResponse(input)) {
    assistantText += text;
    yield { type: "assistant.delta", text };
  }

  const assistantMessage = createMessage("assistant", assistantText);
  await dependencies.store.save({
    ...state,
    messages: [...state.messages, assistantMessage],
  });
  yield { type: "turn.completed", assistantMessage };
}

async function* persistAssistantText(
  state: PersistedState,
  text: string,
  store: StateStore,
): AsyncGenerator<ChatEvent> {
  yield { type: "assistant.delta", text };
  const assistantMessage = createMessage("assistant", text);
  await store.save({
    ...state,
    messages: [...state.messages, assistantMessage],
  });
  yield { type: "turn.completed", assistantMessage };
}

async function lookupDestinations(
  names: string[],
  latestUserMessage: string,
): Promise<DestinationLookupResult[]> {
  const normalizedMessage = latestUserMessage.toLocaleLowerCase();
  const uniqueNames = [
    ...new Set(
      names
        .map((name) => name.trim())
        .filter(
          (name) =>
            name && normalizedMessage.includes(name.toLocaleLowerCase()),
        ),
    ),
  ];
  return Promise.all(
    uniqueNames.map(async (requestedName) => ({
      requestedName,
      info: await getDestinationInfo(requestedName),
    })),
  );
}

function createMessage(
  role: ChatMessage["role"],
  content: string,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}
