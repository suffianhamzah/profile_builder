import {
  type ConflictDecision,
  type ListProfileField,
  type PersistedState,
  type ProfileConflict,
  type ProfileOperation,
} from "../lib/domain";
import type {
  SemanticConflictProposal,
  TurnAnalysis,
} from "./model-analysis";

export function addDeterministicCustomResolution(
  state: PersistedState,
  analysis: TurnAnalysis,
  latestUserMessage: string,
  resolvingConflictId?: string,
): TurnAnalysis {
  if (!resolvingConflictId) return analysis;
  const conflict = state.pendingConflicts.find(
    (item) => item.id === resolvingConflictId,
  );
  if (!conflict) return analysis;

  const message = normalize(latestUserMessage);
  const explicitlyChanges = containsAny(message, [
    "replace",
    "update",
    "use proposed",
    "choose",
    "remember",
  ]);
  const namesProposedValue = message.includes(normalize(conflict.proposedValue));
  if (!explicitlyChanges || !namesProposedValue) return analysis;

  return {
    ...analysis,
    operations: analysis.operations.filter(
      (operation) => operation.field !== conflict.field,
    ),
    semanticConflicts: analysis.semanticConflicts.filter(
      (proposal) => proposal.field !== conflict.field,
    ),
    customConflictResolution: {
      conflictId: conflict.id,
      understood: true,
      summary: `Use ${conflict.proposedValue}.`,
      operations: conflict.proposedOperations,
    },
  };
}

export function applyTurnAnalysis(
  state: PersistedState,
  analysis: TurnAnalysis,
  resolvingConflictId?: string,
): PersistedState {
  let nextState = cloneState(state);
  const conflictedFields = new Set(
    analysis.semanticConflicts.map((conflict) => conflict.field),
  );

  for (const operation of analysis.operations) {
    if (!conflictedFields.has(operation.field)) {
      nextState = applyGuardedOperation(nextState, operation);
    }
  }

  for (const proposal of analysis.semanticConflicts) {
    nextState = queueSemanticConflict(nextState, proposal);
  }

  return applyCustomResolution(nextState, analysis, resolvingConflictId);
}

export function resolveConflict(
  state: PersistedState,
  id: string,
  decision: ConflictDecision,
): PersistedState {
  const conflict = state.pendingConflicts.find((item) => item.id === id);
  if (!conflict) {
    throw new Error(`Conflict not found: ${id}`);
  }

  let nextState = cloneState(state);
  if (decision === "accept") {
    nextState = applyApprovedOperations(
      nextState,
      conflict.field,
      conflict.proposedOperations,
    );
  }

  return {
    ...nextState,
    pendingConflicts: nextState.pendingConflicts.filter(
      (item) => item.id !== id,
    ),
  };
}

function applyGuardedOperation(
  state: PersistedState,
  operation: ProfileOperation,
): PersistedState {
  if (operation.kind === "set") {
    const currentValue = state.profile[operation.field];
    if (currentValue === operation.value) {
      return state;
    }
    if (currentValue !== undefined) {
      return queueConflict(state, {
        field: operation.field,
        existingValue: currentValue,
        proposedValue: operation.value,
        reason: `This would replace the existing ${operation.field}.`,
        proposedOperations: [operation],
      });
    }
    return {
      ...state,
      profile: { ...state.profile, [operation.field]: operation.value },
    };
  }

  if (operation.kind === "add") {
    return {
      ...state,
      profile: {
        ...state.profile,
        [operation.field]: mergeUnique(
          state.profile[operation.field],
          operation.values,
        ),
      },
    };
  }

  const matchingValues = operation.values.filter((value) =>
    includesIgnoreCase(state.profile[operation.field], value),
  );
  if (matchingValues.length === 0) {
    return state;
  }

  return queueConflict(state, {
    field: operation.field,
    existingValue: matchingValues.join(", "),
    proposedValue: `Remove ${matchingValues.join(", ")}`,
    reason: `Removing saved ${operation.field} requires confirmation.`,
    proposedOperations: [
      { ...operation, values: matchingValues } as ProfileOperation,
    ],
  });
}

