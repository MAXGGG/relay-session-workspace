import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { WorkspaceState } from "../core/types.ts";

export class Store {
  file: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, "workspace.json");
  }
  load(): WorkspaceState | undefined {
    if (!existsSync(this.file)) return undefined;
    const state = JSON.parse(readFileSync(this.file, "utf8"));
    if (
      state.version !== 1 ||
      !Array.isArray(state.sessions) ||
      !Array.isArray(state.items) ||
      !Array.isArray(state.messages) ||
      !Array.isArray(state.processedEvents) ||
      state.sessions.some(
        (s: { id?: unknown; name?: unknown }) =>
          typeof s.id !== "string" || typeof s.name !== "string",
      ) ||
      state.items.some(
        (i: { sessionId?: unknown }) =>
          !state.sessions.some((s: { id: string }) => s.id === i.sessionId),
      )
    ) {
      throw new Error(`Invalid saved workspace. Original file preserved: ${this.file}`);
    }
    return state;
  }
  save(state: WorkspaceState): void {
    const temporary = `${this.file}.tmp`;
    const fd = openSync(temporary, "w", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(state, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, this.file);
  }
}
