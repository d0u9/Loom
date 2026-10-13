import test from "node:test";
import assert from "node:assert/strict";
import { setup, entry } from "./helpers.js";
import { id } from "../server/db.js";
import {
  removeGroup,
  removeSection,
  moveNode,
  children,
  mergeContent,
  validateSections,
} from "../shared/groups.js";

test("category sources merge, repeated addition is idempotent, zero sources remove only document entries", async () => {
  const h = await setup();
  try {
    const cats = [];
    for (const name of ["food", "lab"])
      cats.push((await h.call("POST", "/categories", { name })).json());
    const egg = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: cats.map((c) => c.id),
        requestId: id(),
      })
    ).json();
    let d = (
      await h.call("POST", "/documents", {
        kind: "checklist",
        name: "sources",
        entries: [],
        groups: [],
        requestId: id(),
      })
    ).json();
    const save = async (content: any) => {
      const body = {
        name: d.name,
        version: d.version,
        entries: content.entries,
        groups: content.groups,
        sections: content.sections,
        requestId: id(),
      };
      const r = await h.call("PUT", `/documents/${d.id}`, body);
      assert.equal(r.statusCode, 200, r.body);
      assert.deepEqual(
        (await h.call("PUT", `/documents/${d.id}`, body)).json(),
        r.json(),
      );
      d = r.json();
    };
    const add = async (category: any) => {
      const body = {
        entries: d.entries,
        groups: d.groups,
        version: d.version,
        categoryId: category.id,
      };
      const p = (
        await h.call("POST", `/documents/${d.id}/category-preview`, body)
      ).json();
      const r = await h.call("POST", `/documents/${d.id}/category-compose`, {
        ...body,
        expected: p.expected,
      });
      assert.equal(r.statusCode, 200, r.body);
      await save(r.json());
    };
    await add(cats[0]);
    await add(cats[1]);
    await add(cats[1]);
    assert.equal(d.entries.length, 1);
    assert.equal(d.groups.length, 2);
    assert.equal(d.entries[0].sourceCount, 2);
    await h.call(
      "PUT",
      `/checklists/${d.id}/entries/${d.entries[0].id}/checked`,
      { checked: true, requestId: id() },
    );
    await save(removeGroup(d, d.groups[0].id));
    assert.equal(d.entries[0].sourceCount, 1);
    assert.equal(d.entries[0].checked, true);
    await save({ ...d, groups: [] });
    assert.equal(d.entries.length, 0);
    assert.equal((await h.call("GET", "/items")).json().length, 1);
    await add(cats[0]);
    await save({
      ...d,
      entries: d.entries.map((e: any) => ({ ...e, direct: true })),
    });
    await save(removeGroup(d, d.groups[0].id));
    assert.equal(d.entries[0].sourceCount, 1);
    const prior = d.entries[0];
    await save({
      ...d,
      entries: [
        prior,
        {
          ...prior,
          id: id(),
          quantity: "999",
          note: "replace?",
          checked: true,
        },
      ],
    });
    assert.equal(d.entries.length, 1);
    assert.equal(d.entries[0].quantity, prior.quantity);
    assert.equal(d.entries[0].note, prior.note);
    assert.throws(
      () =>
        h.store.run(
          "INSERT INTO entries(id,documentId,itemId,name,quantity,unit,note,position) SELECT ?,documentId,itemId,name,quantity,unit,note,position FROM entries WHERE id=?",
          id(),
          d.entries[0].id,
        ),
      /UNIQUE/,
    );
    await save({ ...d, entries: [] });
    await add(cats[0]);
    await add(cats[1]);
    let item = (await h.call("GET", "/items"))
      .json()
      .find((i: any) => i.id === egg.id);
    let r = await h.call("PUT", `/items/${egg.id}`, {
      name: item.name,
      note: item.note,
      categoryIds: [cats[1].id],
      version: item.version,
      requestId: id(),
    });
    assert.equal(r.statusCode, 200, r.body);
    await add(cats[0]);
    assert.equal(d.entries[0].sourceCount, 1);
    item = (await h.call("GET", "/items"))
      .json()
      .find((i: any) => i.id === egg.id);
    r = await h.call("PUT", `/items/${egg.id}`, {
      name: item.name,
      note: item.note,
      categoryIds: [],
      version: item.version,
      requestId: id(),
    });
    assert.equal(r.statusCode, 200, r.body);
    await add(cats[1]);
    assert.equal(d.entries.length, 0);
    assert.equal((await h.call("GET", "/items")).json().length, 1);
  } finally {
    await h.close();
  }
});

