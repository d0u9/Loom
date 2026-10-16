import localized from "../locales/zh.json" with { type: "json" };
import { test, expect, type Locator } from "@playwright/test";

for (const kind of ["category", "template"] as const) {
  const field = kind === "category" ? "categories" : "templates";
  test(`${kind} sections drag, sort with keyboard, and retain data after reload`, async ({
    page,
  }, info) => {
    await page.goto("/" + field);
    await page
      .getByLabel(localized["Password"], { exact: true })
      .fill("loom-browser-password");
    await page
      .getByRole("button", { name: localized["Sign in"], exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: localized["New collection section"],
        exact: true,
      }),
    ).toBeVisible();
    const csrf = (await (await page.request.get("/api/v1/session")).json())
      .csrf;
    const make = async (name: string) => {
      const response = await page.request.post(
        kind === "category" ? "/api/v1/categories" : "/api/v1/documents",
        {
          headers: { "x-csrf-token": csrf },
          data:
            kind === "category"
              ? { name }
              : { name, kind, entries: [], requestId: crypto.randomUUID() },
        },
      );
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const a = await make("Section A " + info.project.name),
      b = await make("Section B " + info.project.name);
    const baseline = await (
      await page.request.get(`/api/v1/${kind}-layout`)
    ).json();
    expect(
      (
        await page.request.put(`/api/v1/${kind}-layout`, {
          headers: { "x-csrf-token": csrf },
          data: {
            ...baseline,
            rootPosition: 0,
            requestId: crypto.randomUUID(),
          },
        })
      ).ok(),
    ).toBe(true);
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: localized["Collapse "] + localized["Ungrouped"],
        exact: true,
      }),
    ).toBeVisible();
    const createSection = async (name: string) => {
      await page
        .getByRole("button", {
          name: localized["New collection section"],
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: localized["New collection section"],
        exact: true,
      });
      await dialog.getByLabel(localized["Name"], { exact: true }).fill(name);
      await dialog
        .getByRole("button", { name: localized["Save section"], exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      return (
        await (await page.request.get(`/api/v1/${kind}-layout`)).json()
      ).sections.find((s: any) => s.name === name);
    };
    const group = await createSection("Travel " + info.project.name);
    const second = await createSection("Home " + info.project.name);
    const card = (id: string) => page.locator(`[data-sort-id="c:${id}"]`);
    const heading = (id: string) => page.locator(`[data-sort-id="s:${id}"]`);
    const layout = async () =>
      await (await page.request.get(`/api/v1/${kind}-layout`)).json();
    const drag = async (source: Locator, target: Locator, after = true) => {
      await expect(
        heading(second.id).getByRole("button", {
          name: localized["Edit section "] + second.name,
          exact: true,
        }),
      ).toBeEnabled();
      await target.scrollIntoViewIfNeeded();
      const inside =
        after &&
        (await source.getAttribute("data-sort-id"))?.startsWith("c:") &&
        (await target.getAttribute("data-nest")) !== null;
      const background = await target.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      const feedback = async () => {
        if (!inside) return;
        await expect(target).toHaveClass(/drop-hover/);
        await expect(target).not.toHaveCSS("background-color", background);
      };
      const from = (await source.boundingBox())!,
        to = (await target.boundingBox())!;
      const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
      const end = {
        x: to.x + to.width / 2,
        y: to.y + to.height * (after ? 0.75 : 0.25),
      };
      if (info.project.name === "mobile") {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [start],
        });
        await page.waitForTimeout(300);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [end],
        });
        await feedback();
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await cdp.detach();
      } else {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await feedback();
        await page.mouse.up();
      }
    };
    await drag(card(a.id), heading(group.id));
    await expect
      .poll(
        async () =>
          (await layout())[field].find((c: any) => c.id === a.id).sectionId,
      )
      .toBe(group.id);
    await drag(card(b.id), card(a.id));
    await expect
      .poll(async () =>
        (await layout())[field]
          .filter((c: any) => c.sectionId === group.id)
          .map((c: any) => c.id),
      )
      .toEqual([a.id, b.id]);
    await expect(
      heading(group.id).getByRole("button", {
        name: localized["Edit section "] + group.name,
        exact: true,
      }),
    ).toBeEnabled();
    await card(b.id).focus();
    await card(b.id).press("ArrowUp");
    await expect
      .poll(async () =>
        (await layout())[field]
          .filter((c: any) => c.sectionId === group.id)
          .map((c: any) => c.id),
      )
      .toEqual([b.id, a.id]);
    await expect(
      heading(group.id).getByRole("button", {
        name: localized["Edit section "] + group.name,
        exact: true,
      }),
    ).toBeEnabled();
    await card(a.id).focus();
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(
        async () =>
          (await layout())[field].find((c: any) => c.id === a.id).sectionId,
      )
      .toBe(second.id);
    await expect(
      heading(second.id).getByRole("button", {
        name: localized["Edit section "] + second.name,
        exact: true,
      }),
    ).toBeEnabled();
    await expect(card(a.id)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(
        async () =>
          (await layout())[field].find((c: any) => c.id === a.id).sectionId,
      )
      .toBe(group.id);
    await expect(
      heading(second.id).getByRole("button", {
        name: localized["Edit section "] + second.name,
        exact: true,
      }),
    ).toBeEnabled();
    await expect(card(a.id)).toBeFocused();
    await heading(second.id).focus();
    await heading(second.id).press("ArrowUp");
    await expect
      .poll(async () =>
        (await layout()).sections.findIndex((s: any) => s.id === second.id),
      )
      .toBeLessThan(
        (await layout()).sections.findIndex((s: any) => s.id === group.id),
      );
    await drag(heading(group.id), heading("root"), false);
    await expect.poll(async () => (await layout()).rootPosition).toBe(1);
    await expect(
      page.locator(".collection-section-heading").first(),
    ).toHaveAttribute("data-sort-id", "s:" + group.id);
    await page.reload();
    await expect(
      page.locator(".collection-section-heading").first(),
    ).toHaveAttribute("data-sort-id", "s:" + group.id);
    await expect(card(a.id)).toBeVisible();
    await heading(group.id)
      .getByRole("button", {
        name: localized["Collapse "] + group.name,
        exact: true,
      })
      .click();
    await expect(card(a.id)).toHaveCount(0);
    await heading(group.id)
      .getByRole("button", {
        name: localized["Expand "] + group.name,
        exact: true,
      })
      .click();
    await page.screenshot({
      path: info.outputPath(`${kind}-sections.png`),
      fullPage: true,
    });
    await heading(group.id)
      .getByRole("button", {
        name: localized["Delete section "] + group.name,
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: localized["Delete"], exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await layout())[field].find((c: any) => c.id === a.id).sectionId,
      )
      .toBe(null);
    await expect(card(a.id)).toBeVisible();
    await heading("root")
      .getByRole("button", {
        name: localized["Collapse "] + localized["Ungrouped"],
        exact: true,
      })
      .click();
    await expect(card(a.id)).toHaveCount(0);
    await heading("root")
      .getByRole("button", {
        name: localized["Expand "] + localized["Ungrouped"],
        exact: true,
      })
      .click();
    await expect(card(a.id)).toBeVisible();
    await drag(heading("root"), heading(second.id));
    await expect
      .poll(async () => (await layout()).rootPosition)
      .toBe((await layout()).sections.length);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const finalLayout = await layout();
    expect(
      (
        await page.request.put(`/api/v1/${kind}-layout`, {
          headers: { "x-csrf-token": csrf },
          data: {
            ...finalLayout,
            sections: finalLayout.sections.filter(
              (s: any) => s.id !== second.id,
            ),
            rootPosition: 0,
            requestId: crypto.randomUUID(),
          },
        })
      ).ok(),
    ).toBe(true);
    for (const category of [a, b])
      expect(
        (
          await page.request.delete(`/api/v1/${field}/${category.id}`, {
            headers: { "x-csrf-token": csrf },
            data: {
              version: category.version,
              ...(kind === "template" ? { confirm: true } : {}),
            },
          })
        ).ok(),
      ).toBe(true);
  });
}
