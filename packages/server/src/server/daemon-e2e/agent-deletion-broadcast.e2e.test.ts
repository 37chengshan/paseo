import { expect, test } from "vitest";
import { createDaemonTestContext } from "../test-utils/index.js";
import { DaemonClient } from "../test-utils/daemon-client.js";
import type { SessionOutboundMessage } from "../messages.js";

test("deleting an agent removes it from every connected agent subscription", async () => {
  const ctx = await createDaemonTestContext();
  const observer = new DaemonClient({ url: `ws://127.0.0.1:${ctx.daemon.port}/ws` });
  const updates: SessionOutboundMessage[] = [];
  const requestorUpdates: SessionOutboundMessage[] = [];
  try {
    await observer.connect();
    const agent = await ctx.client.createAgent({
      provider: "codex",
      cwd: ctx.daemon.staticDir,
      title: "Cross-client deletion",
    });
    const snapshot = await observer.fetchAgents({ subscribe: {} });
    expect(snapshot.entries.some((entry) => entry.agent.id === agent.id)).toBe(true);
    observer.subscribeRawMessages((message) => updates.push(message));
    ctx.client.subscribeRawMessages((message) => requestorUpdates.push(message));

    await ctx.client.deleteAgent(agent.id);

    // The record is gone, and a fresh query sees that. An existing subscriber
    // must learn the same fact without reconnecting or fetching another list.
    const afterDelete = await ctx.client.fetchAgents();
    expect(afterDelete.entries.some((entry) => entry.agent.id === agent.id)).toBe(false);
    expect(
      requestorUpdates.some(
        (message) =>
          message.type === "agent_update" &&
          message.payload.kind === "remove" &&
          message.payload.agentId === agent.id,
      ),
    ).toBe(true);
    await expect(observer.fetchAgentTimeline(agent.id, { direction: "tail" })).rejects.toThrow(
      "Agent not found",
    );

    await expect
      .poll(
        () =>
          updates.some(
            (message) =>
              message.type === "agent_update" &&
              message.payload.kind === "remove" &&
              message.payload.agentId === agent.id,
          ),
        { timeout: 2_000 },
      )
      .toBe(true);
  } finally {
    await observer.close();
    await ctx.cleanup();
  }
});
