import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Bounded raw terminal replay, kept separately from the searchable workspace metadata. */
export class Transcripts {
  directory: string;
  buffers = new Map<string, string>();
  dirty = new Set<string>();
  constructor(directory: string) {
    this.directory = path.join(directory, "terminals");
    mkdirSync(this.directory, { recursive: true });
  }
  file(id: string): string {
    if (!/^[\w-]{1,100}$/.test(id)) throw new Error("Invalid transcript ID.");
    return path.join(this.directory, `${id}.log`);
  }
  read(id: string): string {
    if (!this.buffers.has(id)) {
      const file = this.file(id);
      this.buffers.set(id, existsSync(file) ? readFileSync(file, "utf8").slice(-250000) : "");
    }
    return this.buffers.get(id) as string;
  }
  append(id: string, text: string): void {
    this.buffers.set(id, (this.read(id) + text).slice(-250000));
    this.dirty.add(id);
  }
  flush(): void {
    for (const id of this.dirty) {
      const file = this.file(id);
      writeFileSync(`${file}.tmp`, this.read(id), { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
      this.dirty.delete(id);
    }
  }
}
