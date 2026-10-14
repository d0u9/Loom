import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("calendar schedules, marks and filters checklists", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await page
    .getByRole("link", { name: localized["Checklist"], exact: true })
    .click();
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
  if (info.project.name === "mobile") {
    expect(
      (await page.locator(".mobile-calendar").boundingBox())!.height,
    ).toBeLessThan(300);
    await expect(calendar.locator(".calendar-grid button").first()).toHaveCSS(
      "height",
      "28px",
    );
    const summary = page.locator(".mobile-calendar summary");
    const icon = (await summary.locator("svg").boundingBox())!;
    const label = (await summary.locator("span").boundingBox())!;
    expect(
      Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2),
    ).toBeLessThan(1);
  }
  await calendar
    .getByRole("button", { name: localized["Today"], exact: true })
    .click();
  await page
    .getByRole("button", { name: localized["fixture.9502ae5b9eb9"] })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill("Calendar " + info.project.name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: localized["Create"], exact: true })
    .click();
  await page
    .getByRole("button", { name: localized["More actions"], exact: true })
    .click();
  await expect(page.getByLabel(localized["Use date"])).toHaveValue(today);
  await expect(
    calendar.getByRole("button", {
      name: `${today}${localized["fixture.14e214b51514"]}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel(localized["Use date"]).fill("2026-12-25");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).toHaveText(localized["Saved"]);
  await expect(
    calendar.getByRole("button", {
      name: `${today}${localized["fixture.3d20571b98f5"]}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: localized["Back"], exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Calendar " + info.project.name,
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: localized["Checklist"], exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Calendar " + info.project.name,
      exact: true,
    }),
  ).toBeVisible();
  await calendar
    .getByRole("button", { name: localized["Today"], exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Calendar " + info.project.name,
      exact: true,
    }),
  ).toHaveCount(0);
  await calendar
    .getByRole("button", { name: localized["All checklists"], exact: true })
    .click();
  const progress = page.locator(".document-progress").first();
  await expect(progress.locator("svg")).toHaveCount(1);
  await expect(progress).toHaveAttribute(
    "aria-label",
    new RegExp(localized["fixture.c6605d585513"], ""),
  );
  await expect(progress).not.toContainText(localized["Completed"]);
  const card = progress.locator("xpath=ancestor::article");
  const dateBounds = (await card.locator(".document-date").boundingBox())!;
  const progressBounds = (await progress.boundingBox())!;
  const mainBounds = (await card.locator(".record-main").boundingBox())!;
  expect(dateBounds.x).toBeCloseTo(mainBounds.x, 0);
  expect(progressBounds.x + progressBounds.width).toBeCloseTo(
    mainBounds.x + mainBounds.width,
    0,
  );
  expect(
    Math.abs(
      dateBounds.y +
        dateBounds.height / 2 -
        progressBounds.y -
        progressBounds.height / 2,
    ),
  ).toBeLessThan(1);
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

test("checklist list aligns dates and progress when a date is absent", async ({
  page,
}, info) => {
  await page.goto("/checklists");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: localized["fixture.9502ae5b9eb9"],
      exact: true,
    }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  for (const [name, useDate] of [
    ["Undated alignment " + info.project.name, null],
    ["Dated alignment " + info.project.name, "2026-10-26"],
  ]) {
    const response = await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind: "checklist",
        name,
        useDate,
        entries: [],
        sections: [],
        requestId: crypto.randomUUID(),
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await page.reload();
  await page
    .getByRole("button", { name: localized["List"], exact: true })
    .click();
  const positions = [];
  for (const name of [
    "Undated alignment " + info.project.name,
    "Dated alignment " + info.project.name,
  ]) {
    const row = page.locator(".record-card", {
      has: page.getByRole("heading", { name, exact: true }),
    });
    await expect(row.locator(".document-progress")).toBeVisible();
    positions.push((await row.locator(".document-progress").boundingBox())!.x);
    await expect(row.locator(".document-meta-separator")).toBeHidden();
  }
  expect(Math.abs(positions[0] - positions[1])).toBeLessThan(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
