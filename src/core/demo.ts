import { ingestEvent } from "./events.ts";
import type { Workspace } from "./workspace.ts";

export function seedDemo(workspace: Workspace, cwd: string): void {
  const samples = [
    {
      id: "session-payments",
      name: "Payments API",
      project: "checkout-service",
      priority: 1 as const,
      demoScenario: "question" as const,
    },
    {
      id: "session-website",
      name: "Website navigation",
      project: "web-platform",
      priority: 2 as const,
      demoScenario: "review" as const,
    },
    {
      id: "session-research",
      name: "Search research",
      project: "discovery",
      priority: 3 as const,
      demoScenario: "working" as const,
    },
  ];
  for (const sample of samples) workspace.addSession({ ...sample, cwd, mode: "demo" });
  ingestEvent(workspace, samples[0].id, {
    hook_event_name: "Stop",
    last_assistant_message:
      "Should failed refunds retry automatically, or wait for a manual review?",
  });
  ingestEvent(workspace, samples[1].id, {
    hook_event_name: "Stop",
    last_assistant_message:
      "Navigation update is ready for review. Keyboard focus and mobile layout are included.",
  });
  workspace.session(samples[2].id).status = "working";
  workspace.message(
    "assistant",
    "Three sample sessions are ready. Say “next task” and I’ll bring the highest-priority item into focus. Samples are simulated; new Shell and Claude sessions use real terminals.",
  );
}
