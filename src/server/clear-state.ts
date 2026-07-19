import {
  createEmptyProfile,
  type AppState,
  type ClearStateRequest,
} from "../lib/contracts";

export function clearState(
  state: AppState,
  target: ClearStateRequest["target"],
): AppState {
  if (target === "conversation") {
    return { ...state, messages: [] };
  }

  return {
    ...state,
    profile: createEmptyProfile(),
    pendingConflicts: [],
  };
}
