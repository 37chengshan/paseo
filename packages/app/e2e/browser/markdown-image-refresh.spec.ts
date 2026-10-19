import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { openFileExplorer, openFileFromExplorer } from "../support/helpers/file-explorer";

const WHITE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);
const BLACK = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function embeddedImage(page: Page): Locator {
  return page.getByRole("button", { name: "hero", exact: true });
}

function displayedPixel(image: Locator): Promise<number[]> {
  return image.evaluate((element: HTMLImageElement) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.drawImage(element, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  });
}

async function createGuide(repoPath: string): Promise<void> {
  await writeFile(path.join(repoPath, "hero.png"), WHITE);
  await writeFile(path.join(repoPath, "guide.md"), "# Guide\n\n![hero](./hero.png)\n");
}

async function openGuidePreview(page: Page): Promise<void> {
  await openFileExplorer(page);
  await openFileFromExplorer(page, "guide.md");
  await expect.poll(() => displayedPixel(embeddedImage(page))).toEqual([255, 255, 255, 255]);
}

async function replaceEmbeddedImage(repoPath: string): Promise<void> {
  const imagePath = path.join(repoPath, "hero.png");
  await writeFile(imagePath, BLACK);
  expect(await readFile(imagePath)).toEqual(BLACK);
}

async function expectReplacementInPreview(page: Page): Promise<void> {
  await expect
    .configure({ soft: true })
    .poll(() => displayedPixel(embeddedImage(page)), { timeout: 5000 })
    .toEqual([0, 0, 0, 255]);
}

async function remountMarkdownPreview(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect.poll(() => displayedPixel(embeddedImage(page))).toEqual([0, 0, 0, 255]);
}

async function expectReplacementWhenOpenedDirectly(page: Page): Promise<void> {
  await openFileFromExplorer(page, "hero.png");
  // The standalone image viewer has no accessible name for its image.
  const image = page.getByTestId("image-file-preview-canvas").locator("img");
  await expect.poll(() => displayedPixel(image)).toEqual([0, 0, 0, 255]);
}

test("embedded Markdown image reflects a file replacement while Preview stays open", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "markdown-image-refresh-" });
  await createGuide(workspace.repoPath);
  await workspace.navigateTo();
  await openGuidePreview(page);
  const originalSource = await embeddedImage(page).getAttribute("src");

  await replaceEmbeddedImage(workspace.repoPath);
  await expectReplacementInPreview(page);
  await test.info().attach("replacement-observation", {
    body: JSON.stringify({
      displayedPixel: await displayedPixel(embeddedImage(page)),
      sourceUnchanged: originalSource === (await embeddedImage(page).getAttribute("src")),
      replacementBytesOnDisk: (await readFile(path.join(workspace.repoPath, "hero.png"))).equals(
        BLACK,
      ),
    }),
    contentType: "application/json",
  });
  await remountMarkdownPreview(page);
  await expectReplacementWhenOpenedDirectly(page);
});
