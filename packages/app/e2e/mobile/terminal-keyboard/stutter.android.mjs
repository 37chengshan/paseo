import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Start an agent-device Android session on an idle terminal with its keyboard hidden.
// The explicit budget is a diagnostic comparison parameter, not a shipped performance guarantee.
const maxJankPercent = Number(process.argv[2]);
assert(
  process.argv[2] &&
    Number.isFinite(maxJankPercent) &&
    maxJankPercent >= 0 &&
    maxJankPercent <= 100,
  "Pass the maximum median janky-frame percentage, for example: node stutter.android.mjs 20",
);
const session = process.env.PASEO_AGENT_DEVICE_SESSION ?? "terminal-keyboard-stutter";
const serial = process.env.ANDROID_SERIAL ?? "emulator-5554";
const artifacts = resolve(".dev/agent-device-artifacts/terminal-keyboard-stutter");
mkdirSync(artifacts, { recursive: true });

function ad(...args) {
  return execFileSync("agent-device", [...args, "--session", session], {
    encoding: "utf8",
    timeout: 20_000,
  });
}

function keyboardShown() {
  return /^  mInputShown=true$/m.test(
    execFileSync("adb", ["-s", serial, "shell", "dumpsys", "input_method"], {
      encoding: "utf8",
      timeout: 10_000,
    }),
  );
}

async function waitForKeyboard(shown) {
  const deadline = Date.now() + 5000;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    stableSamples = keyboardShown() === shown ? stableSamples + 1 : 0;
    if (stableSamples === 3) {
      // Include the pane's delayed refits after the keyboard animation ends.
      await delay(500);
      return;
    }
    await delay(100);
  }
  throw new Error(`Keyboard did not settle at shown=${shown}`);
}

function frames() {
  const result = JSON.parse(ad("perf", "frames", "--json"));
  const sample = result.data.metrics.fps;
  assert(sample.available, "Android frame metrics must be available");
  return sample;
}

function keyboardTogglePoint() {
  const { data } = JSON.parse(ad("snapshot", "-i", "--json"));
  const toggle = data.nodes.find((node) => node.identifier === "terminal-keyboard-toggle");
  const input = data.nodes.find((node) => node.identifier === "terminal-native-input");
  assert(input && toggle?.rect, "Open a native terminal before running this diagnostic");
  return {
    x: String(Math.round(toggle.rect.x + toggle.rect.width / 2)),
    y: String(Math.round(toggle.rect.y + toggle.rect.height / 2)),
  };
}

async function keyboardCycle(point) {
  ad("press", point.x, point.y);
  await waitForKeyboard(true);
  const open = frames();
  ad("back");
  await waitForKeyboard(false);
  const close = frames();
  return { open, close };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function captureKeyboardCycles() {
  assert.equal(keyboardShown(), false, "Start with the software keyboard hidden");
  const point = keyboardTogglePoint();
  frames();
  await keyboardCycle(point); // Warm the keyboard and terminal before measuring.
  const samples = [];
  for (let cycle = 0; cycle < 5; cycle += 1) {
    samples.push(await keyboardCycle(point));
  }
  return samples;
}

const samples = await captureKeyboardCycles();
const open = median(samples.map((sample) => sample.open.droppedFramePercent));
const close = median(samples.map((sample) => sample.close.droppedFramePercent));
const result = { maxJankPercent, medianJankPercent: { open, close }, samples };
writeFileSync(resolve(artifacts, "frames.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ maxJankPercent, medianJankPercent: { open, close } }));
assert(open <= maxJankPercent, `Keyboard opening: ${open}% exceeds ${maxJankPercent}%`);
assert(close <= maxJankPercent, `Keyboard closing: ${close}% exceeds ${maxJankPercent}%`);
