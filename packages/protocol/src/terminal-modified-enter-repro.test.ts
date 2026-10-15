import { describe, expect, it } from "vitest";
import { TerminalInputModeTracker } from "./terminal-input-mode";
import { encodeTerminalKeyInput } from "./terminal-key-input";

describe("Modified Enter negotiation", () => {
  it("answers a keyboard query split immediately after ESC", () => {
    const tracker = new TerminalInputModeTracker();
    tracker.feed("\x1b");
    expect(tracker.feed("[?u").responses).toEqual(["\x1b[?0u"]);
  });

  it("recognizes modified Enter after a program enables modifyOtherKeys level 2", () => {
    const tracker = new TerminalInputModeTracker();
    tracker.feed("\x1b[>4;2m");
    expect(tracker.supportsModifiedEnter()).toBe(true);
  });

  it("distinguishes Shift+Enter from Enter after modifyOtherKeys negotiation", () => {
    const tracker = new TerminalInputModeTracker();
    tracker.feed("\x1b[>4;2m");
    const options = { inputMode: tracker.getState() };
    expect(encodeTerminalKeyInput({ key: "Enter", shift: true }, options)).toBe("\x1b[27;2;13~");
    expect(encodeTerminalKeyInput({ key: "Enter" }, options)).toBe("\r");
  });
});
