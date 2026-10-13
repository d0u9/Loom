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
  await page.getByRole("button", { name: localized["New item"] }).click();
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
  await expect(page.getByRole("button", { name: localized["New item"] })).toBeFocused();
  await page.screenshot({
    path: `test-results/${info.project.name}-catalog.png`,
    fullPage: true,
  });
});

test("all sections share header actions and sidebar geometry", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  let baseline: { x: number; y: number; width: number; height: number } | null =
    null;
  for (const section of [localized["Item"], localized["Category"], localized["Template"], localized["Checklist"]]) {
    const navigation = page.getByRole("link", { name: section, exact: true });
    await expect(navigation).toHaveAttribute(
      "href",
      "/" +
        {
          [localized["Item"]]: "items",
          [localized["Category"]]: "categories",
          [localized["Template"]]: "templates",
          [localized["Checklist"]]: "checklists",
        }[section],
    );
    await expect(navigation.locator("svg")).toHaveCount(1);
    await expect(navigation).not.toHaveClass(/\bbutton\b/);
    await navigation.click();
    await expect(navigation).toHaveAttribute("aria-current", "page");
    if (info.project.name === "desktop") {
      await expect(navigation).toHaveCSS("font-size", "13px");
      await expect(navigation).toHaveCSS("line-height", "18px");
      await expect(navigation).toHaveCSS("height", "28px");
      await expect(navigation).toHaveCSS("font-weight", "400");
    } else {
      await expect(navigation.locator("span")).toBeHidden();
      await expect(navigation.locator("svg")).toBeVisible();
      expect((await navigation.boundingBox())!.height).toBeGreaterThanOrEqual(
        32,
      );
    }
    const header = page.locator(".page-header");
    await expect(header).toHaveCount(1);
    if (info.project.name === "mobile") {
      await expect(page.locator(".mobile-calendar")).toHaveCSS(
        "height",
        "32px",
      );
      await expect(page.locator(".page-search")).toHaveCSS("height", "32px");
    }
    await expect(header.locator(".view-switch")).toHaveCSS(
      "height",
      info.project.name === "mobile" ? "32px" : "28px",
    );
    await expect(
      header.getByRole("button", { name: localized["Cards"], exact: true }),
    ).toHaveCSS("width", info.project.name === "mobile" ? "32px" : "28px");
    await expect(
      header.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
    const before = await header.boundingBox();
    const actionsBefore = await header.locator(".page-actions").boundingBox();
    await header.getByRole("button", { name: localized["List"], exact: true }).click();
    await expect(page.locator(".records-list")).toHaveCount(1);
    expect(await header.boundingBox()).toEqual(before);
    expect(await header.locator(".page-actions").boundingBox()).toEqual(
      actionsBefore,
    );
    await expect(
      header.getByRole("button", { name: localized["List"], exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await header.getByRole("button", { name: localized["Cards"], exact: true }).click();
    await expect(page.locator(".cards")).toHaveCount(1);
    if (info.project.name === "mobile") {
      expect(
        await page
          .locator(".cards")
          .evaluate(
            (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
          ),
      ).toBe(2);
    }
    const create = header.getByRole("button", {
      name: localized["New "] + section,
      exact: true,
    });
    await expect(create).toBeVisible();
    if (info.project.name === "mobile")
      await expect(create).toHaveCSS("height", "32px");
    if (info.project.name === "mobile")
      await expect(create).toHaveCSS("width", "32px");
    const bounds = await create.boundingBox();
    if (!baseline) baseline = bounds;
    expect(bounds!.y).toBe(baseline!.y);
    expect(bounds!.x + bounds!.width).toBeCloseTo(
      baseline!.x + baseline!.width,
      0,
    );
    await create.click();
    const dialog = page.getByRole("dialog", {
      name: localized["New "] + section,
      exact: true,
    });
    await expect(dialog.locator(".resource-form")).toHaveCount(1);
    const name = dialog.getByLabel(localized["Name"], { exact: true });
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("required", "");
    await expect(name).toHaveAttribute("maxlength", "200");
    await expect(name).toHaveAttribute("data-1p-ignore", "true");
    await expect(name).toHaveAttribute("autocomplete", "off");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(create).toBeFocused();
    await expect(page.getByRole("navigation", { name: localized["Main navigation"] })).toHaveCount(
      1,
    );
  }
  // The list/cards choice is shared by every section and survives reloads.
  const shared = page.locator(".page-header");
  await shared.getByRole("button", { name: localized["List"], exact: true }).click();
  for (const section of [localized["Category"], localized["Template"], localized["Checklist"], localized["Item"]]) {
    await page.getByRole("link", { name: section, exact: true }).click();
    await expect(
      shared.getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".records-list")).toHaveCount(1);
    await expect(
      shared.getByRole("button", { name: localized["List"], exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page.reload();
  await expect(page.locator(".records-list")).toHaveCount(1);
  await shared.getByRole("button", { name: localized["Cards"], exact: true }).click();
  await page.getByRole("link", { name: localized["Category"], exact: true }).click();
  await expect(page.locator(".cards")).toHaveCount(1);
  const account = page.locator(".sidebar-account");
  await expect(account.locator(".account-name")).toHaveText("admin");
  const trigger = page.getByLabel(localized["Account menu"], { exact: true });
  await trigger.click();
  await expect(
    account.getByRole("button", { name: localized["Sign out"], exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(
    account.getByRole("button", { name: localized["Sign out"], exact: true }),
  ).toBeHidden();
  await trigger.click();
  await page.getByRole("searchbox", { name: localized["Search"], exact: true }).click();
  await expect(
    account.getByRole("button", { name: localized["Sign out"], exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("searchbox", { name: localized["Search"], exact: true }),
  ).toBeFocused();
  await trigger.click();
  await expect(
    account.getByRole("button", { name: localized["Sign out"], exact: true }),
  ).toBeVisible();
  await account.locator(".account-menu").click({ position: { x: 2, y: 2 } });
  await expect(
    account.getByRole("button", { name: localized["Sign out"], exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: `test-results/${info.project.name}-account-footer.png`,
  });
});

test("document actions use shared buttons with visible borders and keyboard activation", async ({
  page,
}, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for":
      info.project.name === "desktop" ? "192.0.2.41" : "192.0.2.42",
  });
  await page.goto("/templates");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await page.getByRole("button", { name: localized["fixture.8b6c722cd24d"], exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill("Buttons " + info.project.name);
  await page.getByRole("button", { name: localized["Create"], exact: true }).click();
  await page.getByRole("button", { name: localized["More actions"], exact: true }).click();
  const reload = page.getByRole("button", { name: localized["Reload"], exact: true });
  const remove = page.getByRole("button", { name: localized["Delete template"], exact: true });
  for (const button of [reload, remove]) {
    await expect(button).toHaveClass(/\bbutton\b/);
    await expect(button).toHaveCSS("border-top-style", "solid");
    await expect(button).toHaveCSS("border-top-width", "1px");
    await expect(button).toBeEnabled();
  }
  await expect(remove).toHaveClass(/\bdanger\b/);
  expect(await reload.evaluate((el) => getComputedStyle(el).color)).not.toBe(
    await remove.evaluate((el) => getComputedStyle(el).color),
  );
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll("button")].every((button) =>
        button.classList.contains("button"),
      ),
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-document-buttons.png`,
  });
  await reload.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .locator(".page-header")
      .getByRole("heading", { name: "Buttons " + info.project.name }),
  ).toBeVisible();
});
