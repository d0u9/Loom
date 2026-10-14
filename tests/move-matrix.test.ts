import localized from "../locales/zh.json" with { type: "json" };
import test from "node:test";
import assert from "node:assert/strict";
import {
  children,
  moveNode,
  nodeId,
  validateSections,
  type Content,
} from "../shared/groups.js";

test("all 243 entry/section moves preserve identity, values, sibling order and two-level limits", () => {
  const orders: Record<string, string[]> = {
    root: ["R1", "A", "R2", "C", "R3"],
    A: ["A1", "B", "A2"],
    B: ["B1"],
    C: [],
  };
  const parents = new Map<string, string | null>(
    Object.entries(orders).flatMap(([parent, ids]) =>
      ids.map((id) => [id, parent === "root" ? null : parent] as const),
    ),
  );
  const sections = new Set(["A", "B", "C"]);
  const original: Content = {
    entries: ["R1", "R2", "R3", "A1", "A2", "B1"].map((id, index) => ({
      id,
      name: id,
      itemId: index % 2 ? "catalog-" + id : null,
      sectionId: parents.get(id),
      quantity: String(index + 1),
      unit: localized["fixture.58561cce9d4d"],
      note: "note " + id,
      checked: index % 2 === 0,
    })),
    sections: [
      { id: "A", name: "A", parentSectionId: null, afterEntryId: "R1" },
      { id: "B", name: "B", parentSectionId: "A", afterEntryId: "A1" },
      { id: "C", name: "C", parentSectionId: null, afterEntryId: "R2" },
    ],
  };
  const frozen = structuredClone(original);
  const depth = (parent: string | null) =>
    parent === "B" ? 2 : parent ? 1 : 0;
  let count = 0;
  for (const source of parents.keys())
    for (const target of parents.keys())
      for (const place of ["before", "after", "into"] as const) {
        const label = `${source} ${place} ${target}`;
        count++;
        const moved = moveNode(original, source, target, place);
        let ancestor: string | null =
          place === "into" ? target : parents.get(target)!;
        let ownSubtree = false;
        while (ancestor) {
          if (ancestor === source) ownSubtree = true;
          ancestor = parents.get(ancestor)!;
        }
        if (
          source === target ||
          ownSubtree ||
          (place === "into" && !sections.has(target))
        ) {
          assert.equal(moved, original, label);
          continue;
        }
        const destination = place === "into" ? target : parents.get(target)!;
        // A carries a second-level section; moving its whole subtree cannot add a third level.
        if (
          sections.has(source) &&
          depth(destination) + (source === "A" ? 2 : 1) > 2
        ) {
          assert.throws(
            () => validateSections(moved),
            /at most two levels/,
            label,
          );
          assert.deepEqual(original, frozen, label);
          continue;
        }
        validateSections(moved);
        for (const [parent, order] of Object.entries(orders)) {
          const expected = order.filter((id) => id !== source);
          if (parent === (destination ?? "root")) {
            const at =
              place === "into"
                ? 0
                : expected.indexOf(target) + (place === "after" ? 1 : 0);
            expected.splice(at, 0, source);
          }
          assert.deepEqual(
            children(moved, parent === "root" ? null : parent).map(nodeId),
            expected,
            label + " in " + parent,
          );
        }
        assert.equal(moved.entries.length, original.entries.length, label);
        assert.equal(moved.sections!.length, original.sections!.length, label);
        for (const before of original.entries) {
          const after = moved.entries.find((entry) => entry.id === before.id)!;
          assert.deepEqual(
            after,
            {
              ...before,
              sectionId: source === before.id ? destination : before.sectionId,
            },
            label,
          );
        }
        for (const before of original.sections!) {
          const after = moved.sections!.find(
            (section) => section.id === before.id,
          )!;
          assert.equal(after.name, before.name, label);
          assert.equal(
            after.parentSectionId,
            source === before.id ? destination : before.parentSectionId,
            label,
          );
        }
        assert.deepEqual(original, frozen, label);
      }
  assert.equal(count, 243);
  for (const place of ["before", "after", "into"] as const) {
    assert.equal(moveNode(original, "missing", "R1", place), original);
    assert.equal(moveNode(original, "R1", "missing", place), original);
  }
});
