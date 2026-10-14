import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("check circles align across section depths", async ({ page }, info) => {
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
  const sections = [0, 1, 2].map((i) => ({
    id: crypto.randomUUID(),
    name: "Section " + i,
    parentSectionId: null as string | null,
  }));
  sections[1].parentSectionId = sections[0].id;
  sections[2].parentSectionId = sections[0].id;
  const entries = [null, ...sections.map((s) => s.id)].map((sectionId, i) => ({
    id: crypto.randomUUID(),
    sectionId,
    name: "Aligned " + i,
    itemId: null,
    quantity: "",
    unit: "",
    note: "",
    checked: false,
  }));
  const response = await page.request.post("/api/v1/documents", {
    headers: { "x-csrf-token": csrf },
    data: {
      kind: "checklist",
      name: "Aligned checklist",
      sections,
      entries,
      requestId: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBe(true);
  const doc = await response.json();
  await page.goto("/checklists/" + doc.id);
  const positions = [];
  for (const entry of entries) {
    const circle = page.getByRole("checkbox", {
      name: localized["Check "] + entry.name,
      exact: true,
    });
    await expect(circle).toBeVisible();
    positions.push((await circle.boundingBox())!.x);
  }
  // Fold toggles share the check column of their level.
  const centre = async (l: any) => {
    const b = (await l.boundingBox())!;
    return b.x + b.width / 2;
  };
  const circle = (n: number) =>
    page.getByRole("checkbox", {
      name: localized["fixture.15feacff1ce5"] + n,
      exact: true,
    });
  const toggle = (n: number) =>
    page
      .locator(".section-heading", { hasText: "Section " + n })
      .locator(".section-toggle .icon");
  expect(
    Math.abs((await centre(toggle(0))) - (await centre(circle(1)))),
  ).toBeLessThan(1);
  // Mobile keeps one check column; its level-2 heading layout is pending review.
  if (info.project.name === "desktop")
    expect(
      Math.abs((await centre(toggle(1))) - (await centre(circle(2)))),
    ).toBeLessThan(1);
  if (info.project.name === "desktop") {
    expect(positions[1]).toBe(positions[0]);
    expect(positions[2] - positions[0]).toBe(16);
    expect(positions[3]).toBe(positions[2]);
  } else
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
  const row = page
    .getByRole("checkbox", {
      name: localized["fixture.e1774082acd5"],
      exact: true,
    })
    .locator(
      "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' entry ')][1]",
    );
  const before = await row.boundingBox();
  await page
    .getByRole("checkbox", {
      name: localized["fixture.e1774082acd5"],
      exact: true,
    })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: localized["fixture.e1774082acd5"],
      exact: true,
    }),
  ).toBeChecked();
  await expect(row.locator(".entry-name-display")).toHaveCSS(
    "text-decoration-line",
    "none",
  );
  await expect(row.locator(".entry-check > svg.lucide-check")).toBeVisible();
  await expect(row.locator(".entry-check > svg")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await expect(row).toHaveAttribute("data-completed", "true");
  await expect(row).toHaveCSS("background-image", /linear-gradient/);
  await expect(row).toHaveCSS("box-shadow", /inset/);
  const after = await row.boundingBox();
  expect(after!.height).toBe(before!.height);
  expect(after!.x).toBe(before!.x);
});
