import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("long group menus scroll with keyboard and long Item lists keep drop targets", async ({
  page,
}, info) => {
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["New item"] })).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  for (let i = 0; i < 25; i++) {
    const response = await page.request.post("/api/v1/items", {
      headers: { "x-csrf-token": csrf },
      data: {
        name: "Long " + info.project.name + i,
        itemGroup: "Keyboard" + String(i).padStart(2, "0"),
        categoryIds: [],
        requestId: crypto.randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  const tabs = page.getByRole("tablist", { name: localized["Item groups"] });
  await expect(page.locator("html")).toHaveCSS("scrollbar-gutter", "stable");
  const geometry = () =>
    page.locator(".page-header").evaluate((el) => {
      const { x, width } = el.getBoundingClientRect();
      return { x, width };
    });
  const beforeFilter = await geometry();
  await tabs.getByRole("tab", { name: localized["Ungrouped"], exact: true }).click();
  expect(await geometry()).toEqual(beforeFilter);
  await tabs.getByRole("tab", { name: localized["All"], exact: true }).click();
  expect(await geometry()).toEqual(beforeFilter);

  if (info.project.name === "mobile") {
    await expect(tabs).toHaveCSS("flex-wrap", "nowrap");
    const heights = await tabs
      .getByRole("tab")
      .evaluateAll((elements) =>
        elements.map((el) => el.getBoundingClientRect().y),
      );
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
    await expect(tabs).toHaveCSS("--fade-right", "24px");
    await tabs.evaluate((el) => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
    await expect(tabs).toHaveAttribute("data-fade-left", "true");
    await expect(tabs).toHaveAttribute("data-fade-right", "true");
    await expect(tabs).toHaveCSS("--fade-left", "24px");
    await tabs.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await expect(tabs).toHaveAttribute("data-fade-right", "true");
    await expect(tabs).toHaveAttribute("data-fade-left", "false");
    await tabs.getByRole("tab").first().focus();
    await page.keyboard.press("End");
    await expect(tabs).toHaveAttribute("data-fade-left", "true");
    await expect(tabs).toHaveAttribute("data-fade-right", "false");
    await page.keyboard.press("Home");
    await expect(tabs).toHaveAttribute("data-fade-left", "false");
    await expect(tabs).toHaveAttribute("data-fade-right", "true");
  } else {
    await expect(tabs).toHaveCSS("flex-wrap", "wrap");
    await expect(tabs).toHaveCSS("mask-image", "none");
  }
  await page.getByRole("button", { name: localized["New item"], exact: true }).click();
  const input = page.getByRole("combobox", { name: localized["Catalog group"], exact: true });
  await input.click();
  await input.press("ArrowUp");
  const options = page.locator(".combobox-options");
  await expect(options).toHaveCSS("scrollbar-width", "thin");
  const expectedScrollbar = await options.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--faint").trim(),
  );
  await expect(options).toHaveCSS("scrollbar-color", /rgba?\(/);
  expect(expectedScrollbar).not.toBe("");
  await expect(options.locator(".active")).toHaveText(
    (await options.getByRole("option").last().textContent())!,
  );
  const visible = () =>
    options.evaluate((list) => {
      const active = list.querySelector(".active")!.getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      return active.top >= bounds.top && active.bottom <= bounds.bottom + 1;
    });
  await expect.poll(visible).toBe(true);
  await input.press("ArrowDown");
  await expect(options.locator(".active")).toHaveText(localized["Ungrouped"]);
  await expect.poll(visible).toBe(true);
  for (let i = 0; i < 20; i++) await input.press("ArrowDown");
  await expect.poll(visible).toBe(true);
  const selected = await options.locator(".active").textContent();
  await input.press("Enter");
  await expect(input).toHaveValue(selected!);
  await page.keyboard.press("Escape");
  const row = page.getByRole("article").last();
  const name = await row.getByRole("heading").textContent();
  await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const tag = page.getByRole("tab", { name: "Keyboard00", exact: true });
  await tag.evaluate((el) =>
    el.scrollIntoView({ block: "nearest", inline: "nearest" }),
  );
  const source = (await row.locator(".card-open").boundingBox())!;
  const target = (await tag.boundingBox())!;
  expect(target.y).toBeGreaterThanOrEqual(0);
  const from = { x: source.x + 16, y: source.y + 20 };
  const to = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };
  if (info.project.name === "mobile") {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [from],
    });
    await page.waitForTimeout(300);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [to],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/v1/items")).json()).find(
          (item: any) => item.name === name,
        ).itemGroup,
    )
    .toBe("Keyboard00");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
