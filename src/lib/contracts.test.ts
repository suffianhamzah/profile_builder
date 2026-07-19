import { describe, expect, it } from "vitest";
import { createEmptyState } from "./contracts";

describe("createEmptyState", () => {
  it("creates isolated empty profile collections", () => {
    const first = createEmptyState();
    const second = createEmptyState();

    first.profile.interests.push("food");

    expect(second.profile.interests).toEqual([]);
    expect(first.messages).toEqual([]);
    expect(first.pendingConflicts).toEqual([]);
  });
});
