import { mkdtemp, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pino from "pino";
import { expect, test } from "vitest";
import { ClaudeAgentClient } from "./agent.js";
import { claudeQuery, type ClaudeQueryFactory } from "./query.js";
import type { AgentStreamEvent } from "../../agent-sdk-types.js";

// Diagnostic evidence for #3941. The baseline intentionally fails until Paseo
// handles MCP elicitation. The control uses the real SDK with a supplied callback;
// it demonstrates causation, not a production fix or a user approval UI.
const diagnosticTest = test.skipIf(process.env.PASEO_TEST_CLAUDE_ELICITATION !== "1");

diagnosticTest.each([false, true])(
  "Claude MCP confirmation, diagnostic callback supplied: %s",
  async (supplyCallback) => {
    const fixtureDir = fileURLToPath(new URL("./test-fixtures/", import.meta.url));
    const cwd = await mkdtemp(path.join(fixtureDir, "elicitation-workspace-"));
    const auditPath = path.join(cwd, "elicitation-audit.jsonl");
    const callbackRequests: unknown[] = [];
    const queryFactory: ClaudeQueryFactory | undefined = supplyCallback
      ? (input) =>
          claudeQuery({
            ...input,
            options: {
              ...input.options,
              onElicitation: async (request) => {
                callbackRequests.push(request);
                return { action: "accept", content: {} };
              },
            },
          })
      : undefined;
    const client = new ClaudeAgentClient({ logger: pino({ level: "silent" }), queryFactory });
    const session = await client.createSession({
      provider: "claude",
      model: "haiku",
      modeId: "auto",
      cwd,
      mcpServers: {
        diagnostic: {
          type: "stdio",
          command: process.execPath,
          args: [path.join(fixtureDir, "elicitation-server.mjs"), auditPath],
        },
      },
      // Authorize only the harmless tool invocation. Its MCP confirmation must
      // still be a separate user decision, as in the reported Auto-mode path.
      providerOptions: { allowedTools: ["mcp__diagnostic__confirm_action"] },
    });
    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));
    try {
      await session.startTurn(
        "Call mcp__diagnostic__confirm_action exactly once now. It only requests local human confirmation and performs no external action. Report the exact tool result. Do not use any other tools.",
      );
      await expect
        .poll(
          () =>
            session.getPendingPermissions().length > 0 ||
            events.some((event) => ["turn_completed", "turn_failed"].includes(event.type)),
          { timeout: 150_000 },
        )
        .toBe(true);
      const audit = (await readFile(auditPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      console.log("MCP audit", audit);
      expect(audit[0]).toEqual({ event: "elicitation_requested" });
      if (supplyCallback) {
        expect(callbackRequests).toHaveLength(1);
        expect(audit[1].result).toEqual({ action: "accept", content: {} });
      } else {
        expect(
          session.getPendingPermissions(),
          "MCP confirmation must await the user",
        ).toHaveLength(1);
        expect(audit).toHaveLength(1);
      }
    } finally {
      unsubscribe();
      await session.close();
      await rm(cwd, { recursive: true, force: true });
    }
  },
  180_000,
);
