import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { getCheckoutDiff } from "./checkout-git.js";
import { diffFileChangeKind } from "../../../app/src/git/file-header-presentation";
import { createGitMetadataGenerator } from "../server/session/checkout/git-metadata-generator.js";

it.each(["rename", "copy"])(
  "preserves %s status for Changes and metadata prompts",
  async (operation) => {
    const cwd = mkdtempSync(join(tmpdir(), "paseo-rename-status-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
    try {
      git("init", "-b", "main");
      git("config", "user.name", "Test");
      git("config", "user.email", "test@example.com");
      const content = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n") + "\n";
      writeFileSync(join(cwd, "a.txt"), content);
      git("add", "a.txt");
      git("-c", "commit.gpgsign=false", "commit", "-m", "Initial");
      git("checkout", "-b", "feature");
      if (operation === "rename") git("mv", "a.txt", "b.txt");
      else {
        git("config", "diff.renames", "copies");
        writeFileSync(join(cwd, "b.txt"), content);
        writeFileSync(join(cwd, "a.txt"), content + "extra\n");
        git("add", "a.txt", "b.txt");
      }
      const status = git("diff", "--cached", "--name-status");
      expect(status).toContain(`${operation === "rename" ? "R" : "C"}100\ta.txt\tb.txt`);
      for (const mode of ["uncommitted", "base"] as const) {
        if (mode === "base") git("-c", "commit.gpgsign=false", "commit", "-m", operation);
        const diff = await getCheckoutDiff(cwd, {
          mode,
          baseRef: mode === "base" ? "main" : undefined,
          includeStructured: true,
        });
        const file = diff.structured!.find((file) => file.path === "b.txt")!;
        let prompt = "";
        const generator = createGitMetadataGenerator({
          workspaceGitService: {
            getCheckoutDiff: async () => diff,
            resolveRepoRoot: async () => cwd,
          },
          generation: {
            generate: async <T>(request: { prompt: string }): Promise<T> => {
              prompt = request.prompt;
              return { message: "Diagnostic", title: "Diagnostic", body: "Diagnostic" } as T;
            },
          },
        });
        if (mode === "base") await generator.generatePullRequestText(cwd, "main");
        else await generator.generateCommitMessage(cwd);
        console.log(
          JSON.stringify({
            operation,
            mode,
            status: status.trim(),
            file,
            changeKind: diffFileChangeKind(file),
            fileList: prompt.split("\n").filter((line) => /^[ADMRC]\t/.test(line)),
          }),
        );
        expect(file.oldPath).toBe("a.txt");
        expect.soft(diffFileChangeKind(file)).toBe(operation === "rename" ? "renamed" : "copied");
        expect.soft(prompt).toContain(`${operation === "rename" ? "R" : "C"}\ta.txt\tb.txt`);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  },
);
