import localized from "../locales/zh.json" with { type: "json" };
import { test, expect, type Page } from "@playwright/test";

async function fixture(page: Page, suffix: string) {
  await page.goto("/items");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: localized["New item"], exact: true }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const create = async (path: string, data: any) => {
    const r = await page.request.post("/api/v1" + path, {
      headers: { "x-csrf-token": csrf },
      data: { ...data, requestId: crypto.randomUUID() },
    });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  const source = await create("/categories", {
    name: "Picker source " + suffix,
  });
  const target = await create("/categories", {
    name: "Picker target " + suffix,
  });
  const drink = localized["fixture.6b1aa0303ef2"] + suffix,
    food = localized["fixture.17fa9293fbd5"] + suffix;
  const milk = await create("/items", {
    name: localized["fixture.fbbf6e2d5b3c"] + suffix,
    itemGroup: drink,
    categoryIds: [source.id],
  });
  const egg = await create("/items", {
    name: localized["fixture.ca07603061d0"] + suffix,
    itemGroup: food,
    categoryIds: [source.id],
  });
  const bread = await create("/items", {
    name: localized["fixture.c9957a5975bb"] + suffix,
    categoryIds: [source.id],
  });
  const literalAll = await create("/items", {
    name: localized["fixture.6daea17911ac"] + suffix,
    itemGroup: "all",
    categoryIds: [source.id],
  });
  const member = await create("/items", {
    name: localized["fixture.bb7f69c6f53b"] + suffix,
    itemGroup: drink,
    categoryIds: [source.id, target.id],
  });
  return {
    create,
    source,
    target,
    drink,
    food,
    milk,
    egg,
    bread,
    literalAll,
    member,
  };
}
async function group(page: Page, label: string) {
  const input = page.getByRole("dialog").getByRole("combobox", {
    name: localized["Filter by catalog group"],
    exact: true,
  });
  await input.click();
  await input.fill(label);
  await input.press("Enter");
  await expect(input).toHaveValue(label);
}