test("two-level sections validate atomically, revisions/instances/archive preserve structure", async () => {
  const h = await setup();
  try {
    const sections = [
      { id: id(), name: "A", parentSectionId: null as string | null },
      { id: id(), name: "B", parentSectionId: null as string | null },
      { id: id(), name: "C", parentSectionId: null as string | null },
    ];
    sections[1].parentSectionId = sections[0].id;
    sections[2].parentSectionId = sections[0].id;
    const e = { ...entry(), sectionId: sections[2].id };
    const r = await h.call("POST", "/documents", {
      kind: "template",
      name: "Tree",
      sections,
      entries: [e],
      groups: [],
      requestId: id(),
    });
    assert.equal(r.statusCode, 200, r.body);
    const d = r.json();
    assert.equal(d.sections.length, 3);
    const fourth = { id: id(), name: "D", parentSectionId: d.sections[2].id };
    const body = {
      name: d.name,
      version: d.version,
      entries: d.entries,
      groups: [],
      sections: [...d.sections, fourth],
      requestId: id(),
    };
    assert.equal(
      (await h.call("PUT", `/documents/${d.id}`, body)).statusCode,
      400,
    );
    const cycle = d.sections.map((s: any, index: number) =>
      index === 0 ? { ...s, parentSectionId: d.sections[2].id } : s,
    );
    assert.equal(
      (
        await h.call("PUT", `/documents/${d.id}`, {
          ...body,
          sections: cycle,
          requestId: id(),
        })
      ).statusCode,
      400,
    );
    assert.equal((await h.call("GET", `/documents/${d.id}`)).json().version, 1);
    assert.equal(
      (await h.call("GET", `/templates/${d.id}/revisions`)).json().length,
      1,
    );
    const rev = (await h.call("GET", `/templates/${d.id}/revisions/1`)).json();
    assert.deepEqual(rev.sections, d.sections);
    const instance = (
      await h.call("POST", `/documents/${d.id}/history-apply`, {
        action: "instantiate",
        revision: 1,
        version: 1,
        name: "Use",
        resolutions: {},
        requestId: id(),
      })
    ).json();
    assert.equal(instance.sections.length, 3);
    assert.notEqual(instance.sections[0].id, d.sections[0].id);
    assert.equal(instance.entries[0].sectionId, instance.sections[2].id);
    await h.call(
      "PUT",
      `/checklists/${instance.id}/entries/${instance.entries[0].id}/checked`,
      { checked: true, requestId: id() },
    );
    const archived = (
      await h.call("POST", `/checklists/${instance.id}/archive`, {
        version: 1,
        requestId: id(),
      })
    ).json();
    assert.deepEqual(archived.sections, instance.sections);
    const restored = (
      await h.call("POST", `/documents/${instance.id}/history-apply`, {
        action: "restore",
        version: archived.version,
        name: "Use",
        resolutions: {},
        requestId: id(),
      })
    ).json();
    assert.equal(restored.entries[0].checked, true);
    assert.equal(restored.entries[0].sectionId, restored.sections[2].id);
    const promoted = removeSection(restored, restored.sections[1].id);
    assert.equal(
      promoted.sections![1].parentSectionId,
      promoted.sections![0].id,
    );
    assert.equal(promoted.entries[0].sectionId, promoted.sections![1].id);
    validateSections(promoted);
    assert.equal(
      (
        await h.call("POST", "/documents", {
          kind: "template",
          name: "Foreign",
          entries: [{ ...entry(), sectionId: d.sections[0].id }],
          groups: [],
          sections: [],
          requestId: id(),
        })
      ).statusCode,
      400,
    );
  } finally {
    await h.close();
  }
});

