import { expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPiExtensionHost } from "../index.js";

test("reported workflowScript completion publishes reviewer and its saved timeline", async () => {
  const dir = await mkdtemp(join(tmpdir(), "paseo-workflow-repro-"));
  const host = createPiExtensionHost();
  try {
    const sessionFile = join(dir, "child.jsonl");
    await writeFile(
      sessionFile,
      JSON.stringify({
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "README summary" }] },
      }) + "\n",
    );
    const args = {
      workflowScript:
        "return await runs.run('review', { agent: 'reviewer', task: 'Read README.md and return a one-sentence summary. Do not modify files.' });",
      async: false,
    };
    host.mapToolCall({
      callId: "reported-workflow",
      toolName: "subagent",
      args,
      status: "running",
      result: null,
    });
    const output = host.mapToolCall({
      callId: "reported-workflow",
      toolName: "subagent",
      args,
      status: "completed",
      result: {
        details: {
          mode: "workflow",
          runId: "reported-run",
          results: [{ index: 0, agent: "reviewer", exitCode: 0, sessionFile }],
        },
      },
    });
    expect(output?.subagents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "upsert", title: "reviewer", status: "completed" }),
      ]),
    );
    expect(await output!.hydration).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "provider_subagent",
          event: expect.objectContaining({ type: "timeline" }),
        }),
      ]),
    );
  } finally {
    host.close();
    await rm(dir, { recursive: true, force: true });
  }
});
