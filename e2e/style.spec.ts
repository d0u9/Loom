import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("catalog modal layout, keyboard and autofill semantics", async ({
  page,
}, info) => {
  await page.goto("/");
  const password = page.getByLabel(localized["Password"], { exact: true });
  await expect(password).toHaveAttribute("autocomplete", "current-password");
  await expect(password).not.toHaveAttribute("data-1p-ignore", "true");
  await password.fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await page.getByRole("button", { name: localized["fixture.aa7084084271"] }).click();
  const modal = page.getByRole("dialog");
  const name = modal.getByLabel(localized["Name"], { exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("data-1p-ignore", "true");
  await expect(modal.getByLabel(localized["Note"])).toHaveAttribute(
    "data-1p-ignore",
    "true",
  );
  await name.fill("Egg");
  await modal.getByLabel(localized["Note"]).fill(localized["fixture.ac9c2fb37c7b"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const bounds = await modal.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: `test-results/${info.project.name}-item-modal.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("button", { name: localized["fixture.aa7084084271"] })).toBeFocused();
  await page.screenshot({
    path: `test-results/${info.project.name}-catalog.png`,
    fullPage: true,
  });
});

test("all sections share header actions and sidebar geometry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  let baseline: { x: number; y: number; width: number; height: number } | null =
    null;
  for (const section of ["Item", "Category", "Template", "Checklist"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    const header = page.locator(".page-header");
    await expect(header).toHaveCount(1);
    await expect(
      header.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
    const create = header.getByRole("button", {
      name: localized["New "] + section,
      exact: true,
    });
    await expect(create).toBeVisible();
    const bounds = await create.boundingBox();
    if (!baseline) baseline = bounds;
    expect(bounds!.y).toBe(baseline!.y);
    expect(bounds!.x + bounds!.width).toBeCloseTo(
      baseline!.x + baseline!.width,
      0,
    );
    await expect(page.getByRole("navigation", { name: localized["Main navigation"] })).toHaveCount(
      1,
    );
  }
});
