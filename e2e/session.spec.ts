import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("refresh waits for session before showing login or authenticated content", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["fixture.aa7084084271"] })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/session", async (route) => {
    await gate;
    await route.continue();
  });
  await page.reload();
  await expect(page.getByRole("status")).toHaveText(localized["Checking session…"]);
  await expect(page.locator("main.login")).toHaveCount(0);
  await expect(page.getByLabel(localized["Password"], { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole("button", { name: localized["fixture.aa7084084271"] })).toBeVisible();
  await expect(page.getByLabel(localized["Password"], { exact: true })).toHaveCount(0);
});

test("session failure offers retry and only 401 shows login", async ({
  page,
}) => {
  await page.route("**/api/v1/session", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Session unavailable" }),
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Session unavailable");
  await expect(page.getByLabel(localized["Password"], { exact: true })).toHaveCount(0);
  await page.unroute("**/api/v1/session");
  await page.getByRole("button", { name: localized["Retry"], exact: true }).click();
  await expect(page.getByLabel(localized["Password"], { exact: true })).toBeVisible();
});
