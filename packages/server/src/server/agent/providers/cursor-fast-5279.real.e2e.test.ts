import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { CursorACPAgentClient } from "./cursor-acp-agent.js";

// Diagnosis-only reproduction for #5279. Requires the installed Cursor CLI;
// sends no prompts and keeps Cursor's model preferences inside this checkout.
test("Cursor Fast availability follows the drafted and active model", async () => {
  const fixtures = path.resolve(".diagnose-5279");
  await mkdir(fixtures, { recursive: true });
  const root = await mkdtemp(path.join(fixtures, "cursor-"));
  const client = new CursorACPAgentClient({
    logger: createTestLogger(),
    command: ["cursor-agent", "acp"],
    env: {
      CURSOR_CONFIG_DIR: path.join(root, "config"),
      CURSOR_DATA_DIR: path.join(root, "data"),
    },
  });
  const hasFast = (features: { id: string }[] | undefined) =>
    features?.some((feature) => feature.id === "fast") ?? false;

  try {
    const catalog = await client.fetchCatalog({ scope: "workspace", cwd: root, force: true });
    expect(catalog.models.some((model) => model.id === "composer-2.5")).toBe(true);
    expect(catalog.models.some((model) => model.id === "kimi-k3")).toBe(true);

    const composer = await client.listFeatures({
      provider: "acp",
      cwd: root,
      model: "composer-2.5",
    });
    console.log("Default saved model: Composer draft offers Fast =", hasFast(composer));
    expect.soft(hasFast(composer), "Composer draft must offer Fast").toBe(true);

    // A real model change persists Composer only in the isolated Cursor config.
    const seed = await client.createSession({
      provider: "acp",
      cwd: root,
      model: "composer-2.5",
    });
    await seed.close();

    for (const model of ["composer-2.5", "kimi-k3"]) {
      const features = await client.listFeatures({ provider: "acp", cwd: root, model });
      console.log("Composer saved model:", model, "draft offers Fast =", hasFast(features));
      expect.soft(hasFast(features), `Draft ${model}`).toBe(model === "composer-2.5");
    }

    const session = await client.createSession({ provider: "acp", cwd: root });
    try {
      expect(hasFast(session.features)).toBe(true);
      await session.setModel!("kimi-k3");
      console.log("After Composer -> Kimi: session offers Fast =", hasFast(session.features));
      expect.soft(hasFast(session.features), "Kimi session must hide Fast").toBe(false);
      await expect(session.setFeature!("fast", "true")).rejects.toThrow(
        "Unknown model config option: fast",
      );
    } finally {
      await session.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
