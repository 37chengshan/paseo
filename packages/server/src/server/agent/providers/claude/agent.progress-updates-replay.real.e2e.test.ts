import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import type { AgentSession, AgentTimelineItem } from "../../agent-sdk-types.js";
import { ClaudeAgentClient } from "./agent.js";

const sessions: AgentSession[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.close();
  for (const cwd of directories.splice(0)) rmSync(cwd, { recursive: true, force: true });
});

test("a marked progress update stays assistant text when the session is reopened", async () => {
  const markedTexts = new Set<string>();
  const client = new ClaudeAgentClient({
    logger: pino(
      { level: "trace" },
      {
        write(line: string) {
          const record = JSON.parse(line);
          const event = record.rawEvent;
          if (event?.type !== "assistant") return;
          for (const index of event.narration_block_indexes ?? []) {
            const text = event.message.content[index]?.thinking;
            if (text) markedTexts.add(text);
          }
        },
      },
    ),
  });
  const cwd = mkdtempSync(path.join(tmpdir(), "paseo-progress-replay-"));
  directories.push(cwd);
  for (const [name, text] of [
    ["a", "Plan A\nCost: 3 credits\nTime: 2 days\nRisk: needs a manual review step\n"],
    ["b", "Plan B\nCost: 5 credits\nTime: 1 day\nRisk: none known\n"],
    ["c", "Plan C\nCost: 2 credits\nTime: 4 days\nRisk: depends on an external vendor\n"],
  ])
    writeFileSync(path.join(cwd, `plan-${name}.txt`), text);
  const session = await client.createSession({
    provider: "claude",
    cwd,
    model: "claude-opus-5-5",
    thinkingOptionId: "xhigh",
    modeId: "bypassPermissions",
  });
  sessions.push(session);
  await new Promise<void>((resolve, reject) => {
    session.subscribe((event) => {
      if (event.type === "turn_failed") reject(new Error(event.error));
      if (event.type === "permission_requested" || event.type === "turn_completed") resolve();
    });
    void session
      .startTurn(
        "There are three plan files in this directory: plan-a.txt, plan-b.txt and plan-c.txt. Read each one, tell me how they compare on cost, time and risk, and then ask me which plan to pick using your AskUserQuestion tool. Keep me posted as you go.",
      )
      .catch(reject);
  });
  expect(
    markedTexts.size,
    "provider must produce a marked update for this reproduction",
  ).toBeGreaterThan(0);
  const persistence = session.describePersistence();
  expect(persistence).not.toBeNull();
  await session.close();
  sessions.splice(sessions.indexOf(session), 1);
  const resumed = await client.resumeSession(persistence!, { cwd });
  sessions.push(resumed);
  const items: AgentTimelineItem[] = [];
  for await (const event of resumed.streamHistory()) {
    if (event.type === "timeline") items.push(event.item);
  }
  for (const text of markedTexts) {
    expect(items).toContainEqual(expect.objectContaining({ type: "assistant_message", text }));
  }
}, 280_000);
