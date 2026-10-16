import { page, userEvent } from "@vitest/browser/context";
import { expect, test } from "vitest";
import { TerminalEmulatorRuntime } from "./terminal-emulator-runtime";

function mountTerminal() {
  const inputs: string[] = [];
  const root = document.createElement("div");
  root.style.cssText = "width:720px;height:360px";
  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%";
  root.append(host);
  document.body.append(root);
  const runtime = new TerminalEmulatorRuntime({ isMac: false });
  runtime.setCallbacks({ callbacks: { onInput: (data) => inputs.push(data) } });
  runtime.mount({ root, host, initialSnapshot: null, scrollback: 1000, theme: {} });
  return {
    inputs,
    dispose: () => {
      runtime.unmount();
      root.remove();
    },
  };
}

test("image-only Ctrl+V reaches a local TUI's native clipboard handler", async () => {
  const terminal = mountTerminal();
  try {
    await userEvent.click(page.getByRole("textbox", { name: "Terminal input" }));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
    const png = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    expect(await navigator.clipboard.readText()).toBe("");
    expect((await navigator.clipboard.read())[0]!.types).toContain("image/png");

    await userEvent.keyboard("{Control>}v{/Control}");

    await expect.poll(() => terminal.inputs).toContain("\x16");
  } finally {
    terminal.dispose();
  }
});

test("Ctrl+V continues to paste clipboard text", async () => {
  const terminal = mountTerminal();
  try {
    await userEvent.click(page.getByRole("textbox", { name: "Terminal input" }));
    await navigator.clipboard.writeText("clipboard text control");
    await userEvent.keyboard("{Control>}v{/Control}");
    await expect.poll(() => terminal.inputs).toEqual(["clipboard text control"]);
  } finally {
    terminal.dispose();
  }
});
