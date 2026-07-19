import { describe, expect, it } from "vitest";

import type { PersistedState } from "../lib/domain";
import { clearState } from "./clear-state";

const state: PersistedState = {
  profile: {
    budgetStyle: "midRange",
    travelPace: "relaxed",
    wishlist: ["Kyoto"],
    visitedDestinations: [],
    interests: ["food"],
    preferredSeasons: ["fall"],
    dietaryPreferences: ["vegetarian"],
    accommodationPreferences: [],
    additionalPreferences: [],
  },
  messages: [
    {
      id: "message-1",
      role: "user",
      content: "I would like to visit Kyoto.",
      createdAt: "2026-07-19T12:00:00.000Z",
    },
  ],
  pendingConflicts: [
    {
      id: "conflict-1",
      field: "travelPace",
      existingValue: "relaxed",
      proposedValue: "packed",
      reason: "The preferences differ.",
      proposedOperations: [
        { kind: "set", field: "travelPace", value: "packed" },
      ],
      createdAt: "2026-07-19T12:01:00.000Z",
    },
  ],
};

describe("clearState", () => {
  it("clears only conversation messages", () => {
    const cleared = clearState(state, "conversation");

    expect(cleared.messages).toEqual([]);
    expect(cleared.profile).toEqual(state.profile);
    expect(cleared.pendingConflicts).toEqual(state.pendingConflicts);
    expect(state.messages).toHaveLength(1);
  });

  it("clears the profile and pending conflicts but preserves messages", () => {
    const cleared = clearState(state, "profile");

    expect(cleared.profile).toEqual({
      wishlist: [],
      visitedDestinations: [],
      interests: [],
      preferredSeasons: [],
      dietaryPreferences: [],
      accommodationPreferences: [],
      additionalPreferences: [],
    });
    expect(cleared.pendingConflicts).toEqual([]);
    expect(cleared.messages).toEqual(state.messages);
    expect(state.profile.budgetStyle).toBe("midRange");
  });
});
