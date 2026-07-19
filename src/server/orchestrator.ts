import {
  type AppState,
  type ChatEvent,
  type ChatRequest,
  type DestinationLookupResult,
  type Message,
} from "../lib/contracts";
import { getDestinationInfo } from "./destinations";
import type { ModelClient } from "./model-client";
import {
  addDeterministicCustomResolution,
  applyTurnAnalysis,
} from "./profile-updates";
import type { StateStore } from "./state-store";

export type ChatTurnDependencies = {
  modelClient: ModelClient;
  store: StateStore;
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
      ? addDeterministicCustomResolution(
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

    let assistantText = "";
    for await (const text of dependencies.modelClient.streamResponse({
      state,
      destinationResults,
    })) {
      assistantText += text;
      yield { type: "assistant.delta", text };
    }

    const assistantMessage = createMessage("assistant", assistantText);
    state = {
      ...state,
      messages: [...state.messages, assistantMessage],
    };
    await dependencies.store.save(state);
    yield { type: "turn.completed", assistantMessage };
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

function createMessage(role: Message["role"], content: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}
