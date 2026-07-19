import { describe, expect, it } from "vitest";

import {
  createEmptyState,
  type AppState,
  type TurnAnalysis,
} from "../lib/contracts";
import {
  addDeterministicCustomResolution,
  addDeterministicSemanticConflicts,
  applyTurnAnalysis,
  resolveConflict,
} from "./profile-updates";

const emptyAnalysis = (): TurnAnalysis => ({
  operations: [],
  semanticConflicts: [],
  mentionedDestinations: [],
});

function stateWithBudget(): AppState {
  const state = createEmptyState();
  return {
    ...state,
    profile: { ...state.profile, budgetStyle: "budget" },
  };
}

describe("applyTurnAnalysis", () => {
  it("applies safe additions and deduplicates lists case-insensitively", () => {
    const initial = createEmptyState();
    initial.profile.interests = ["Food"];

    const result = applyTurnAnalysis(initial, {
      ...emptyAnalysis(),
      operations: [
        {
          kind: "add",
          field: "interests",
          values: [" food ", "Architecture", "architecture"],
        },
        { kind: "set", field: "travelPace", value: "relaxed" },
      ],
    });

    expect(result.profile.interests).toEqual(["Food", "Architecture"]);
    expect(result.profile.travelPace).toBe("relaxed");
    expect(initial.profile.interests).toEqual(["Food"]);
  });

  it("does not overwrite a scalar and queues a conflict", () => {
    const result = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });

    expect(result.profile.budgetStyle).toBe("budget");
    expect(result.pendingConflicts).toHaveLength(1);
    expect(result.pendingConflicts[0]).toMatchObject({
      field: "budgetStyle",
      existingValue: "budget",
      proposedValue: "luxury",
    });
  });

  it("queues semantic conflicts without applying their proposed operations", () => {
    const initial = createEmptyState();
    initial.profile.dietaryPreferences = ["vegetarian"];
    const proposedOperation = {
      kind: "add" as const,
      field: "dietaryPreferences" as const,
      values: ["steakhouse dining"],
    };

    const result = applyTurnAnalysis(initial, {
      ...emptyAnalysis(),
      operations: [proposedOperation],
      semanticConflicts: [
        {
          field: "dietaryPreferences",
          existingValue: "vegetarian",
          proposedValue: "steakhouse dining",
          reason: "Steakhouse dining may conflict with vegetarian food.",
          proposedOperations: [proposedOperation],
        },
      ],
    });

    expect(result.profile.dietaryPreferences).toEqual(["vegetarian"]);
    expect(result.pendingConflicts).toHaveLength(1);
  });

  it("keeps an ambiguous free-form resolution pending", () => {
    const pending = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });
    const conflict = pending.pendingConflicts[0];

    const result = applyTurnAnalysis(
      pending,
      {
        ...emptyAnalysis(),
        customConflictResolution: {
          conflictId: conflict.id,
          understood: false,
          summary: "The answer was unclear.",
          operations: [],
        },
      },
      conflict.id,
    );

    expect(result.profile.budgetStyle).toBe("budget");
    expect(result.pendingConflicts).toHaveLength(1);
  });

  it("requires a matching user-targeted conflict before applying a custom resolution", () => {
    const pending = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });
    const conflict = pending.pendingConflicts[0];
    const clarification: TurnAnalysis = {
      ...emptyAnalysis(),
      customConflictResolution: {
        conflictId: conflict.id,
        understood: true,
        summary: "Use mid-range instead.",
        operations: [
          { kind: "set", field: "budgetStyle", value: "midRange" },
        ],
      },
    };

    const unbound = applyTurnAnalysis(pending, clarification);
    expect(unbound.profile.budgetStyle).toBe("budget");
    expect(unbound.pendingConflicts).toHaveLength(1);

    const resolved = applyTurnAnalysis(pending, clarification, conflict.id);
    expect(resolved.profile.budgetStyle).toBe("midRange");
    expect(resolved.pendingConflicts).toHaveLength(0);
  });

  it("does not let custom resolution operations alter another field", () => {
    const pending = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });
    const conflict = pending.pendingConflicts[0];
    const result = applyTurnAnalysis(
      pending,
      {
        ...emptyAnalysis(),
        customConflictResolution: {
          conflictId: conflict.id,
          understood: true,
          summary: "The model tried to change another field.",
          operations: [
            { kind: "set", field: "travelPace", value: "packed" },
          ],
        },
      },
      conflict.id,
    );

    expect(result.profile.travelPace).toBeUndefined();
    expect(result.pendingConflicts).toHaveLength(1);
  });
});

