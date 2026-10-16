import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "../support/fixtures";
import { seedMockAgentWorkspace, openAgentRoute } from "../support/helpers/mock-agent";
import { composerLocator, expectComposerVisible } from "../support/helpers/composer";
import { awaitAssistantMessage, expectAgentIdle } from "../support/helpers/agent-stream";

interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  tid: number;
  args?: { data?: { type?: string } };
}

/** Diagnostic target for #4810. The sizing contract still needs a maintainer decision. */
test("typing a sentence does not force synchronous layout in the input handler", async ({
  page,
}, testInfo) => {
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "composer-layout-",
    title: "Composer layout",
    initialPrompt: "Populate conversation",
    model: "ten-second-stream",
  });
  try {
    await openAgentRoute(page, agent);
    await expectComposerVisible(page);
    await awaitAssistantMessage(page);
    await expectAgentIdle(page);
    await warmComposer(page);
    const result = await traceTypingSentence(page);
    await writeFile(testInfo.outputPath("chromium.json"), result.trace);
    await testInfo.attach("synchronous-input-layout", {
      body: JSON.stringify(result.counts),
      contentType: "application/json",
    });
    expect(result.counts.inputEvents).toBe(result.text.length);
    expect(result.counts.layouts, "Input handlers must not synchronously force layout").toBe(0);
  } finally {
    await agent.cleanup();
  }
});

async function warmComposer(page: Page): Promise<void> {
  const composer = composerLocator(page);
  await composer.fill("Warm up");
  await composer.fill("");
  await composer.focus();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function traceTypingSentence(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline",
    transferMode: "ReturnAsStream",
  });
  const text = "The quick brown fox jumps over the lazy dog. ".repeat(3);
  await composerLocator(page).pressSequentially(text);
  await expect(composerLocator(page)).toHaveValue(text);
  const completed = new Promise<string>((resolve) =>
    cdp.once("Tracing.tracingComplete", (e) => resolve(e.stream!)),
  );
  await cdp.send("Tracing.end");
  const stream = await completed;
  let trace = "";
  for (;;) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    trace += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  await cdp.detach();
  const events = (JSON.parse(trace) as { traceEvents: TraceEvent[] }).traceEvents;
  const inputs = events.filter((e) => e.name === "EventDispatch" && e.args?.data?.type === "input");
  const nestedEvents = events.filter(
    (e) =>
      e.ph === "X" &&
      inputs.some(
        (input) => input.tid === e.tid && e.ts >= input.ts && e.ts < input.ts + (input.dur ?? 0),
      ),
  );
  return {
    text,
    trace,
    counts: {
      inputEvents: inputs.length,
      layouts: nestedEvents.filter((e) => e.name === "Layout").length,
      styleRecalculations: nestedEvents.filter((e) => e.name === "UpdateLayoutTree").length,
    },
  };
}
