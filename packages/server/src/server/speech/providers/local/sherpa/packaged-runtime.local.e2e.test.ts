import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, onTestFinished, test } from "vitest";

// Exercises npm's consumer resolution, without the repository lockfile. Requires registry access.
test.runIf(process.platform === "linux" && process.arch === "x64").each([false, true])(
  "a server consumer installs the pinned local speech native runtime (upgrade: %s)",
  (upgrade) => {
    const directory = mkdtempSync(path.join(tmpdir(), "paseo-speech-consumer-"));
    onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
    const serverRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
    const packed = JSON.parse(
      execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", directory], {
        cwd: serverRoot,
        encoding: "utf8",
        timeout: 60_000,
      }),
    ) as Array<{ filename: string }>;
    const consumer = path.join(directory, "consumer");
    mkdirSync(consumer);
    writeFileSync(path.join(consumer, "package.json"), '{"private":true}');
    if (upgrade) {
      execFileSync(
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--omit=dev",
          "--no-audit",
          "--no-fund",
          "@getpaseo/server@0.8.0",
        ],
        { cwd: consumer, encoding: "utf8", timeout: 120_000 },
      );
    }
    execFileSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        path.join(directory, packed[0].filename),
      ],
      { cwd: consumer, encoding: "utf8", timeout: 120_000 },
    );

    const serverRequire = createRequire(
      path.join(consumer, "node_modules/@getpaseo/server/package.json"),
    );
    const wrapperPath = serverRequire.resolve("sherpa-onnx-node/package.json");
    const wrapperRequire = createRequire(wrapperPath);
    const wrapper = wrapperRequire(wrapperPath) as { version: string };
    const native = wrapperRequire("sherpa-onnx-linux-x64/package.json") as { version: string };
    expect(native.version).toBe(wrapper.version);
  },
  180_000,
);
