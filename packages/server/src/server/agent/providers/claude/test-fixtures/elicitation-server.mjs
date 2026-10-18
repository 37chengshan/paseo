import readline from "node:readline";
import { appendFileSync } from "node:fs";

const auditPath = process.argv[2];
let toolRequestId;
function send(message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
}
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      id: message.id,
      result: {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "elicitation-repro", version: "1.0.0" },
      },
    });
  } else if (message.method === "tools/list") {
    send({
      id: message.id,
      result: {
        tools: [
          {
            name: "confirm_action",
            description: "Ask the user for confirmation. Performs no external action.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    });
  } else if (message.method === "tools/call") {
    toolRequestId = message.id;
    appendFileSync(auditPath, JSON.stringify({ event: "elicitation_requested" }) + "\n");
    send({
      id: "approval-1",
      method: "elicitation/create",
      params: {
        mode: "form",
        message: "Approve this local diagnostic action? No message will be sent.",
        requestedSchema: { type: "object", properties: {} },
      },
    });
  } else if (message.id === "approval-1") {
    appendFileSync(auditPath, JSON.stringify({ event: "elicitation_response", ...message }) + "\n");
    send({
      id: toolRequestId,
      result: {
        content: [
          {
            type: "text",
            text:
              message.result?.action === "decline"
                ? "Action confirm_action was declined by the user."
                : JSON.stringify(message.result ?? message.error),
          },
        ],
      },
    });
  } else if (message.id !== undefined) {
    send({ id: message.id, result: {} });
  }
});
