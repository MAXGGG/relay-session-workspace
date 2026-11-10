import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acquireWorkspace } from "../src/server/lock.ts";
import { Store } from "../src/server/store.ts";
import { Transcripts } from "../src/server/transcripts.ts";

export function importWorkspace(source: string, destination: string): number {
  source = path.resolve(source);
  destination = path.resolve(destination);
  if (
    source === destination ||
    source.startsWith(destination + path.sep) ||
    destination.startsWith(source + path.sep)
  )
    throw new Error("Choose a separate saved workspace directory.");
  if (!existsSync(path.join(source, "workspace.json")))
    throw new Error("Choose the directory containing workspace.json (usually .relay).");
  const releaseSource = acquireWorkspace(source);
  let releaseDestination = () => {};
  try {
    releaseDestination = acquireWorkspace(destination);
    const saved = new Store(source).load();
    if (!saved) throw new Error("No saved workspace found.");
    const store = new Store(destination);
    const current = store.load();
    if (current?.sessions.length || current?.items.length)
      throw new Error("Import requires an empty desktop workspace. Your existing data was kept.");
    const transcripts = new Transcripts(destination);
    for (const session of saved.sessions) {
      const file = path.join(source, "terminals", `${session.id}.log`);
      if (existsSync(file)) {
        if (!lstatSync(file).isFile())
          throw new Error("Linked transcript files cannot be imported.");
        writeFileSync(transcripts.file(session.id), readFileSync(file, "utf8").slice(-250000), {
          mode: 0o600,
        });
      }
    }
    // Publish the snapshot only after its transcripts have copied successfully.
    store.save(saved);
    return saved.sessions.length;
  } finally {
    releaseDestination();
    releaseSource();
  }
}