for (const kind of ["template", "checklist"]) {
  test(`${kind} item picker combines groups and pinyin, including category picks without truncating bulk adds`, async ({
    page,
  }, info) => {
    const f = await fixture(page, kind + " " + info.project.name);
    const d = await f.create("/documents", {
      kind,
      name: "Picker " + kind,
      entries: [],
    });
    await page.goto(
      `/${kind === "template" ? "templates" : "checklists"}/${d.id}`,
    );
    await page
      .getByRole("button", { name: localized["Edit mode"], exact: true })
      .click();
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    const modal = page.getByRole("dialog", {
      name: localized["Add entries"],
      exact: true,
    });
    const section = modal.getByRole("combobox", {
      name: localized["Add to section"],
      exact: true,
    });
    // Opening via the arrow does not focus the input, so blur cannot close it.
    const search = modal.getByLabel(localized["fixture.bb732b6bd964"], {
      exact: true,
    });
    await search.focus();
    const toggle = section.locator("..").locator(".combobox-toggle");
    if (info.project.name === "mobile") await toggle.tap();
    else await toggle.click();
    await expect(section).not.toBeFocused();
    await expect(section).toHaveAttribute("aria-expanded", "true");
    const heading = modal.getByRole("heading", {
      name: localized["Add entries"],
      exact: true,
    });
    if (info.project.name === "mobile") await heading.tap();
    else await heading.click();
    await expect(section).toHaveAttribute("aria-expanded", "false");
    await expect(modal).toBeVisible();
    await section.click();
    await section.fill(localized["fixture.a337fe6999d4"]);
    await search.click();
    await expect(section).toHaveAttribute("aria-expanded", "false");
    await expect(section).toHaveValue(localized["Root"]);
    await expect(search).toBeFocused();
    await section.click();
    await modal
      .getByRole("option", { name: localized["Root"], exact: true })
      .click();
    await expect(section).toHaveAttribute("aria-expanded", "false");
    await expect(section).toHaveValue(localized["Root"]);
    await section.click();
    await section.press("Escape");
    await expect(section).toHaveAttribute("aria-expanded", "false");
    await expect(modal).toBeVisible();
    await group(page, f.drink);
    await expect(
      modal.getByRole("button", { name: f.milk.name, exact: true }),
    ).toBeVisible();
    await expect(
      modal.getByRole("button", { name: f.egg.name, exact: true }),
    ).toHaveCount(0);
    await modal
      .getByLabel(localized["fixture.bb732b6bd964"], { exact: true })
      .fill("jid");
    await expect(
      modal.getByText(localized["fixture.2a762fa51309"], { exact: true }),
    ).toBeVisible();
    await group(page, f.food);
    await expect(
      modal.getByRole("button", { name: f.egg.name, exact: true }),
    ).toBeVisible();
    await group(page, localized["All"]);
    await expect(
      modal.getByRole("button", { name: f.egg.name, exact: true }),
    ).toBeVisible();
    await modal
      .getByLabel(localized["fixture.bb732b6bd964"], { exact: true })
      .fill("");
    await group(page, localized["Ungrouped"]);
    await expect(
      modal.getByRole("button", { name: f.bread.name, exact: true }),
    ).toBeVisible();
    await expect(
      modal.getByRole("button", { name: f.milk.name, exact: true }),
    ).toHaveCount(0);
    await group(page, "all");
    await expect(
      modal.getByRole("button", { name: f.literalAll.name, exact: true }),
    ).toBeVisible();
    await expect(
      modal.getByRole("button", { name: f.bread.name, exact: true }),
    ).toHaveCount(0);
    await group(page, f.drink);
    const size = await modal.boundingBox();
    await modal
      .getByRole("tab", { name: localized["Add from categories"], exact: true })
      .click();
    expect(await modal.boundingBox()).toEqual(size);
    await expect(
      modal.getByRole("combobox", {
        name: localized["Filter by catalog group"],
        exact: true,
      }),
    ).toBeDisabled();
    await modal
      .getByLabel(localized["fixture.ccb9b92a9911"], { exact: true })
      .fill(f.source.name);
    await modal
      .getByRole("button", {
        name: localized["From "] + f.source.name + localized[" Choose item"],
        exact: true,
      })
      .click();
    const picker = page.getByRole("dialog", {
      name: localized["Choose item from category"],
      exact: true,
    });
    await expect(
      picker.getByRole("button", { name: f.milk.name, exact: true }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: f.egg.name, exact: true }),
    ).toHaveCount(0);
    await group(page, f.food);
    await picker
      .getByLabel(localized["fixture.bb732b6bd964"], { exact: true })
      .fill("jid");
    await picker.getByRole("button", { name: f.egg.name, exact: true }).click();
    const save = async (count: number) => {
      const open = page.getByRole("dialog");
      await expect(open).toBeVisible();
      await open
        .getByRole("button", { name: localized["Done"], exact: true })
        .click();
      await expect(page.getByRole("status")).toHaveText(localized["Saved"]);
      await expect
        .poll(
          async () =>
            (await (await page.request.get(`/api/v1/documents/${d.id}`)).json())
              .entries.length,
        )
        .toBe(count);
    };
    await save(1);
    const first = await (
      await page.request.get(`/api/v1/documents/${d.id}`)
    ).json();
    expect(first.entries.map((e: any) => e.itemId)).toEqual([f.egg.id]);
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    await modal
      .getByRole("tab", { name: localized["Add from items"], exact: true })
      .click();
    await group(page, f.food);
    await modal
      .getByLabel(localized["fixture.bb732b6bd964"], { exact: true })
      .fill("jid");
    await modal.getByRole("button", { name: f.egg.name, exact: true }).click();
    await expect(modal).toBeVisible();
    await expect(
      modal.getByLabel(localized["fixture.bb732b6bd964"], { exact: true }),
    ).toHaveValue("");
    await modal
      .getByLabel(localized["fixture.bb732b6bd964"], { exact: true })
      .fill("");
    await group(page, f.drink);
    const drinks = (await (await page.request.get("/api/v1/items")).json())
      .filter((i: any) => i.itemGroup === f.drink)
      .map((i: any) => i.id);
    await modal
      .getByRole("button", {
        name: localized["Add whole group "] + f.drink,
        exact: true,
      })
      .click();
    await save(1 + drinks.length);
    expect(
      (
        await (await page.request.get(`/api/v1/documents/${d.id}`)).json()
      ).entries.map((e: any) => e.itemId),
    ).toEqual([f.egg.id, ...drinks]);
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    await modal
      .getByRole("tab", { name: localized["Add from categories"], exact: true })
      .click();
    await modal
      .getByLabel(localized["fixture.ccb9b92a9911"], { exact: true })
      .fill(f.source.name);
    await modal
      .getByRole("button", {
        name: localized["Add category "] + f.source.name,
        exact: true,
      })
      .click();
    await save(5);
    const stored = await (
      await page.request.get(`/api/v1/documents/${d.id}`)
    ).json();
    expect(new Set(stored.entries.map((e: any) => e.itemId))).toEqual(
      new Set([f.milk.id, f.egg.id, f.bread.id, f.literalAll.id, f.member.id]),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("category member picker excludes members, clears stale selections and keeps groups during continuous adding", async ({
  page,
}, info) => {
  const f = await fixture(page, "category " + info.project.name);
  await page.goto("/categories/" + f.target.id);
  await page
    .getByRole("button", { name: localized["Add members"], exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: localized["Add members"],
    exact: true,
  });
  const select = modal.getByRole("combobox", {
    name: localized["Add existing item"],
    exact: true,
  });
  await group(page, f.drink);
  await select.click();
  await expect(
    page.getByRole("option", { name: f.member.name, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: f.egg.name, exact: true }),
  ).toHaveCount(0);
  await select.fill("niunai");
  await select.press("Enter");
  await expect(select).toHaveValue(f.milk.name);
  await group(page, f.food);
  await expect(select).toHaveValue("");
  await expect(
    modal.getByRole("button", { name: localized["Add members"], exact: true }),
  ).toBeDisabled();
  await select.fill("jid");
  await select.press("Enter");
  await modal
    .getByRole("button", { name: localized["Add members"], exact: true })
    .click();
  await expect(select).toHaveValue("");
  await expect(
    modal.getByRole("combobox", {
      name: localized["Filter by catalog group"],
      exact: true,
    }),
  ).toHaveValue(f.food);
  await select.click();
  await expect(
    page.getByRole("option", { name: f.egg.name, exact: true }),
  ).toHaveCount(0);
  await group(page, localized["Ungrouped"]);
  await select.fill("mianbao");
  await expect(
    page.getByRole("option", { name: f.bread.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: f.bread.name, exact: true }).click();
  await modal
    .getByRole("button", { name: localized["Add members"], exact: true })
    .click();
  await expect(select).toHaveValue("");
  const items = await (await page.request.get("/api/v1/items")).json();
  expect(items.find((i: any) => i.id === f.egg.id).categoryIds).toContain(
    f.target.id,
  );
  expect(items.find((i: any) => i.id === f.bread.id).categoryIds).toContain(
    f.target.id,
  );
  expect(items.find((i: any) => i.id === f.milk.id).categoryIds).not.toContain(
    f.target.id,
  );
  await group(page, f.drink);
  await modal
    .getByRole("button", {
      name: new RegExp(localized["fixture.c70d38674b4f"], ""),
    })
    .click();
  await expect
    .poll(async () =>
      (await (await page.request.get("/api/v1/items")).json())
        .find((i: any) => i.id === f.milk.id)
        .categoryIds.includes(f.target.id),
    )
    .toBe(true);
  await group(page, localized["All"]);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: localized["fixture.3e8e498593dc"],
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Add members", exact: true }).click();
  await expect(
    page.getByRole("combobox", {
      name: "Filter by catalog group",
      exact: true,
    }),
  ).toHaveValue("All");
});

for (const kind of ["template", "checklist"]) {
  test(`${kind} creates catalog items into the selected section with safe retries and continuous input`, async ({
    page,
  }, info) => {
    const f = await fixture(page, "new " + kind + " " + info.project.name);
    const sectionId = crypto.randomUUID();
    const d = await f.create("/documents", {
      kind,
      name: "Create items " + kind,
      entries: [],
      sections: [
        {
          id: sectionId,
          name: localized["fixture.fa1915720634"],
          parentSectionId: null,
        },
      ],
    });
    const path = `/${kind === "template" ? "templates" : "checklists"}/${d.id}`;
    await page.goto(path);
    await page
      .getByRole("button", { name: localized["Edit mode"], exact: true })
      .click();
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: localized["Add entries"],
      exact: true,
    });
    const section = picker.getByRole("combobox", {
      name: localized["Add to section"],
      exact: true,
    });
    await section.fill(localized["fixture.fa1915720634"]);
    await section.press("Enter");
    await group(page, f.food);
    await picker
      .getByLabel(localized["fixture.bb732b6bd964"], { exact: true })
      .fill(localized["fixture.e9f5b71a472d"]);
    const newButton = picker.getByRole("button", {
      name: localized["Create item and add"],
      exact: true,
    });
    await newButton.click();
    const form = page.getByRole("dialog", {
      name: localized["New item"],
      exact: true,
    });
    await expect(page.locator("dialog")).toHaveCount(1);
    await expect(page.locator("dialog:modal")).toHaveCount(1);
    const name = form.getByLabel(localized["Name"], { exact: true });
    await expect(name).toBeFocused();
    await expect(
      form.getByRole("combobox", {
        name: localized["Catalog group"],
        exact: true,
      }),
    ).toHaveValue(f.food);
    const cancelled = "Cancelled catalog " + kind + info.project.name;
    await name.fill(cancelled);
    await form
      .getByRole("button", { name: localized["Cancel"], exact: true })
      .click();
    await expect(form).toHaveCount(0);
    await expect(page.locator("dialog")).toHaveCount(1);
    await expect(section).toHaveValue(localized["fixture.fa1915720634"]);
    await expect(
      picker.getByRole("combobox", {
        name: localized["Filter by catalog group"],
        exact: true,
      }),
    ).toHaveValue(f.food);
    await expect(
      picker.getByLabel(localized["fixture.bb732b6bd964"], { exact: true }),
    ).toHaveValue(localized["fixture.e9f5b71a472d"]);
    await expect(
      picker.getByLabel(localized["fixture.bb732b6bd964"], { exact: true }),
    ).toBeFocused();
    expect(
      (await (await page.request.get("/api/v1/items")).json()).some(
        (i: any) => i.name === cancelled,
      ),
    ).toBe(false);
    await newButton.click();
    const newName = "Created catalog " + kind + info.project.name;
    await name.fill(newName);
    await form
      .getByLabel(localized["Note"], { exact: true })
      .fill("Catalog note");
    await form
      .getByRole("checkbox", { name: f.source.name, exact: true })
      .check();
    const requests: any[] = [];
    let failRefresh = true;
    await page.route("**/api/v1/items", async (route) => {
      if (route.request().method() === "POST") {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) {
          await route.fetch();
          return route.fulfill({
            status: 500,
            json: { message: "Temporary failure" },
          });
        }
      } else if (requests.length >= 2 && failRefresh) {
        failRefresh = false;
        return route.fulfill({
          status: 401,
          json: { message: "Unauthorized" },
        });
      }
      await route.continue();
    });
    await form
      .getByRole("button", { name: localized["Create and add"], exact: true })
      .click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(name).toHaveValue(newName);
    await page.keyboard.press("Escape");
    await expect(form).toBeVisible();
    await expect(
      form.getByRole("button", { name: localized["Cancel"], exact: true }),
    ).toBeDisabled();
    await form
      .getByRole("button", { name: localized["Retry save"], exact: true })
      .click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(
      form.getByRole("button", { name: localized["Retry save"], exact: true }),
    ).toBeEnabled();
    await expect(
      form.getByRole("button", { name: localized["Cancel"], exact: true }),
    ).toBeEnabled();
    await form
      .getByRole("button", { name: localized["Retry save"], exact: true })
      .click();
    await expect(name).toHaveValue("");
    await expect(name).toBeFocused();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const catalog = (
      await (await page.request.get("/api/v1/items")).json()
    ).filter((i: any) => i.name === newName);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].note).toBe("Catalog note");
    expect(catalog[0].itemGroup).toBe(f.food);
    expect(catalog[0].categoryIds).toEqual([f.source.id]);
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/v1/documents/" + d.id)).json())
            .entries.length,
      )
      .toBe(1);
    const secondName = "Second catalog " + kind + info.project.name;
    await name.fill(secondName);
    await form
      .getByRole("button", { name: localized["Create and add"], exact: true })
      .click();
    await expect(name).toHaveValue("");
    await form
      .getByRole("button", { name: localized["Cancel"], exact: true })
      .click();
    await picker
      .getByRole("button", { name: localized["Done"], exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/v1/documents/" + d.id)).json())
            .entries.length,
      )
      .toBe(2);
    const saved = (
      await (await page.request.get("/api/v1/documents/" + d.id)).json()
    ).entries;
    expect(
      saved.every((e: any) => e.itemId && e.sectionId === d.sections[0].id),
    ).toBe(true);
    expect(new Set(saved.map((e: any) => e.itemId)).size).toBe(2);
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    await newButton.click();
    await name.fill(newName);
    await form
      .getByRole("button", {
        name: localized["Select existing item:"] + newName,
        exact: true,
      })
      .click();
    await expect(form).toHaveCount(0);
    await picker
      .getByRole("button", { name: localized["Done"], exact: true })
      .click();
    expect(requests).toHaveLength(3);
    expect(
      (
        await (await page.request.get("/api/v1/documents/" + d.id)).json()
      ).entries.map((e: any) => e.id),
    ).toEqual(saved.map((e: any) => e.id));
    await page.reload();
    await page
      .getByRole("button", { name: localized["Edit mode"], exact: true })
      .click();
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    await newButton.click();
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await page
      .getByRole("button", {
        name: localized["fixture.3e8e498593dc"],
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Add entries", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Add entries", exact: true })
      .getByRole("button", { name: "Create item and add", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "New item", exact: true })
        .getByText(
          "Create an item in the catalog and add it to the current section.",
          { exact: true },
        ),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${kind}-${info.project.name}-new-catalog-item.png`,
    });
  });
}
