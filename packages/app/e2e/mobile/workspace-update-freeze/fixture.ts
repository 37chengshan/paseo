import type { SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { startIsolatedHostDaemon } from "../../support/helpers/isolated-host-daemon";
import { connectDaemonClient } from "../../support/helpers/daemon-client-loader";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import net from "node:net";

interface FixtureClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  fetchWorkspaces(options: {
    page: { limit: number };
    subscribe: Record<string, never>;
  }): Promise<{ entries: unknown[] }>;
  subscribeRawMessages(handler: (message: SessionOutboundMessage) => void): () => void;
}

async function main() {
  process.env.E2E_METRO_PORT = "8098";
  const root = path.resolve(".dev/workspace-update-freeze");
  const cwd = path.join(root, "repo");
  const home = path.join(root, "home");
  await mkdir(cwd, { recursive: true });
  await mkdir(home + "/projects", { recursive: true });
  for (const args of [
    ["init", "-b", "main"],
    ["config", "user.name", "Repro"],
    ["config", "user.email", "repro@example.com"],
  ])
    execFileSync("git", args, { cwd });
  await writeFile(cwd + "/README.md", "initial\n");
  execFileSync("git", ["add", "README.md"], { cwd });
  execFileSync("git", ["commit", "--allow-empty", "-m", "initial"], { cwd });
  const date = "2026-03-01T00:00:00.000Z";
  const project = {
    projectId: "prj_diag515a",
    rootPath: cwd,
    kind: "git",
    displayName: "Android reproduction",
    projectKey: null,
    customName: null,
    customIconRevision: null,
    createdAt: date,
    updatedAt: date,
    archivedAt: null,
  };
  const workspaces = Array.from({ length: 400 }, (_, i) => ({
    workspaceId: `wks_diag515a_${i}`,
    projectId: project.projectId,
    cwd,
    kind: "directory",
    displayName: `Workspace ${String(i).padStart(3, "0")}`,
    title: null,
    branch: null,
    worktreeRoot: null,
    baseBranch: "main",
    isPaseoOwnedWorktree: false,
    mainRepoRoot: cwd,
    createdAt: date,
    updatedAt: date,
    archivedAt: null,
    autoArchivedChangeRequestUrl: null,
    pinnedAt: null,
  }));
  await writeFile(home + "/projects/projects.json", JSON.stringify([project]));
  await writeFile(home + "/projects/workspaces.json", JSON.stringify(workspaces));
  const daemon = await startIsolatedHostDaemon("diag515a", { paseoHome: home, preserveHome: true });
  const client = await connectDaemonClient<FixtureClient>({
    clientIdPrefix: "diag515a",
    port: daemon.port,
  });
  const events: { at: number; payload: unknown }[] = [];
  client.subscribeRawMessages((m) => {
    if (m.type === "workspace_update") events.push({ at: Date.now(), payload: m.payload });
  });
  const initial = await client.fetchWorkspaces({ page: { limit: 200 }, subscribe: {} });
  console.log("INITIAL", initial.entries.length);
  const proxy = net.createServer((socket) => {
    const up = net.connect(daemon.port, "127.0.0.1");
    socket.pipe(up);
    up.pipe(socket);
    socket.on("error", () => up.destroy());
    up.on("error", () => socket.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(45151, "127.0.0.1", resolve));
  await writeFile(
    root + "/ready.json",
    JSON.stringify({ port: daemon.port, cwd, pid: daemon.getPid() }),
  );
  console.log("READY", daemon.port);
  const timer = setInterval(async () => {
    await writeFile(root + "/events.json", JSON.stringify(events));
  }, 1000);
  process.on("SIGTERM", async () => {
    clearInterval(timer);
    proxy.close();
    await client.close();
    await daemon.close();
    process.exit(0);
  });
  await new Promise(() => {});
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
