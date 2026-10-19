import { spawn } from "node:child_process";
import { once } from "node:events";
import { test, expect } from "vitest";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { CodexAppServerClient } from "./app-server-transport.js";

test("a provider that closes stdin rejects initialization without an uncaught stream error", async () => {
  const child = spawn("/bin/sh", ["-c", "exec 0<&-; printf READY; sleep 0.2; exit 86"], {
    stdio: "pipe",
  });
  const ready = once(child.stdout, "data");
  const client = new CodexAppServerClient(child, createTestLogger());
  try {
    await ready;
    await expect(client.request("initialize", {})).rejects.toThrow(/86/);
  } finally {
    await client.dispose();
  }
});
