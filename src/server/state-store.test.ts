import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createEmptyState, type AppState } from "../lib/contracts";
import { JsonStateStore } from "./state-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function makeStore(): Promise<{
  filePath: string;
  store: JsonStateStore;
}> {
  const directory = await mkdtemp(path.join(tmpdir(), "atlas-state-test-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "nested", "state.json");
  return { filePath, store: new JsonStateStore(filePath) };
}

describe("JsonStateStore", () => {
  it("returns a fresh empty state when the file is missing", async () => {
    const { store } = await makeStore();
    await expect(store.load()).resolves.toEqual(createEmptyState());
  });

  it("round-trips application state", async () => {
    const { filePath, store } = await makeStore();
    const state: AppState = {
      ...createEmptyState(),
      profile: {
        ...createEmptyState().profile,
        budgetStyle: "midRange",
        interests: ["food", "architecture"],
      },
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "I travel for food.",
          createdAt: "2026-07-19T12:00:00.000Z",
        },
      ],
    };

    await store.save(state);

    await expect(store.load()).resolves.toEqual(state);
    await expect(readFile(filePath, "utf8")).resolves.toContain(
      '"budgetStyle": "midRange"',
    );
  });
});
