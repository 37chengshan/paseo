// Requires a paired production app and the workspace fixture described in README.md.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const [, , session, serial, artifacts] = process.argv;
assert(session && serial && artifacts, "Pass session, Android serial, and artifact directory");
mkdirSync(artifacts, { recursive: true });

function ad(...args) {
  return execFileSync("agent-device", [...args, "--session", session], {
    encoding: "utf8",
    timeout: 60_000,
  });
}
function adb(...args) {
  return execFileSync("adb", ["-s", serial, ...args], {
    encoding: "utf8",
    timeout: 15_000,
  });
}
function pid() {
  try {
    return adb("shell", "pidof", "sh.paseo").trim();
  } catch {
    return "";
  }
}

ad("open", "sh.paseo", "--relaunch", "--platform", "android");
ad("wait", "text", "Open menu", "15000");
assert.equal(
  JSON.parse(ad("perf", "memory", "sample", "--json")).data.deviceId,
  serial,
  "Session and adb serial must address the same device",
);
const initialPid = pid();
assert(initialPid, "App must have a process before opening the sidebar");
ad("press", 'label="Open menu"', "--settle");
const startedAt = Date.now();
const samples = [];
try {
  while (Date.now() - startedAt < 120_000) {
    const currentPid = pid();
    samples.push({
      elapsedMs: Date.now() - startedAt,
      pid: currentPid,
      meminfo: currentPid ? adb("shell", "dumpsys", "meminfo", "sh.paseo") : "",
    });
    writeFileSync(join(artifacts, "samples.json"), JSON.stringify(samples, null, 2));
    assert.equal(currentPid, initialPid, "Opening the workspace sidebar must keep the app alive");
    await delay(5_000);
  }
  ad("press", 'label="Close sidebar"', "--settle");
  ad("wait", "text", "Open menu", "10000");
  console.log("PASS: app survived two minutes with the sidebar open and responded to Close");
} finally {
  writeFileSync(
    join(artifacts, "exit-info.txt"),
    adb("shell", "dumpsys", "activity", "exit-info", "sh.paseo"),
  );
  writeFileSync(join(artifacts, "logcat.txt"), adb("logcat", "-d", "-t", "4000"));
}
