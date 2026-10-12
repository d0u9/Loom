import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("phone layout stays stable when touch detection changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  const create = page.getByRole("button", { name: localized["fixture.aa7084084271"], exact: true });
  await expect(create).toBeVisible();
  const before = await create.boundingBox();
  const searchBefore = await page.locator(".page-search").boundingBox();
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  await expect
    .poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches))
    .toBe(true);
  expect(await create.boundingBox()).toEqual(before);
  expect(await page.locator(".page-search").boundingBox()).toEqual(
    searchBefore,
  );
});
