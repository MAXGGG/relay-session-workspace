import type { LaunchTemplate } from "../core/types.ts";
import { validPriority } from "../core/workspace.ts";
import { argumentList } from "./profiles.ts";

export function libraryText(value: unknown, limit = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\0\r\n]/.test(value))
    throw new Error(`Use nonempty, single-line text of up to ${limit} characters.`);
  return value.trim();
}

export function launchTemplate(body: Record<string, unknown>): LaunchTemplate {
  const mode = body.mode as LaunchTemplate["mode"];
  if (!["shell", "claude", "codex", "custom"].includes(mode))
    throw new Error("Invalid template session type.");
  const attentionMode = body.attentionMode as LaunchTemplate["attentionMode"];
  if (!["events", "quiet", "manual"].includes(attentionMode))
    throw new Error("Invalid template attention mode.");
  const quietSeconds = Number(body.quietSeconds ?? 15);
  if (!Number.isInteger(quietSeconds) || quietSeconds < 3 || quietSeconds > 3600)
    throw new Error("Quiet interval must be 3–3600 seconds.");
  const id = libraryText(body.id, 100);
  if (!/^[\w-]+$/.test(id)) throw new Error("Invalid template ID.");
  const executable = body.executable ? libraryText(body.executable) : undefined;
  if (mode === "custom" && !executable) throw new Error("Custom templates need an executable.");
  return {
    id,
    name: libraryText(body.name, 60),
    mode,
    priority: validPriority(Number(body.priority ?? 2)),
    executable,
    args: argumentList(body.args),
    resumeArgs: argumentList(body.resumeArgs),
    attentionMode,
    quietSeconds,
  };
}

export function validLibrary(groups: unknown, templates: unknown): boolean {
  try {
    if (groups !== undefined) {
      if (!Array.isArray(groups) || groups.length > 200) return false;
      for (const group of groups) {
        libraryText(group?.name, 60);
        libraryText(group?.cwd);
      }
      if (new Set(groups.map((g) => g.name)).size !== groups.length) return false;
    }
    if (templates !== undefined) {
      if (!Array.isArray(templates) || templates.length > 100) return false;
      for (const template of templates) launchTemplate(template);
      if (new Set(templates.map((t) => t.id)).size !== templates.length) return false;
    }
    return true;
  } catch {
    return false;
  }
}
