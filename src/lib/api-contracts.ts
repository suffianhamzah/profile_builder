// Data that crosses the browser/server boundary. Model inputs, analyzer output,
// and other per-turn server details do not belong in this module.

import type {
  ChatMessage,
  ConflictDecision,
  PersistedState,
  ProfileConflict,
  TravelProfile,
} from "./domain";

export type ChatRequest = {
  message: string;
  resolvingConflictId?: string;
};

export type ChatEvent =
  | { type: "user.message.created"; userMessage: ChatMessage }
  | {
      type: "state.updated";
      profile: TravelProfile;
      pendingConflicts: ProfileConflict[];
    }
  | { type: "assistant.delta"; text: string }
  | { type: "turn.completed"; assistantMessage: ChatMessage }
  | { type: "error"; message: string };

export type ResolveConflictRequest = {
  decision: ConflictDecision;
};

export type ClearStateRequest = {
  target: "conversation" | "profile";
};

export type ClearStateResponse = {
  state: PersistedState;
};

export type ApiError = {
  error: string;
};
