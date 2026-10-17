import { expect, test, type Page } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { waitForPermissionPrompt } from "../support/helpers/permissions";
import { readReplicaCache } from "../support/helpers/replica-cache-storage";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";

async function selectConversation(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: title, exact: true }).click();
}

async function waitForDirectoryCheckpoint(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const cache = await readReplicaCache(page);
      return cache?.hosts?.some((host) => host.directorySync !== undefined);
    })
    .toBe(true);
}

async function expectWaitingTab(page: Page, title: string): Promise<void> {
  const tab = page.getByRole("button", { name: title, exact: true });
  await expect(tab).toBeVisible();
  await expect(tab.getByRole("progressbar", { name: "Agent running" })).toHaveCount(0);
  // The alert SVG has no accessible name; the provider icon is the other SVG.
  await expect(tab.locator("svg")).toHaveCount(2);
}

function observeAgentSyncMode(page: Page): () => unknown {
  let mode: unknown;
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      const envelope = JSON.parse(String(payload));
      if (envelope.type === "session" && envelope.message.type === "fetch_agents_response") {
        mode = envelope.message.payload.sync.mode;
      }
    });
  });
  return () => mode;
}

async function reloadWithSlowReconnect(page: Page): Promise<void> {
  await page.routeWebSocket(daemonWsRoutePattern(), async (socket) => {
    // Fault injection: restore the disk baseline before the handshake completes.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    socket.connectToServer();
  });
  await page.reload();
}

test("keeps an inactive agent's permission alert after reload", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const syncMode = observeAgentSyncMode(page);
  const waiting = await seedMockAgentWorkspace({
    repoPrefix: "permission-reload-",
    title: "Needs approval",
    model: "thirty-minute-stream",
    initialPrompt: "Emit synthetic plan approval.",
  });
  try {
    await openAgentRoute(page, waiting);
    await waitForPermissionPrompt(page);
    await waiting.client.createAgent({
      provider: "mock",
      cwd: waiting.cwd,
      workspaceId: waiting.workspaceId,
      title: "Other conversation",
      modeId: "load-test",
      model: "thirty-minute-stream",
      initialPrompt: "Long task",
    });
    await selectConversation(page, "Other conversation");
    await expectWaitingTab(page, "Needs approval");
    await waitForDirectoryCheckpoint(page);
    await testInfo.attach("before-reload", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await reloadWithSlowReconnect(page);
    await expect(
      page.getByRole("button", { name: "Other conversation", exact: true }),
    ).toBeVisible();
    await expect.poll(syncMode).toBe("changes");
    await testInfo.attach("after-reload", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await expectWaitingTab(page, "Needs approval");
    await selectConversation(page, "Needs approval");
    await waitForPermissionPrompt(page);
  } finally {
    await waiting.cleanup();
  }
});
