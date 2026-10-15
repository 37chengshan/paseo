import { test, expect, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import pino from "pino";
import { AgentManager } from "./agent-manager.js";
import { AgentStorage } from "./agent-storage.js";
import { setupFinishNotification } from "./agent-prompt.js";
import { ClaudeAgentClient } from "./providers/claude/agent.js";
import { createTestAgentClient } from "../test-utils/fake-agent-client.js";

// Diagnostic reproduction for #6346. Requires Claude Code; intentionally fails on main.
// PASEO_DIAGNOSE_6346=1 npx vitest run --config packages/server/vitest.config.ts \
//   packages/server/src/server/agent/diagnose-6346.real.test.ts
// The child runs real Claude Code; the parent is an injected recording provider.
test.runIf(process.env.PASEO_DIAGNOSE_6346 === "1")(
  "Claude background completion notifies its parent after the initial finish",
  async () => {
    const diagnosticRoot = join(process.cwd(), ".dev");
    mkdirSync(diagnosticRoot, { recursive: true });
    const root = mkdtempSync(join(diagnosticRoot, "diagnose-6346-"));
    const logger = pino({ level: "silent" });
    const storage = new AgentStorage(join(root, "agents"), logger);
    const received: unknown[] = [];
    const manager = new AgentManager({
      registry: storage,
      logger,
      paseoToolsEnabled: false,
      clients: {
        claude: new ClaudeAgentClient({ logger }),
        codex: createTestAgentClient("codex", {
          onStartTurn: (prompt) => {
            received.push(prompt);
          },
        }),
      },
    });
    const ids: string[] = [];
    let stop: (() => void) | undefined;
    try {
      const parent = await manager.createAgent(
        { provider: "codex", cwd: root, modeId: "full-access" },
        undefined,
        { workspaceId: "wks_diagnosis" },
      );
      ids.push(parent.id);
      const child = await manager.createAgent(
        { provider: "claude", cwd: root, model: "haiku", modeId: "bypassPermissions" },
        undefined,
        { workspaceId: "wks_diagnosis" },
      );
      ids.push(child.id);
      stop = setupFinishNotification({
        agentManager: manager,
        agentStorage: storage,
        childAgentId: child.id,
        callerAgentId: parent.id,
        logger,
      });
      const result = await manager.runAgent(
        child.id,
        "Use Bash with run_in_background: true to run exactly: sleep 60 && echo BACKGROUND_DONE_6346. Once it is launched, reply WAITING_6346 and end this turn immediately. Do not wait or poll for it. When its task notification arrives later, report FINAL_6346 with the output.",
      );
      expect(result.finalText).toContain("WAITING_6346");
      await vi.waitFor(() => expect(received).toHaveLength(1));
      expect(received[0]).toContain("WAITING_6346");
      await vi.waitFor(
        async () => {
          expect(await manager.getLastAssistantMessage(child.id)).toContain("FINAL_6346");
        },
        { timeout: 180_000, interval: 500 },
      );
      await vi.waitFor(() => expect(manager.getAgent(child.id)?.lifecycle).toBe("idle"), {
        timeout: 20_000,
      });
      await vi.waitFor(() => expect(received).toHaveLength(2));
      expect(received[1]).toContain("FINAL_6346");
    } finally {
      stop?.();
      for (const id of ids.toReversed()) await manager.closeAgent(id);
      rmSync(root, { recursive: true, force: true });
    }
  },
  300_000,
);
