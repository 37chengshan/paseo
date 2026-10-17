import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import type { AgentSession } from "../agent-sdk-types.js";
import { KimiACPAgentClient } from "./kimi-acp-agent.js";

// Diagnostic for #7128. Run explicitly with an installed Kimi Code executable.
// This uses real Kimi ACP, but local model metadata rather than its managed catalog.
// No prompt or inference request is sent. It does not reproduce the reporter's load failure.
const command = process.env.KIMI_CODE_COMMAND;
const run = command ? describe : describe.skip;

run("Kimi advertised thinking contract (#7128 diagnostic)", () => {
  let root: string;
  let cwd: string;
  let client: KimiACPAgentClient;
  const sessions: AgentSession[] = [];

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "paseo-kimi-thinking-"));
    cwd = join(root, "project");
    const home = join(root, "kimi");
    await mkdir(cwd);
    await mkdir(home);
    await writeFile(
      join(home, "config.toml"),
      `default_model = "highspeed"
telemetry = false
[thinking]
enabled = true
effort = "high"
[providers.fixture]
type = "anthropic"
base_url = "http://127.0.0.1:1"
api_key = "local-config-only-no-inference"
[models.highspeed]
provider = "fixture"
model = "kimi-for-coding-highspeed"
max_context_size = 262144
capabilities = ["thinking", "always_thinking"]
[models.k3]
provider = "fixture"
model = "k3"
max_context_size = 262144
capabilities = ["thinking", "always_thinking"]
support_efforts = ["low", "high", "max"]
default_effort = "high"
`,
    );
    client = new KimiACPAgentClient({
      logger: createTestLogger(),
      command: [command!, "acp"],
      env: { KIMI_CODE_HOME: home },
      providerId: "kimi",
      label: "Kimi Code CLI",
    });
  });

  afterEach(async () => {
    for (const session of sessions.splice(0)) await session.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function create(model = "highspeed"): Promise<AgentSession> {
    const session = await client.createSession({
      provider: "acp",
      cwd,
      model,
      modeId: "yolo",
      thinkingOptionId: "high",
    });
    sessions.push(session);
    return session;
  }

  test("an advertised High option is selectable on the boolean-thinking model", async () => {
    const catalog = await client.fetchCatalog({ scope: "workspace", cwd, force: true });
    expect(catalog.models.find((model) => model.id === "highspeed")?.thinkingOptions).toEqual([
      expect.objectContaining({ id: "on" }),
      expect.objectContaining({ id: "high" }),
    ]);
    const session = await create();
    await expect(session.setThinkingOption!("high")).resolves.toBeUndefined();
  });

  test("control: the boolean model accepts On", async () => {
    const session = await create();
    await session.setThinkingOption!("on");
    expect((await session.getRuntimeInfo()).thinkingOptionId).toBe("on");
  });

  test("control: the effort-level model accepts High", async () => {
    const session = await create("k3");
    await session.setThinkingOption!("high");
    expect((await session.getRuntimeInfo()).thinkingOptionId).toBe("high");
  });

  test("control: an unchanged session reopens with High and can be changed to On", async () => {
    const session = await create();
    const handle = session.describePersistence();
    expect(handle).not.toBeNull();
    await session.close();
    sessions.splice(sessions.indexOf(session), 1);
    const resumed = await client.resumeSession(handle!);
    sessions.push(resumed);
    expect((await resumed.getRuntimeInfo()).thinkingOptionId).toBe("high");
    await resumed.setThinkingOption!("on");
    expect((await resumed.getRuntimeInfo()).thinkingOptionId).toBe("on");
  });

  test("adapted: a saved High handle reopens after the provider session changes to On", async () => {
    const session = await create();
    const savedHandle = session.describePersistence();
    expect(savedHandle).not.toBeNull();
    // Deliberately create disagreement between Paseo's saved handle and Kimi's session.
    // The report does not establish how that disagreement arose on the affected host.
    await session.setThinkingOption!("on");
    await session.close();
    sessions.splice(sessions.indexOf(session), 1);
    const resumed = await client.resumeSession(savedHandle!);
    sessions.push(resumed);
    expect((await resumed.getRuntimeInfo()).thinkingOptionId).toBe("high");
  });
});
