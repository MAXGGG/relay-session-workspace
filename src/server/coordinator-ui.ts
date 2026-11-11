import type { Workspace } from "../core/workspace.ts";

const sessionFields = [
  "name",
  "cwd",
  "mode",
  "priority",
  "executable",
  "args",
  "resumeArgs",
  "conversationId",
  "attentionMode",
  "quietSeconds",
  "notes",
  "group",
  "templateId",
];
const editFields = sessionFields.filter((field) => !["cwd", "mode", "templateId"].includes(field));
// These are application workflows, never DOM selectors, script or arbitrary API routes.
export const coordinatorFlows = {
  "new-session": {
    target: "none",
    fields: sessionFields,
    description:
      "Prepare any session type or saved template in the launch form; user reviews and starts it.",
  },
  "edit-session": {
    target: "session",
    fields: editFields,
    description: "Prepare launch settings, notes, resume details, name or group edits; user saves.",
  },
  templates: {
    target: "none",
    fields: [...sessionFields, "templateName"],
    description:
      "Open template management, select templateId or prepare a named template; user saves/deletes.",
  },
  "saved-folder": {
    target: "none",
    fields: ["group", "cwd"],
    description: "Prepare a saved group folder; user saves or forgets it.",
  },
  "browse-folder": {
    target: "none",
    fields: ["group"],
    description: "Open the launch form and native project folder picker when available.",
  },
  "delete-session": {
    target: "session",
    fields: [],
    description: "Show the normal deletion confirmation for this stopped session.",
  },
  "stop-archive": {
    target: "session",
    fields: [],
    description: "Show the normal stop-and-archive confirmation.",
  },
  "session-up": {
    target: "session",
    fields: [],
    description: "Move the session up within its sidebar group.",
  },
  "session-down": {
    target: "session",
    fields: [],
    description: "Move the session down within its sidebar group.",
  },
  "save-output": {
    target: "session",
    fields: [],
    description: "Download this session's retained terminal output.",
  },
  "search-sessions": {
    target: "none",
    fields: ["query", "showArchived"],
    description: "Filter the session sidebar; showArchived is true or false.",
  },
  queue: {
    target: "none",
    fields: ["filter", "page"],
    description:
      "Show pending, snoozed (Deferred), or resolved (Handled); page is a 1-based handled page.",
  },
  "add-attention": {
    target: "session",
    fields: ["kind", "text"],
    description:
      "Prepare a manual question, approval, review, error or activity card; user adds it.",
  },
  settings: {
    target: "none",
    fields: [
      "retireAfterDays",
      "coordinatorProvider",
      "coordinatorCwd",
      "coordinatorWorker",
      "coordinatorExecutable",
      "coordinatorModel",
    ],
    description: "Prepare app/coordinator settings; user reviews and saves.",
  },
  notifications: {
    target: "none",
    fields: ["enabled"],
    description: "Enable/disable notifications (true/false). OS permission is still required.",
  },
  layout: {
    target: "none",
    fields: ["sessions", "attention", "chat"],
    description:
      "Adjust panel widths in pixels and coordinator height ratio (0.2–0.75); no fields resets layout.",
  },
  "claude-details": {
    target: "session",
    fields: ["expanded"],
    description: "Expand/collapse Claude hook diagnostics and resume information (true/false).",
  },
  "attention-preview": {
    target: "item",
    fields: ["expanded"],
    description: "Expand/collapse a selected attention card's saved preview (true/false).",
  },
  "import-workspace": {
    target: "none",
    fields: [],
    description:
      "Open the desktop's saved-workspace import flow with its normal picker and confirmation.",
  },
  "desktop-menu": {
    target: "none",
    fields: ["operation"],
    description:
      "Desktop menu: about, open-data-folder, show, hide, reload, zoom-in, zoom-out, reset-zoom, fullscreen or quit (confirmation). No arbitrary paths or OS commands.",
  },
} as const;

export type CoordinatorFlow = keyof typeof coordinatorFlows;
export interface CoordinatorUiAction {
  flow?: CoordinatorFlow | null;
  sessionId?: string | null;
  itemId?: string | null;
  fields?: { name: string; value: string }[] | null;
}
export interface CoordinatorUiRequest {
  flow: CoordinatorFlow;
  sessionId?: string;
  itemId?: string;
  values: Record<string, string>;
}

export function validateUiAction(action: CoordinatorUiAction): CoordinatorUiRequest {
  if (!action.flow || !Object.hasOwn(coordinatorFlows, action.flow))
    throw new Error("Unknown coordinator workflow.");
  const definition = coordinatorFlows[action.flow];
  const values: Record<string, string> = {};
  if (action.fields != null && (!Array.isArray(action.fields) || action.fields.length > 30))
    throw new Error("Invalid workflow fields.");
  for (const field of action.fields ?? []) {
    if (
      !field ||
      typeof field.name !== "string" ||
      !(definition.fields as readonly string[]).includes(field.name) ||
      Object.hasOwn(values, field.name) ||
      typeof field.value !== "string" ||
      field.value.length > 20000 ||
      [...field.value].some((char) => {
        const code = char.charCodeAt(0);
        return (code < 32 && code !== 9 && code !== 10) || code === 127;
      }) ||
      Object.keys(field).some((key) => !["name", "value"].includes(key))
    )
      throw new Error("Invalid field for coordinator workflow.");
    values[field.name] = field.value;
  }
  for (const field of ["showArchived", "expanded", "enabled"]) {
    if (values[field] !== undefined && !["true", "false"].includes(values[field]))
      throw new Error(`Invalid ${field} value.`);
  }
  if (values.filter !== undefined && !["pending", "snoozed", "resolved"].includes(values.filter))
    throw new Error("Unknown queue view.");
  if (
    action.flow === "desktop-menu" &&
    ![
      "about",
      "open-data-folder",
      "show",
      "hide",
      "reload",
      "zoom-in",
      "zoom-out",
      "reset-zoom",
      "fullscreen",
      "quit",
    ].includes(values.operation)
  )
    throw new Error("Unknown desktop menu action.");
  for (const [field, min, max] of [
    ["page", 1, 1000000],
    ["sessions", 170, 2000],
    ["attention", 240, 2000],
    ["chat", 0.2, 0.75],
  ] as const) {
    if (
      values[field] !== undefined &&
      (!values[field].trim() ||
        !Number.isFinite(Number(values[field])) ||
        Number(values[field]) < min ||
        Number(values[field]) > max ||
        (field === "page" && !Number.isInteger(Number(values[field]))))
    )
      throw new Error(`Invalid ${field} value.`);
  }
  if (definition.target === "session" && !action.sessionId)
    throw new Error("Choose a session for this workflow.");
  if (definition.target === "item" && !action.itemId)
    throw new Error("Choose an attention item for this workflow.");
  return {
    flow: action.flow,
    values,
    ...(action.sessionId ? { sessionId: action.sessionId } : {}),
    ...(action.itemId ? { itemId: action.itemId } : {}),
  };
}

export function prepareUiRequest(
  workspace: Workspace,
  action: CoordinatorUiAction,
): CoordinatorUiRequest {
  const request = validateUiAction(action);
  if (request.sessionId) workspace.session(request.sessionId);
  if (request.itemId) {
    const item = workspace.item(request.itemId);
    if (request.sessionId && item.sessionId !== request.sessionId)
      throw new Error("The item belongs to a different session.");
    request.sessionId = item.sessionId;
  }
  if (
    request.values.templateId &&
    !workspace.state.templates?.some((t) => t.id === request.values.templateId)
  )
    throw new Error("Saved template not found.");
  return request;
}
