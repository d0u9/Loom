import test from "node:test";
import assert from "node:assert/strict";
import { setup, entry } from "./helpers.js";
import { id } from "../server/db.js";
import {
  removeSection,
  moveNode,
  children,
  mergeContent,
  validateSections,
} from "../shared/groups.js";

test("two-level sections validate atomically, current content/instances/archive preserve structure", async () => {
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
    const instance = (
      await h.call("POST", `/documents/${d.id}/history-apply`, {
        action: "instantiate",
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

test("duplicate Items require explicit field selection", () => {
  const item = { id: id(), name: "egg" },
    a = entry(item),
    b = { ...entry(item), quantity: "4", checked: true };
  assert.throws(() => mergeContent({ entries: [a, b] }), /Choose values/);
  const merged = mergeContent({ entries: [a, b] }, { [item.id]: b.id });
  assert.equal(merged.entries.length, 1);
  assert.equal(merged.entries[0].quantity, "4");
  assert.equal(merged.entries[0].checked, true);
  assert.equal(mergeContent({ entries: [entry(), entry()] }).entries.length, 2);
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
    let dup: any = { entries: [e1, mk("m"), e2], sections: [] };
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
