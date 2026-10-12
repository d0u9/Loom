import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("row tools collapse on mobile and remain visible on desktop", async ({
  page,
}, info) => {
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await page.getByRole("button", { name: localized["fixture.aa7084084271"], exact: true }).click();
  const name = "Tools " + info.project.name;
  await page.getByLabel(localized["Name"], { exact: true }).fill(name);
  await page.getByRole("button", { name: localized["Save"], exact: true }).click();
  const row = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  const edit = row.getByRole("button", { name: localized["Edit"], exact: true });
  if (info.project.name === "mobile") {
    await expect(edit).toBeHidden();
    const toggle = row.getByLabel(localized["Actions "] + name, { exact: true });
    const before = await row.locator(".item-summary").boundingBox();
    await toggle.click();
    await expect(edit).toBeVisible();
    await expect(row.locator(".action-tools-content")).toHaveCSS(
      "position",
      "absolute",
    );
    await expect(row).toHaveClass(/tools-open/);
    await expect
      .poll(async () => (await row.locator(".item-summary").boundingBox())!.x)
      .toBeLessThan(before!.x - 40);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await toggle.click();
    await expect(edit).toBeHidden();
    await toggle.click();
    await expect(edit).toBeVisible();
    await page.locator(".page-header h2").click();
    await expect(edit).toBeHidden();
    await expect(row).not.toHaveClass(/tools-open/);
    await toggle.click();
    await expect(edit).toBeVisible();
    await toggle.focus();
    await page.keyboard.press("Escape");
    await expect(edit).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.click();
  }
  await edit.click();
  await expect(page.getByRole("dialog", { name: localized["fixture.bba3a4dd9b5b"] })).toBeVisible();
});
