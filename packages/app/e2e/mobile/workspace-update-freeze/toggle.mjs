import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".dev/workspace-update-freeze");
const { cwd } = JSON.parse(await readFile(path.join(root, "ready.json"), "utf8"));
for (let index = 0; index < 30; index += 1) {
  await writeFile(path.join(cwd, "README.md"), index % 2 ? "changed first\n" : "initial\n");
  await new Promise((resolve) => setTimeout(resolve, 3000));
}
