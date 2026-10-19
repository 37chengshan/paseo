import { expect, test, type Page } from "playwright/test";

async function chooseLanguage(page: Page, language: string) {
  await page
    .getByRole("combobox", { name: /^(Language|语言)$/ })
    .first()
    .selectOption({ label: language });
}

function describeAlternates(links: Element[]): string[] {
  return links.map((link) => `${link.getAttribute("hreflang")} ${link.getAttribute("href")}`);
}

test.describe("server-rendered Chinese pages", () => {
  test.use({ javaScriptEnabled: false });

  test("render in Chinese with matching language metadata before any script runs", async ({
    page,
  }) => {
    await page.goto("/zh-CN/docs/cli");

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page).toHaveTitle("CLI 参考 - Paseo 文档");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/CLI 参考$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://paseo.sh/zh-CN/docs/cli",
    );
    const alternates = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll(describeAlternates);
    expect(alternates).toEqual([
      "en https://paseo.sh/docs/cli",
      "zh-CN https://paseo.sh/zh-CN/docs/cli",
      "x-default https://paseo.sh/docs/cli",
    ]);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "zh_CN");
  });

  test("keep English pages at their unprefixed URLs", async ({ page }) => {
    await page.goto("/docs/cli");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/CLI reference$/);
  });

  test("land translated anchors on the English section ids", async ({ page }) => {
    await page.goto("/zh-CN/docs/cli#running-agents");

    await expect(page.locator("#running-agents")).toHaveText(/运行 Agent/);
    await expect(page.locator("main")).not.toContainText("{#");
  });

  test("show the app's Chinese labels in the homepage mockup", async ({ page }) => {
    await page.goto("/zh-CN");

    const mockup = page.getByRole("img", {
      name: "Paseo 桌面应用，并排打开了编程 Agent、一段对话和一份代码 diff",
    });
    await expect(mockup).toContainText("新建工作区");
    await expect(mockup).toContainText("待查看");
    await expect(mockup).toContainText("给 Agent 发消息");
    await expect(mockup).not.toContainText("Ready to review");
  });
});

test("switches language on the same page, keeping the query and then every link", async ({
  page,
}) => {
  await page.goto("/plugins/all?q=dark");
  await chooseLanguage(page, "简体中文");

  await expect(page).toHaveURL(/\/zh-CN\/plugins\/all\?q=dark$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("searchbox", { name: "搜索插件" })).toHaveValue("dark");

  await page.getByRole("link", { name: "文档", exact: true }).first().click();
  await expect(page).toHaveURL(/\/zh-CN\/docs$/);

  await chooseLanguage(page, "English");
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("offers the language selector on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await chooseLanguage(page, "简体中文");

  await expect(page).toHaveURL(/\/zh-CN$/);
  await page.screenshot({ path: test.info().outputPath("mobile-zh-home.png") });
});

test("finds plugins by their Chinese and English listing text", async ({ page }) => {
  await page.goto(`/zh-CN/plugins/all?q=${encodeURIComponent("深色")}`);
  await expect(page.getByRole("link", { name: /Dracula/ })).toBeVisible();

  await page.goto(`/zh-CN/plugins/all?q=${encodeURIComponent("传令官")}`);
  await expect(page.getByRole("link", { name: /传令官/ })).toBeVisible();

  await page.goto("/zh-CN/plugins/all?q=herald");
  await expect(page.getByRole("link", { name: /传令官/ })).toBeVisible();
});

test("shows a translated plugin overview, or the English one under a notice", async ({ page }) => {
  await page.goto("/zh-CN/plugins/omercnet/dracula");
  await expect(page.getByRole("heading", { name: "行为" })).toBeVisible();
  await expect(page.getByRole("note")).toHaveCount(0);

  await page.goto("/zh-CN/plugins/gpambrozio/herald");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("传令官");
  await expect(page.getByRole("note")).toHaveText(
    "该插件的概览尚未翻译为你的语言，因此以英文显示。",
  );
  await expect(page.getByRole("heading", { name: "Behavior" })).toBeVisible();
});

test("shows the changelog in Chinese", async ({ page }) => {
  await page.goto("/zh-CN/changelog");

  await expect(page.getByRole("heading", { name: "新增" }).first()).toBeVisible();
  await expect(page.getByRole("note")).toHaveCount(0);
});