function queueSemanticConflict(
  state: PersistedState,
  proposal: SemanticConflictProposal,
): PersistedState {
  const proposedOperations = proposal.proposedOperations.filter(
    (operation) => operation.field === proposal.field,
  );
  if (proposedOperations.length === 0) {
    return state;
  }
  return queueConflict(state, { ...proposal, proposedOperations });
}

function queueConflict(
  state: PersistedState,
  proposal: Omit<ProfileConflict, "id" | "createdAt">,
): PersistedState {
  const alreadyPending = state.pendingConflicts.some(
    (conflict) =>
      conflict.field === proposal.field &&
      normalize(conflict.existingValue) === normalize(proposal.existingValue) &&
      normalize(conflict.proposedValue) === normalize(proposal.proposedValue),
  );
  if (alreadyPending) {
    return state;
  }

  return {
    ...state,
    pendingConflicts: [
      ...state.pendingConflicts,
      {
        ...proposal,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function applyCustomResolution(
  state: PersistedState,
  analysis: TurnAnalysis,
  resolvingConflictId?: string,
): PersistedState {
  const resolution = analysis.customConflictResolution;
  if (
    !resolution?.understood ||
    resolution.conflictId !== resolvingConflictId ||
    resolution.operations.length === 0
  ) {
    return state;
  }

  const conflict = state.pendingConflicts.find(
    (item) => item.id === resolution.conflictId,
  );
  if (!conflict) {
    return state;
  }

  // A model interpretation may act only on the conflict explicitly targeted by
  // the user's clarification. Other fields still go through a future turn.
  if (
    resolution.operations.some(
      (operation) => operation.field !== conflict.field,
    )
  ) {
    return state;
  }

  const nextState = applyApprovedOperations(
    state,
    conflict.field,
    resolution.operations,
  );
  return {
    ...nextState,
    pendingConflicts: nextState.pendingConflicts.filter(
      (item) => item.id !== conflict.id,
    ),
  };
}

function applyApprovedOperations(
  state: PersistedState,
  field: ProfileConflict["field"],
  operations: ProfileOperation[],
): PersistedState {
  if (operations.length === 0 || operations.some((op) => op.field !== field)) {
    throw new Error("Conflict operations must target the conflicted field");
  }

  let profile = { ...state.profile };
  for (const operation of operations) {
    if (operation.kind === "set") {
      profile = { ...profile, [operation.field]: operation.value };
      continue;
    }

    const currentValues = profile[operation.field];
    profile = {
      ...profile,
      [operation.field]:
        operation.kind === "add"
          ? mergeUnique(currentValues, operation.values)
          : removeIgnoreCase(currentValues, operation.values),
    };
  }
  return { ...state, profile };
}

function mergeUnique(current: string[], additions: string[]): string[] {
  const result = [...current];
  const known = new Set(current.map(normalize));
  for (const value of additions) {
    const trimmed = value.trim();
    if (trimmed && !known.has(normalize(trimmed))) {
      result.push(trimmed);
      known.add(normalize(trimmed));
    }
  }
  return result;
}

function removeIgnoreCase(current: string[], removals: string[]): string[] {
  const removed = new Set(removals.map(normalize));
  return current.filter((value) => !removed.has(normalize(value)));
}

function includesIgnoreCase(values: string[], target: string): boolean {
  const normalizedTarget = normalize(target);
  return values.some((value) => normalize(value) === normalizedTarget);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function containsAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function cloneState(state: PersistedState): PersistedState {
  return {
    ...state,
    profile: {
      ...state.profile,
      wishlist: [...state.profile.wishlist],
      visitedDestinations: [...state.profile.visitedDestinations],
      interests: [...state.profile.interests],
      preferredSeasons: [...state.profile.preferredSeasons],
      dietaryPreferences: [...state.profile.dietaryPreferences],
      accommodationPreferences: [...state.profile.accommodationPreferences],
      additionalPreferences: [...state.profile.additionalPreferences],
    },
    messages: [...state.messages],
    pendingConflicts: state.pendingConflicts.map((conflict) => ({
      ...conflict,
      proposedOperations: [...conflict.proposedOperations],
    })),
  };
}
