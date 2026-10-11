import { expect, test } from "vitest";
import {
  mapCodexToolCallFromThreadItem,
  splitCodexMcpToolResultImages,
} from "./tool-call-mapper.js";

test("Codex screenshot metadata takes the existing image extraction path", () => {
  const result = {
    content: [{ type: "text", text: "Captured screenshot" }],
    _meta: {
      "codex/toolSurface": {
        screenshot: { url: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==", width: 1280 },
      },
    },
  };
  const mapped = mapCodexToolCallFromThreadItem({
    type: "mcpToolCall",
    id: "screenshot",
    server: "node_repl",
    tool: "js",
    status: "completed",
    result,
  });
  expect(JSON.stringify(mapped)).not.toContain("data:image");
  expect(splitCodexMcpToolResultImages(result).images).toEqual([
    { data: "/9j/4AAQSkZJRgABAQ==", mimeType: "image/jpeg" },
  ]);
});