describe("addDeterministicSemanticConflicts", () => {
  it("guards the required vegetarian and steakhouse contradiction", () => {
    const state = createEmptyState();
    state.profile.dietaryPreferences = ["vegetarian"];
    const guarded = addDeterministicSemanticConflicts(
      state,
      {
        ...emptyAnalysis(),
        operations: [
          {
            kind: "add",
            field: "dietaryPreferences",
            values: ["steakhouse dining"],
          },
        ],
      },
      "I want to visit a steakhouse on every trip.",
    );

    const result = applyTurnAnalysis(state, guarded);
    expect(result.profile.dietaryPreferences).toEqual(["vegetarian"]);
    expect(result.pendingConflicts).toHaveLength(1);
    expect(result.pendingConflicts[0]).toMatchObject({
      field: "dietaryPreferences",
      existingValue: "vegetarian",
      proposedValue: "steakhouse dining",
    });
  });

  it("replaces an incomplete model conflict without leaking its normal update", () => {
    const state = createEmptyState();
    state.profile.dietaryPreferences = ["steakhouse dining"];
    const guarded = addDeterministicSemanticConflicts(
      state,
      {
        ...emptyAnalysis(),
        operations: [
          {
            kind: "add",
            field: "dietaryPreferences",
            values: ["vegetarian dining"],
          },
        ],
        semanticConflicts: [
          {
            field: "dietaryPreferences",
            existingValue: "steakhouse dining",
            proposedValue: "vegetarian dining",
            reason: "These preferences may conflict.",
            proposedOperations: [
              {
                kind: "remove",
                field: "dietaryPreferences",
                values: ["steakhouse dining"],
              },
            ],
          },
        ],
      },
      "I want vegetarian dining now.",
    );

    const result = applyTurnAnalysis(state, guarded);
    expect(result.profile.dietaryPreferences).toEqual(["steakhouse dining"]);
    expect(result.pendingConflicts[0].proposedOperations).toEqual([
      {
        kind: "remove",
        field: "dietaryPreferences",
        values: ["steakhouse dining"],
      },
      {
        kind: "add",
        field: "dietaryPreferences",
        values: ["vegetarian dining"],
      },
    ]);
  });
});

describe("addDeterministicCustomResolution", () => {
  it("binds an explicit replacement to the stored pending proposal", () => {
    const pending = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });
    const conflict = pending.pendingConflicts[0];
    const guarded = addDeterministicCustomResolution(
      pending,
      emptyAnalysis(),
      "Please replace my current value with luxury.",
      conflict.id,
    );
    const resolved = applyTurnAnalysis(pending, guarded, conflict.id);

    expect(resolved.profile.budgetStyle).toBe("luxury");
    expect(resolved.pendingConflicts).toEqual([]);
  });

  it("keeps an ambiguous custom answer pending", () => {
    const pending = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });
    const conflict = pending.pendingConflicts[0];
    const guarded = addDeterministicCustomResolution(
      pending,
      emptyAnalysis(),
      "Something in the middle.",
      conflict.id,
    );
    const unresolved = applyTurnAnalysis(pending, guarded, conflict.id);

    expect(unresolved.profile.budgetStyle).toBe("budget");
    expect(unresolved.pendingConflicts).toHaveLength(1);
  });
});

describe("resolveConflict", () => {
  it("accepts the proposed operation", () => {
    const pending = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });

    const result = resolveConflict(
      pending,
      pending.pendingConflicts[0].id,
      "accept",
    );
    expect(result.profile.budgetStyle).toBe("luxury");
    expect(result.pendingConflicts).toHaveLength(0);
  });

  it("rejects the proposal without changing the profile", () => {
    const pending = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });

    const result = resolveConflict(
      pending,
      pending.pendingConflicts[0].id,
      "reject",
    );
    expect(result.profile.budgetStyle).toBe("budget");
    expect(result.pendingConflicts).toHaveLength(0);
  });

  it("throws for an unknown conflict ID", () => {
    expect(() => resolveConflict(createEmptyState(), "missing", "accept")).toThrow(
      "Conflict not found: missing",
    );
  });
});
