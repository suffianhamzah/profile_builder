import { describe, expect, it } from "vitest";

import { getDestinationInfo } from "./destinations";

describe("getDestinationInfo", () => {
  it("returns a known destination", async () => {
    await expect(getDestinationInfo("Tokyo")).resolves.toMatchObject({
      name: "Tokyo",
      knownFor: expect.arrayContaining(["food"]),
    });
  });

  it("normalizes whitespace and explicit aliases", async () => {
    await expect(getDestinationInfo("  TOKYO   JAPAN ")).resolves.toMatchObject({
      name: "Tokyo",
    });
    await expect(getDestinationInfo("CDMX")).resolves.toMatchObject({
      name: "Mexico City",
    });
  });

  it("returns null for an unknown destination", async () => {
    await expect(getDestinationInfo("Atlantis")).resolves.toBeNull();
  });
});
