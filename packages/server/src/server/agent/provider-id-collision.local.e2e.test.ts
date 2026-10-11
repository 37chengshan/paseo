import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";
import { ProviderOverridesSchema } from "@getpaseo/protocol/provider-config";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { buildProviderRegistry } from "./provider-registry.js";
import type { AgentSession } from "./agent-sdk-types.js";

// Retained reproduction for #3178, awaiting the built-in ID configuration decision.
// Requires OMP on PATH (or OMP_COMMAND). Uses no model calls or existing provider state.
const runReproduction = process.env.OMP_PROVIDER_COLLISION_REPRO === "1";

for (const providerId of ["omp-acp", "omp"]) {
  test.skipIf(!runReproduction)(
    `explicit ACP configuration creates an ACP session under '${providerId}'`,
    async () => {
      const cwd = await mkdtemp(path.join(process.cwd(), ".provider-collision-"));
      const agentDir = path.join(cwd, "agent");
      await mkdir(agentDir);
      const providerOverrides = ProviderOverridesSchema.parse({
        [providerId]: {
          extends: "acp",
          label: "Oh My Pi ACP",
          command: [process.env.OMP_COMMAND ?? "omp", "acp"],
          enabled: true,
          env: {
            PI_CODING_AGENT_DIR: agentDir,
            OMP_PROFILE: "default",
            PI_PROFILE: "default",
            XDG_CONFIG_HOME: path.join(cwd, "config"),
            XDG_DATA_HOME: path.join(cwd, "data"),
            XDG_CACHE_HOME: path.join(cwd, "cache"),
            XDG_STATE_HOME: path.join(cwd, "state"),
          },
        },
      });
      const logger = createTestLogger();
      const registry = buildProviderRegistry(logger, { providerOverrides });
      const client = registry[providerId]!.createClient(logger);
      let session: AgentSession | undefined;
      try {
        session = await client.createSession({ provider: providerId, cwd });
        expect(session.provider).toBe(providerId);
      } finally {
        await session?.close();
        await client.shutdown?.();
        await rm(cwd, { recursive: true, force: true });
      }
    },
    30_000,
  );
}
