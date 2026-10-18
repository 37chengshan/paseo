import type { SeedDaemonClient } from "../../support/helpers/seed-client";
import { connectDaemonClient } from "../../support/helpers/daemon-client-loader";
import { readFile, writeFile } from "node:fs/promises";
async function main() {
  const { port, cwd } = JSON.parse(
    await readFile(".dev/workspace-update-freeze/ready.json", "utf8"),
  );
  const client = await connectDaemonClient<SeedDaemonClient>({
    clientIdPrefix: "stream515a",
    port,
  });
  try {
    const agent = await client.createAgent({
      provider: "mock",
      cwd,
      workspaceId: "wks_diag515a_0",
      title: "Android stream reproduction",
      modeId: "load-test",
      model: "five-minute-stream",
    });
    await writeFile(".dev/workspace-update-freeze/agent.json", JSON.stringify(agent));
    for (let i = 0; i < 110; i++) {
      await client.sendAgentMessage(
        agent.id,
        `history ${i}: emit 1 coalesced agent stream updates`,
      );
      await client.waitForFinish(agent.id, 15000);
    }
    console.log("HISTORY_READY", agent.id);
    await writeFile(".dev/workspace-update-freeze/history-ready", agent.id);
    await client.sendAgentMessage(agent.id, "Stream a realistic long answer with code blocks.");
    await client.waitForFinish(agent.id, 360000);
    console.log("FINISHED");
  } finally {
    await client.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
