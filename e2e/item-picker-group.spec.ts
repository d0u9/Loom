import localized from "../locales/zh.json" with { type: "json" };
import { test, expect, type Page } from "@playwright/test";

async function fixture(page: Page, suffix: string) {
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
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
  const input = page
    .getByRole("dialog")
    .getByRole("combobox", { name: localized["Filter by catalog group"], exact: true });
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
    await page.getByRole("button", { name: localized["Add entries"], exact: true }).click();
    const modal = page.getByRole("dialog", { name: localized["Add entries"], exact: true });
    await group(page, f.drink);
    await expect(
      modal.getByRole("button", { name: f.milk.name, exact: true }),
    ).toBeVisible();
    await expect(
      modal.getByRole("button", { name: f.egg.name, exact: true }),
    ).toHaveCount(0);
    await modal.getByLabel(localized["fixture.bb732b6bd964"], { exact: true }).fill("jid");
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
    await modal.getByLabel(localized["fixture.bb732b6bd964"], { exact: true }).fill("");
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
    await modal.getByRole("tab", { name: localized["Add from categories"], exact: true }).click();
    expect(await modal.boundingBox()).toEqual(size);
    await expect(
      modal.getByRole("combobox", { name: localized["Filter by catalog group"], exact: true }),
    ).toBeDisabled();
    await modal.getByLabel(localized["fixture.ccb9b92a9911"], { exact: true }).fill(f.source.name);
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
    await picker.getByLabel(localized["fixture.bb732b6bd964"], { exact: true }).fill("jid");
    await picker.getByRole("button", { name: f.egg.name, exact: true }).click();
    const save = async (count: number) => {
      if (kind === "template")
        await page.getByRole("button", { name: localized["Save"], exact: true }).click();
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
    await page.getByRole("button", { name: localized["Add entries"], exact: true }).click();
    await modal.getByRole("tab", { name: localized["Add from items"], exact: true }).click();
    await group(page, f.drink);
    await modal.getByRole("tab", { name: localized["Add from categories"], exact: true }).click();
    await modal.getByLabel(localized["fixture.ccb9b92a9911"], { exact: true }).fill(f.source.name);
    await modal
      .getByRole("button", { name: localized["Add category "] + f.source.name, exact: true })
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
  await page.getByRole("button", { name: localized["Add members"], exact: true }).click();
  const modal = page.getByRole("dialog", { name: localized["Add members"], exact: true });
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
  await modal.getByRole("button", { name: localized["Add members"], exact: true }).click();
  await expect(select).toHaveValue("");
  await expect(
    modal.getByRole("combobox", { name: localized["Filter by catalog group"], exact: true }),
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
  await modal.getByRole("button", { name: localized["Add members"], exact: true }).click();
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
  await group(page, localized["All"]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: localized["fixture.3e8e498593dc"], exact: true }).click();
  await page.getByRole("button", { name: "Add members", exact: true }).click();
  await expect(
    page.getByRole("combobox", {
      name: "Filter by catalog group",
      exact: true,
    }),
  ).toHaveValue("All");
});
