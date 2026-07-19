import { describe, expect, it } from "vitest";
import { createModelClient } from "./model-client";

describe("createModelClient", () => {
  it("fails clearly when configuration is incomplete", () => {
    expect(() => createModelClient({})).toThrow(
      "MODEL_API_KEY, MODEL_BASE_URL, MODEL_NAME",
    );
  });
});
