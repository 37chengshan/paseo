import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import base from "./vitest.config";

// Run only the intentionally failing #3725 reproduction with clipboard access.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects: [
      {
        extends: true,
        test: {
          name: "clipboard-repro",
          include: ["src/terminal/runtime/terminal-image-paste.browser.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              contextOptions: { permissions: ["clipboard-read", "clipboard-write"] },
            }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