test("legacy duplicates require explicit field selection and retain every source", () => {
  const item = { id: id(), name: "egg" },
    a = entry(item),
    b = { ...entry(item), quantity: "4", checked: true };
  const groups = [
    {
      id: id(),
      categoryId: id(),
      originalCategoryId: id(),
      name: "food",
      members: [item.id],
      excluded: [],
    },
  ];
  a.groupIds = [groups[0].id];
  assert.throws(
    () => mergeContent({ entries: [a, b], groups }),
    /Choose values/,
  );
  const merged = mergeContent({ entries: [a, b], groups }, { [item.id]: b.id });
  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0].quantity, "4");
  assert.equal(merged.entries[0].checked, true);
  assert.deepEqual(merged.entries[0].groupIds, a.groupIds);
  assert.equal(
    mergeContent({ entries: [entry(), entry()], groups: [] }).entries.length,
    2,
  );
});

test("old revisions expose duplicates and history apply merges selected values atomically", async () => {
  const h = await setup();
  try {
    const item = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: [],
        requestId: id(),
      })
    ).json();
    const d = (
      await h.call("POST", "/documents", {
        kind: "template",
        name: "old",
        entries: [],
        groups: [],
        requestId: id(),
      })
    ).json();
    const a = entry(item),
      b = { ...entry(item), quantity: "7", checked: true };
    const snapshot = JSON.stringify({
      ...d,
      schemaVersion: 2,
      revision: 2,
      entries: [a, b],
    });
    h.store.run(
      "INSERT INTO template_revisions VALUES(?,?,?)",
      d.id,
      2,
      snapshot,
    );
    const body = {
      action: "instantiate",
      revision: 2,
      version: d.version,
      name: "new",
      resolutions: {},
      requestId: id(),
    };
    const p = (
      await h.call("POST", `/documents/${d.id}/history-preview`, {
        action: "instantiate",
        revision: 2,
        version: d.version,
      })
    ).json();
    assert.equal(p.duplicates.length, 1);
    assert.equal(
      (await h.call("POST", `/documents/${d.id}/history-apply`, body))
        .statusCode,
      409,
    );
    assert.equal(h.store.all("SELECT * FROM documents").length, 1);
    const r = await h.call("POST", `/documents/${d.id}/history-apply`, {
      ...body,
      mergeTargets: { [item.id]: b.id },
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.json().entries.length, 1);
    assert.equal(r.json().entries[0].quantity, "7");
    assert.equal(r.json().entries[0].checked, false);
    assert.equal(
      h.store.get(
        "SELECT snapshot FROM template_revisions WHERE documentId=? AND revision=2",
        d.id,
      ).snapshot,
      snapshot,
    );
  } finally {
    await h.close();
  }
});

test("unknown and foreign sources reject the whole save, including checked state and revisions", async () => {
  const h = await setup();
  try {
    const item = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: [],
        requestId: id(),
      })
    ).json();
    const foreign = (
      await h.call("POST", "/documents", {
        kind: "template",
        name: "other",
        entries: [],
        groups: [
          {
            id: id(),
            categoryId: null,
            originalCategoryId: id(),
            name: "static",
            members: [],
            excluded: [],
          },
        ],
        requestId: id(),
      })
    ).json();
    for (const kind of ["template", "checklist"]) {
      const d = (
        await h.call("POST", "/documents", {
          kind,
          name: "protected",
          entries: [entry(item)],
          groups: [],
          requestId: id(),
        })
      ).json();
      if (kind === "checklist")
        await h.call(
          "PUT",
          `/checklists/${d.id}/entries/${d.entries[0].id}/checked`,
          { checked: true, requestId: id() },
        );
      const before = (await h.call("GET", `/documents/${d.id}`)).json();
      for (const sourceId of [id(), foreign.groups[0].id]) {
        const r = await h.call("PUT", `/documents/${d.id}`, {
          name: "should roll back",
          version: before.version,
          entries: [
            { ...before.entries[0], direct: false, groupIds: [sourceId] },
          ],
          groups: [],
          requestId: id(),
        });
        assert.equal(r.statusCode, 400, r.body);
        assert.equal(r.json().message, "Unknown source group");
        assert.deepEqual(
          (await h.call("GET", `/documents/${d.id}`)).json(),
          before,
        );
      }
      if (kind === "template")
        assert.equal(
          (await h.call("GET", `/templates/${d.id}/revisions`)).json().length,
          1,
        );
    }
  } finally {
    await h.close();
  }
});

