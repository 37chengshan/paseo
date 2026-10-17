import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";
import { realClaudeRewindSdk, revertClaudeConversation } from "./rewind.js";

interface TranscriptEntry {
  uuid: string;
  sessionId: string;
  subtype?: string;
  forkedFrom?: { messageUuid: string };
  compactMetadata?: {
    preservedSegment: {
      headUuid: string;
      anchorUuid: string;
      tailUuid: string;
    };
    preservedMessages: {
      anchorUuid: string;
      uuids: string[];
      allUuids: string[];
    };
  };
}

function parseEntries(text: string): TranscriptEntry[] {
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as TranscriptEntry);
}

// Fixture from PR #3938, commit 374b08f9d56d9dabc62f8e4e01acc73d1c619548.
// This proves stale metadata, not the reported model context overflow.
test("keeps compaction references attached to forked messages", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".compacted-rewind-"));
  try {
    const fixture = await readFile(
      new URL(
        "./test-fixtures/issue-3837-compacted-session.jsonl",
        import.meta.url
      ),
      "utf8"
    );
    const entries = parseEntries(fixture);
    const sourceSessionId = entries[0]!.sessionId;
    const transcriptPath = path.join(root, `${sourceSessionId}.jsonl`);
    await writeFile(transcriptPath, fixture);
    let forkId = sourceSessionId;
    await revertClaudeConversation({
      sdk: realClaudeRewindSdk,
      sessionId: sourceSessionId,
      transcriptPath,
      messageId: entries.at(-1)!.uuid,
      setSessionId: (id) => {
        forkId = id;
      },
    });
    const fork = parseEntries(
      await readFile(path.join(root, `${forkId}.jsonl`), "utf8")
    );
    const ids = new Map(
      fork.map((entry) => [entry.forkedFrom?.messageUuid, entry.uuid])
    );
    const remap = (id: string) => ids.get(id) ?? id;
    const source = entries.find(
      (entry) => entry.subtype === "compact_boundary"
    )!.compactMetadata!;
    const actual = fork.find((entry) => entry.subtype === "compact_boundary")!
      .compactMetadata!;
    expect(actual).toEqual({
      ...source,
      preservedSegment: {
        headUuid: remap(source.preservedSegment.headUuid),
        anchorUuid: remap(source.preservedSegment.anchorUuid),
        tailUuid: remap(source.preservedSegment.tailUuid),
      },
      preservedMessages: {
        anchorUuid: remap(source.preservedMessages.anchorUuid),
        uuids: source.preservedMessages.uuids.map(remap),
        allUuids: source.preservedMessages.allUuids.map(remap),
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
