import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import { expect, test } from "vitest";
import { createDaemonTestContext } from "../test-utils/index.js";

// Diagnostic regression for #2220. The provider is faked; committed image-heavy
// tool outputs and the daemon/client WebSocket exchange use production code.
test.each([40, 0])(
  "fetching image-heavy history with limit %i keeps the direct connection usable",
  async (limit) => {
    const highWater: Array<{ bufferedAmount: number; maxBufferedBytes: number }> = [];
    const logger = pino(
      { level: "warn" },
      new Writable({
        write(chunk, _encoding, callback) {
          const record = JSON.parse(chunk.toString());
          if (record.msg === "Closing physical WebSocket at outbound high-water mark")
            highWater.push(record);
          callback();
        },
      }),
    );
    const ctx = await createDaemonTestContext({ logger });
    const cwd = mkdtempSync(path.join(tmpdir(), "timeline-repro-"));
    try {
      const agent = await ctx.client.createAgent({ provider: "codex", cwd });
      const imageUrl = `data:image/jpeg;base64,${"A".repeat(14 * 1024 * 1024)}`;
      for (let index = 0; index < 5; index += 1) {
        await ctx.daemon.daemon.agentManager.appendTimelineItem(agent.id, {
          type: "tool_call",
          callId: `screenshot-${index}`,
          name: "node_repl.js",
          status: "completed",
          error: null,
          detail: {
            type: "unknown",
            input: { index },
            output: { _meta: { "codex/toolSurface": { screenshot: { url: imageUrl } } } },
          },
        });
      }
      // Control: the same connection and data work when the selected page is small.
      const one = await ctx.client.fetchAgentTimeline(agent.id, { direction: "tail", limit: 1 });
      expect(one.entries).toHaveLength(1);
      expect(one.hasOlder).toBe(true);

      // A 40-item fetch (the app size) or limit 0 (the CLI logs request) should return a usable page,
      // with remaining history reachable by its cursors, rather than kill the socket.
      const fetch = ctx.client.fetchAgentTimeline(agent.id, { direction: "tail", limit });
      const outcome = await fetch.then(
        (page) => ({ page }),
        (error: Error) => ({ error }),
      );
      if ("error" in outcome) {
        expect(highWater).toMatchObject([
          { bufferedAmount: 0, maxBufferedBytes: 64 * 1024 * 1024 },
        ]);
        console.log({
          limit,
          selectedImageBytes: 5 * 14 * 1024 * 1024,
          close: outcome.error.message,
          bufferedAmount: highWater[0].bufferedAmount,
        });
        throw outcome.error;
      }
      expect(outcome.page.agentId).toBe(agent.id);
    } finally {
      await ctx.cleanup();
      rmSync(cwd, { recursive: true, force: true });
    }
  },
  60_000,
);
