import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { stopDaemonInstance } from "./daemon-instance.js";
import { acquirePidLock } from "./pid-lock.js";

// A shared home exposes a live supervisor's lock to a PID namespace in which its PID
// does not exist. The Docker reproduction in #4307 establishes that condition; these
// filesystem tests retain it without requiring a container runtime in the unit suite.
async function withUnseenOwner(run: (home: string, contents: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "paseo-unseen-owner-"));
  const contents = JSON.stringify({
    pid: 2_147_483_647,
    startedAt: new Date().toISOString(),
    hostname: "shared-host",
    uid: process.getuid?.() ?? 0,
    listen: null,
    heartbeat: true,
  });
  try {
    await writeFile(join(home, "paseo.pid"), contents);
    await run(home, contents);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test("acquiring a lock preserves a fresh heartbeat from an unseen owner", async () => {
  await withUnseenOwner(async (home, contents) => {
    await expect(acquirePidLock(home, null)).rejects.toThrow();
    expect(await readFile(join(home, "paseo.pid"), "utf8")).toBe(contents);
  });
});

test("stopping an unseen owner preserves its fresh shared lock", async () => {
  await withUnseenOwner(async (home, contents) => {
    // Either refusing the operation or returning without modifying the foreign lock is safe.
    // The failure being locked down is deleting the live supervisor's lock.
    await stopDaemonInstance(home).catch(() => undefined);
    expect(await readFile(join(home, "paseo.pid"), "utf8")).toBe(contents);
  });
});
