import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("calendar schedules, marks and filters checklists", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await page.getByRole("link", { name: "Checklist", exact: true }).click();
  if (info.project.name === "mobile")
    await page.locator(".mobile-calendar summary").click();
  const calendar =
    info.project.name === "mobile"
      ? page.locator(".mobile-calendar .calendar")
      : page.locator("nav .calendar");
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await calendar.getByRole("button", { name: localized["Today"], exact: true }).click();
  await page.getByRole("button", { name: localized["fixture.b075aa0598f1"] }).click();
  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill("Calendar " + info.project.name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: localized["Create"], exact: true })
    .click();
  await page.getByRole("button", { name: localized["More actions"], exact: true }).click();
  await expect(page.getByLabel(localized["Use date"])).toHaveValue(today);
  await expect(
    calendar.getByRole("button", { name: `${today}${localized["fixture.14e214b51514"]}`, exact: true }),
  ).toBeVisible();
  await page.getByLabel(localized["Use date"]).fill("2026-12-25");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).toHaveText(localized["Saved"]);
  await expect(
    calendar.getByRole("button", { name: `${today}${localized["fixture.3d20571b98f5"]}`, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: localized["Back"], exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Calendar " + info.project.name,
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Checklist", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Calendar " + info.project.name,
      exact: true,
    }),
  ).toBeVisible();
  await calendar.getByRole("button", { name: localized["Today"], exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Calendar " + info.project.name,
      exact: true,
    }),
  ).toHaveCount(0);
  await calendar.getByRole("button", { name: localized["All checklists"], exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Calendar " + info.project.name,
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-calendar.png`,
    fullPage: true,
  });
});
