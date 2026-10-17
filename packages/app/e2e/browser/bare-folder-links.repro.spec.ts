import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

async function openFolderLink(page: Page) {
  await page
    .getByTestId("assistant-message")
    .getByRole("link", { name: "Open folder", exact: true })
    .click();
}

async function expectFolderContents(page: Page) {
  await expect(page.getByTestId("file-explorer-tree-scroll")).toBeVisible();
  await expect(
    page.getByTestId("file-explorer-tree-scroll").getByText("guide.md", { exact: true }),
  ).toBeVisible();
}

test("an explicit Markdown folder link without ./ opens its contents", async ({ page }) => {
  const session = await seedMockAgentWorkspace({
    repoPrefix: "bare-folder-link-repro-",
    title: "Bare folder link reproduction",
    initialPrompt: "Show the folder link",
    featureValues: { mockAssistantResponse: "[Open folder](docs/guides)" },
  });
  try {
    await mkdir(path.join(session.cwd, "docs/guides"), { recursive: true });
    await writeFile(path.join(session.cwd, "docs/guides/guide.md"), "# Folder link destination\n");
    await session.client.waitForFinish(session.agentId, 30_000);
    await openAgentRoute(page, session);
    await openFolderLink(page);
    await expectFolderContents(page);
  } finally {
    await session.cleanup();
  }
});