test("entries and sections share one order per parent and survive save and copy", async () => {
  const h = await setup();
  try {
    const mk = (name: string, sectionId: string | null = null) => ({
      ...entry({ id: null, name }),
      itemId: null,
      sectionId,
    });
    const [a, b] = [mk("a"), mk("b")];
    const s1 = { id: id(), name: "S1", parentSectionId: null };
    const s2 = { id: id(), name: "S2", parentSectionId: s1.id };
    const inner = mk("inner", s2.id);
    let content: any = {
      entries: [a, b, inner],
      groups: [],
      sections: [s1, s2],
    };
    const order = (c: any, parent: string | null) =>
      children(c, parent).map((n: any) =>
        n.entry ? n.entry.name : n.section.name,
      );
    assert.deepEqual(order(content, null), ["a", "b", "S1"]);
    // Level 2 section lands between two root entries: becomes level 1.
    content = moveNode(content, s2.id, b.id, "before");
    assert.deepEqual(order(content, null), ["a", "S2", "b", "S1"]);
    assert.deepEqual(order(content, s2.id), ["inner"]);
    // An entry nests into a section; a section cannot enter its own subtree.
    content = moveNode(content, b.id, s1.id, "into");
    assert.deepEqual(order(content, s1.id), ["b"]);
    assert.equal(moveNode(content, s2.id, inner.id, "after"), content);
    // Deleting a section promotes its contents into its place.
    const promoted = removeSection(content, s2.id);
    assert.deepEqual(order(promoted, null), ["a", "inner", "S1"]);
    // Appended entries land last, even after trailing sections.
    const appended = { ...content, entries: [...content.entries, mk("z")] };
    assert.deepEqual(order(appended, null), ["a", "S2", "S1", "z"]);
    // Old data without anchors keeps sections after entries.
    const legacy = {
      ...content,
      sections: content.sections.map(({ afterEntryId, ...s }: any) => s),
    };
    assert.deepEqual(order(legacy, null), ["a", "S2", "S1"]);
    // Merging away an anchor entry keeps the section in place.
    const egg = { id: id(), name: "egg" };
    const e1 = { ...mk("egg1"), itemId: egg.id };
    const e2 = { ...mk("egg2"), itemId: egg.id };
    let dup: any = { entries: [e1, mk("m"), e2], groups: [], sections: [] };
    dup.sections = [{ id: id(), name: "T", parentSectionId: null }];
    dup = moveNode(dup, dup.sections[0].id, e2.id, "after");
    assert.deepEqual(order(dup, null), ["egg1", "m", "egg2", "T"]);
    assert.deepEqual(order(mergeContent(dup), null), ["egg1", "m", "T"]);

    const d = (
      await h.call("POST", "/documents", {
        kind: "template",
        name: "mixed",
        ...content,
        requestId: id(),
      })
    ).json();
    assert.deepEqual(order(d, null), ["a", "S2", "S1"]);
    const copy = (
      await h.call("POST", "/documents/" + d.id + "/history-apply", {
        action: "instantiate",
        version: d.version,
        revision: 1,
        name: "copy",
        resolutions: {},
        requestId: id(),
      })
    ).json();
    assert.deepEqual(order(copy, null), ["a", "S2", "S1"]);
    // Copies keep null anchors first and missing (legacy) anchors last.
    const old = (
      await h.call("POST", "/documents", {
        kind: "template",
        name: "legacy",
        entries: [mk("p"), mk("q")],
        groups: [],
        sections: [
          { id: id(), name: "Last", parentSectionId: null },
          {
            id: id(),
            name: "First",
            parentSectionId: null,
            afterEntryId: null,
          },
        ],
        requestId: id(),
      })
    ).json();
    const legacyCopy = (
      await h.call("POST", "/documents/" + old.id + "/history-apply", {
        action: "instantiate",
        version: old.version,
        revision: 1,
        name: "legacy copy",
        resolutions: {},
        requestId: id(),
      })
    ).json();
    assert.deepEqual(order(legacyCopy, null), ["First", "p", "q", "Last"]);
  } finally {
    await h.close();
  }
});
