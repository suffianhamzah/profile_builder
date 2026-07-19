import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createEmptyState, type PersistedState } from "../lib/domain";

export interface StateStore {
  load(): Promise<PersistedState>;
  save(state: PersistedState): Promise<void>;
}

const defaultStateFilePath = path.join(process.cwd(), "data", "state.json");

export class JsonStateStore implements StateStore {
  constructor(
    private readonly filePath =
      process.env.STATE_FILE_PATH?.trim() || defaultStateFilePath,
  ) {}

  async load(): Promise<PersistedState> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return JSON.parse(contents) as PersistedState;
    } catch (error) {
      if (isMissingFileError(error)) {
        return createEmptyState();
      }
      throw error;
    }
  }

  async save(state: PersistedState): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true });

    const temporaryPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export const stateStore: StateStore = new JsonStateStore();
