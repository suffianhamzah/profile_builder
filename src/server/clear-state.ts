import type { ClearStateRequest } from "../lib/api-contracts";
import {
  createEmptyProfile,
  type PersistedState,
} from "../lib/domain";

export function clearState(
  state: PersistedState,
  target: ClearStateRequest["target"],
): PersistedState {
  if (target === "conversation") {
    return { ...state, messages: [] };
  }

  return {
    ...state,
    profile: createEmptyProfile(),
    pendingConflicts: [],
  };
}
