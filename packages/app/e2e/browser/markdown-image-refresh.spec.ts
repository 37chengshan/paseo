import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../support/fixtures";
import { openFileExplorer, openFileFromExplorer } from "../support/helpers/file-explorer";

const FIRST = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);
const SECOND = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("embedded Markdown image reflects a file replacement while Preview stays open", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "markdown-image-refresh-" });
  const imagePath = path.join(workspace.repoPath, "hero.png");
  await writeFile(imagePath, FIRST);
  await writeFile(path.join(workspace.repoPath, "guide.md"), "# Guide\n\n![hero](./hero.png)\n");
  await workspace.navigateTo();
  await openFileExplorer(page);
  await openFileFromExplorer(page, "guide.md");
  const image = page.getByRole("img", { name: "hero", exact: true }).locator("img");
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  const initialSource = await image.getAttribute("src");
  await writeFile(imagePath, SECOND);
  await expect.poll(() => image.getAttribute("src"), { timeout: 5000 }).not.toBe(initialSource);
});
