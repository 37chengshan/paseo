import { expect, test } from "../support/fixtures";
import type { Page } from "@playwright/test";
import { openSettingsSection } from "../support/helpers/settings";

async function openDefaultAppearance(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("@paseo:app-settings", JSON.stringify({ codeFontSize: 12 }));
    const observations: unknown[] = [];
    Object.assign(window, { fontRaceObservations: observations });
    for (const type of ["input", "change", "keydown", "focusin", "focusout"]) {
      document.addEventListener(
        type,
        (event) => {
          const input = event.target as HTMLInputElement;
          if (!input?.getAttribute?.("aria-label")?.startsWith("Code font")) return;
          observations.push({
            type,
            label: input.getAttribute("aria-label"),
            value: input.value,
            key: (event as KeyboardEvent).key,
            at: performance.now(),
          });
        },
        true,
      );
    }
    new MutationObserver((records) => {
      for (const record of records)
        for (const removed of record.removedNodes) {
          if (
            removed instanceof Element &&
            (removed.matches('[aria-label="Code font size"]') ||
              removed.querySelector('[aria-label="Code font size"]'))
          )
            observations.push({ type: "removed-size-input", at: performance.now() });
        }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/settings");
  await openSettingsSection(page, "appearance");
}

async function changeCodeFamilyThenSize(page: Page) {
  await page.getByLabel("Code font family").fill("Courier New, Courier, monospace");
  await page.getByLabel("Code font family").press("Enter");
  await page.getByLabel("Code font size").fill("18");
  await page.getByLabel("Code font size").press("Enter");
}

test("keeps the size entered immediately after changing the code font family", async ({
  page,
}, testInfo) => {
  await openDefaultAppearance(page);
  try {
    await changeCodeFamilyThenSize(page);
    await expect(page.getByLabel("Code font size")).toHaveValue("18");
  } finally {
    await testInfo.attach("font-race", {
      body: JSON.stringify(
        await page.evaluate(() => ({
          events: (window as Window & { fontRaceObservations: unknown[] }).fontRaceObservations,
          stored: localStorage.getItem("@paseo:app-settings"),
        })),
        null,
        2,
      ),
      contentType: "application/json",
    });
  }
});
