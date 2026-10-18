// Local regression for #7100. Creates one million real files; not part of routine CI.
// node --test scripts/directory-search-million-files.local.test.mjs
// DIRECTORY_SEARCH_MODULE can select a historical copy of directory-suggestions.ts.
// DIRECTORY_SEARCH_FIXTURE can reuse an existing fixture with the layout below.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { pathToFileURL } from "node:url";

const reusedFixture = process.env.DIRECTORY_SEARCH_FIXTURE;
const root = reusedFixture || mkdtempSync(path.join(tmpdir(), "paseo-million-files-"));
const moduleUrl = pathToFileURL(
  path.resolve(
    process.env.DIRECTORY_SEARCH_MODULE || "packages/server/src/utils/directory-suggestions.ts",
  ),
).href;

before(() => {
  if (reusedFixture) return;
  for (const directory of ["data/clips", "projects/app/src", "projects/site"]) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  for (let index = 0; index < 1_000_000; index += 1) {
    closeSync(openSync(path.join(root, "data/clips", `clip-${index}.txt`), "w"));
  }
});
after(() => {
  if (!reusedFixture) rmSync(root, { recursive: true, force: true });
});

for (const [query, expected] of [
  ["app", ["projects/app", "projects/app/src"]],
  ["src", ["projects/app/src"]],
  ["~/projects/", ["projects", "projects/app", "projects/app/src", "projects/site"]],
]) {
  test(`directory search ${query} survives a million-file sibling at 256 MiB heap`, () => {
    const source = `
      const { searchDirectoryEntries } = await import(${JSON.stringify(moduleUrl)});
      const path = await import("node:path");
      const root = ${JSON.stringify(root)};
      const results = await searchDirectoryEntries({
        root, query: ${JSON.stringify(query)}, pathFormat: "absolute",
        includeFiles: false, includeDirectories: true, pathQueryPolicy: "rooted",
        rootAliases: ["~"], blankQueryBehavior: "none",
        confidentResultScanThreshold: 5000, limit: 30,
      });
      console.log(JSON.stringify(results.map(entry => path.relative(root, entry.path).split(path.sep).join("/")).sort()));
    `;
    const result = spawnSync(
      process.execPath,
      [
        "--max-old-space-size=256",
        "--conditions=source",
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        source,
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
    assert.deepEqual(
      {
        status: result.status,
        signal: result.signal,
        outOfMemory: result.stderr.includes("heap out of memory"),
      },
      { status: 0, signal: null, outOfMemory: false },
    );
    assert.deepEqual(JSON.parse(result.stdout), expected);
  });
}
