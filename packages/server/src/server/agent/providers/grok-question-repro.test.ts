import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { ACPAgentSession } from "./acp-agent.js";
import { createTestLogger } from "../../../test-utils/test-logger.js";

// A deterministic ACP agent emits the native request captured in issue #3490.
// This exercises the public session API and SDK transport, without a live model.
const agentSource = `
import { Readable, Writable } from 'node:stream';
const { AgentSideConnection, PROTOCOL_VERSION, ndJsonStream } = await import(process.env.ACP_SDK_URL);
new AgentSideConnection(connection => ({
  async initialize() { return {protocolVersion:PROTOCOL_VERSION}; },
  async newSession() { return {sessionId:'question-repro'}; },
  async authenticate() {}, async cancel() {},
  async prompt() {
    let result;
    try {
      result = await connection.extMethod('_x.ai/ask_user_question', {
        sessionId:'question-repro', toolCallId:'question-1', mode:'default',
        questions:[{question:'Choose a color',options:[{label:'Red'},{label:'Blue'}],multiSelect:false}]
      });
    } catch(error) { result = {code:error.code,message:error.message}; }
    await connection.sessionUpdate({sessionId:'question-repro',update:{
      sessionUpdate:'agent_message_chunk', content:{type:'text',text:JSON.stringify(result)}
    }});
    return {stopReason:'end_turn'};
  }
}), ndJsonStream(Writable.toWeb(process.stdout),Readable.toWeb(process.stdin)));
`;

test("native Grok question reaches the permission interface and accepts the selected answer", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-grok-question-"));
  const script = path.join(directory, "agent.mjs");
  await writeFile(script, agentSource);
  const session = new ACPAgentSession(
    { provider: "grok", cwd: directory },
    {
      provider: "grok",
      logger: createTestLogger(),
      defaultCommand: [process.execPath, script],
      defaultModes: [],
      capabilities: {
        supportsStreaming: true,
        supportsSessionPersistence: true,
        supportsDynamicModes: true,
        supportsMcpServers: true,
        supportsReasoningStream: true,
        supportsToolInvocations: true,
      },
      launchEnv: {
        ACP_SDK_URL: pathToFileURL(
          createRequire(import.meta.url).resolve("@agentclientprotocol/sdk"),
        ).href,
      },
    },
  );
  const questions: unknown[] = [];
  const replies: string[] = [];
  let finish!: () => void;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  session.subscribe((event) => {
    if (event.type === "permission_requested") {
      questions.push(event.request);
      void session.respondToPermission(event.request.id, {
        behavior: "allow",
        updatedInput: {
          questionAnswers: { "Question 1": { selectedOptionIds: ["1"] } },
        },
      });
    }
    if (event.type === "timeline" && event.item.type === "assistant_message")
      replies.push(event.item.text);
    if (event.type === "turn_completed" || event.type === "turn_failed") finish();
  });
  try {
    await session.initializeNewSession();
    await session.startTurn("Ask me to choose a color.");
    await done;
    expect.soft(questions).toHaveLength(1);
    expect(replies.join("")).toBe(
      JSON.stringify({ outcome: "accepted", answers: { "Choose a color": ["Blue"] } }),
    );
    expect(session.getPendingPermissions()).toEqual([]);
  } finally {
    await session.close();
    await rm(directory, { recursive: true, force: true });
  }
});
