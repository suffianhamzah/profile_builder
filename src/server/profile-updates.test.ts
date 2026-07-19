import { describe, expect, it } from "vitest";

import {
  createEmptyState,
  type PersistedState,
} from "../lib/domain";
import type { TurnAnalysis } from "./model-analysis";
import {
  applyTurnAnalysis,
  ConflictNotFoundError,
  resolveConflict,
  withExplicitConflictResolution,
} from "./profile-updates";

const emptyAnalysis = (): TurnAnalysis => ({
  operations: [],
  semanticConflicts: [],
  mentionedDestinations: [],
});

function stateWithBudget(): PersistedState {
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

describe("semantic conflict application", () => {
  it("blocks every normal operation for a field with a semantic conflict", () => {
    const state = createEmptyState();
    state.profile.accommodationPreferences = ["quiet boutique hotels"];

    const result = applyTurnAnalysis(state, {
      ...emptyAnalysis(),
      operations: [
        {
          kind: "add",
          field: "accommodationPreferences",
          values: ["party hostels"],
        },
        {
          kind: "add",
          field: "interests",
          values: ["architecture"],
        },
      ],
      semanticConflicts: [
        {
          field: "accommodationPreferences",
          existingValue: "quiet boutique hotels",
          proposedValue: "party hostels",
          reason: "These lodging styles may represent different priorities.",
          proposedOperations: [
            {
              kind: "remove",
              field: "accommodationPreferences",
              values: ["quiet boutique hotels"],
            },
            {
              kind: "add",
              field: "accommodationPreferences",
              values: ["party hostels"],
            },
          ],
        },
      ],
    });

    expect(result.profile.accommodationPreferences).toEqual([
      "quiet boutique hotels",
    ]);
    expect(result.profile.interests).toEqual(["architecture"]);
    expect(result.pendingConflicts).toHaveLength(1);
    expect(result.pendingConflicts[0]).toMatchObject({
      field: "accommodationPreferences",
      existingValue: "quiet boutique hotels",
      proposedValue: "party hostels",
    });
  });

  it("ignores conflict operations that target a different field", () => {
    const state = createEmptyState();
    state.profile.accommodationPreferences = ["quiet hotels"];
    const result = applyTurnAnalysis(state, {
      ...emptyAnalysis(),
      semanticConflicts: [
        {
          field: "accommodationPreferences",
          existingValue: "quiet hotels",
          proposedValue: "party hostels",
          reason: "These may conflict.",
          proposedOperations: [
            {
              kind: "add",
              field: "interests",
              values: ["nightlife"],
            },
          ],
        },
      ],
    });

    expect(result.pendingConflicts).toEqual([]);
  });
});

describe("withExplicitConflictResolution", () => {
  it("binds an explicit replacement to the stored pending proposal", () => {
    const pending = applyTurnAnalysis(stateWithBudget(), {
      ...emptyAnalysis(),
      operations: [{ kind: "set", field: "budgetStyle", value: "luxury" }],
    });
    const conflict = pending.pendingConflicts[0];
    const guarded = withExplicitConflictResolution(
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
    const guarded = withExplicitConflictResolution(
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
    expect(() =>
      resolveConflict(createEmptyState(), "missing", "accept"),
    ).toThrow(ConflictNotFoundError);
  });
});
