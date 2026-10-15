import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { installDaemonWebSocketGate } from "../support/helpers/daemon-websocket-gate";
import { seedWorkspace } from "../support/helpers/seed-client";
import { gotoWorkspace } from "../support/helpers/launcher";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";
import {
  openGlobalNewWorkspaceComposer,
  submitNewWorkspacePrompt,
} from "../support/helpers/new-workspace";
import { chooseModel, startWithoutRememberedModel } from "../support/helpers/model-memory";
import { selectSidebarStatusGrouping } from "../support/helpers/sidebar";

// Diagnostic reproduction for #7043. Keep provider state inside the checkout.
const piAgentDirectory = path.resolve(__dirname, "../../../../.diagnose-7043-pi-agent");
test.use({
  e2eDaemonConfig: {
    version: 1,
    agents: {
      providers: {
        pi: { models: [{ id: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5" }] },
      },
    },
  },
  e2eDaemonEnvironment: {
    PI_CODING_AGENT_DIR: piAgentDirectory,
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    OPENROUTER_API_KEY: "",
  },
});

test.beforeAll(() => {
  mkdirSync(piAgentDirectory, { recursive: true });
  writeFileSync(path.join(piAgentDirectory, "auth.json"), "{}\n");
});
test.afterAll(() => rmSync(piAgentDirectory, { recursive: true, force: true }));

interface WorkspaceFrame {
  type: string;
  status?: string;
  phase?: string;
}

function recordWorkspaceFrames(page: Page): WorkspaceFrame[] {
  const frames: WorkspaceFrame[] = [];
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      const envelope = JSON.parse(String(payload));
      const message = envelope.message ?? envelope;
      if (
        message.type === "workspace_update" ||
        message.type === "workspace.create.response" ||
        message.type === "workspace.create.update"
      ) {
        frames.push({
          type: message.type,
          status: message.payload?.workspace?.status,
          phase: message.payload?.phase,
        });
      }
    }),
  );
  return frames;
}

async function startFailedPiWorkspace(page: Page): Promise<void> {
  await waitForSidebarHydration(page);
  await selectSidebarStatusGrouping(page);
  await openGlobalNewWorkspaceComposer(page);
  await chooseModel(page, "pi", "Claude Sonnet 4.5");
  await submitNewWorkspacePrompt(page, "Reply OK.");
}

async function expectFailedWorkspaceOutsideWorking(page: Page): Promise<void> {
  await expect(page.getByText(/No API key found/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Worked for 0s", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Working group", { exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Failed group", { exact: true })).toBeVisible();
}

for (const lateResponse of [false, true]) {
  test(`failed first Pi turn leaves Working with ${lateResponse ? "creation response last" : "ordinary delivery"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const workspace = await seedWorkspace({ repoPrefix: "failed-workspace-status-" });
    const frames = recordWorkspaceFrames(page);
    const gate = await installDaemonWebSocketGate(page);
    try {
      await startWithoutRememberedModel(page);
      await gotoWorkspace(page, workspace.workspaceId);
      if (lateResponse) gate.holdNextServerMessage("workspace.create.response");
      await startFailedPiWorkspace(page);
      if (lateResponse) {
        await gate.waitForHeldServerMessage("workspace.create.response");
        // Adapted timing: deliver the real response after both real failure updates.
        await expect
          .poll(
            () =>
              frames.filter(
                (frame) => frame.type === "workspace_update" && frame.status === "failed",
              ).length,
          )
          .toBeGreaterThanOrEqual(2);
        gate.releaseHeldServerMessage("workspace.create.response");
      }
      await expectFailedWorkspaceOutsideWorking(page);
    } finally {
      console.log("WORKSPACE FRAMES", JSON.stringify(frames));
      await page.screenshot({ path: test.info().outputPath("failed-sidebar.png") });
      await workspace.cleanup();
    }
  });
}
