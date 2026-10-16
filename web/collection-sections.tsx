import localized from "../locales/zh.json" with { type: "json" };
import React, { useEffect, useRef, useState } from "react";
import { api, leave } from "./client.js";
import { t, type LocalizedText } from "./i18n.js";
import { errorText } from "./labels.js";
import { matchesSearch } from "./router.js";
import { Button } from "./button.js";
import { Collection, RecordCard } from "./collection.js";
import { Icon } from "./layout.js";
import { SortableRow } from "./sortable.js";
import { ResourceDialog } from "./resource-dialog.js";
import { ask } from "./modal.js";

type Layout = {
  version: number;
  rootPosition: number;
  sections: { id: string; name: string }[];
  records: { id: string; sectionId: string | null }[];
};
export function CollectionSections({
  records,
  kind,
  query,
  creating,
  onCloseCreate,
  onStatus,
  renderCard,
}: {
  records: any[];
  kind: "category" | "template";
  query: string;
  creating: boolean;
  onCloseCreate: () => void;
  onStatus: (status: LocalizedText) => void;
  renderCard: (
    record: any,
    sort?: React.ComponentProps<typeof RecordCard>["sort"],
  ) => React.ReactNode;
}) {
  const field = kind === "category" ? "categories" : "templates";
  const path = `/${kind}-layout`;
  const decode = (result: any): Layout => ({
    version: result.version,
    rootPosition: result.rootPosition,
    sections: result.sections,
    records: result[field],
  });
  const [layout, setLayout] = useState<Layout | null>(null);
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [editor, setEditor] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LocalizedText>("");
  const pending = useRef<any>(null);
  const working = useRef(false);
  async function load() {
    try {
      const result = await api(path);
      if (pending.current) return;
      setLayout(decode(result));
      setError("");
      onStatus("");
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    if (!pending.current) void load();
  }, [records.map((c) => c.id).join(",")]);
  useEffect(() => {
    if (creating) setEditor({ name: "" });
  }, [creating]);
  useEffect(() => {
    const previous = leave.guard;
    leave.guard = () => !pending.current && !working.current;
    const protect = (event: BeforeUnloadEvent) => {
      if (pending.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => {
      leave.guard = previous;
      window.removeEventListener("beforeunload", protect);
    };
  }, []);
  async function save(next: Layout) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    onStatus(localized["Saving…"]);
    pending.current ??= { ...next, requestId: crypto.randomUUID() };
    setLayout(pending.current);
    try {
      const { records, ...body } = pending.current;
      setLayout(decode(await api(path, "PUT", { ...body, [field]: records })));
      pending.current = null;
      setEditor(null);
      onCloseCreate();
      onStatus(localized["Saved"]);
    } catch (e) {
      setError(errorText(e));
      onStatus("");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  const locked = busy || !!pending.current;
  function move(key: string, target: string, after: boolean) {
    if (!layout || locked || key === target) return;
    const [kind, id] = key.split(":"),
      [targetKind, targetId] = target.split(":");
    if (kind === "s") {
      const destination =
        targetKind === "s"
          ? targetId
          : (layout.records.find((c) => c.id === targetId)?.sectionId ??
            "root");
      const from = groups.find((s) => s.id === id);
      if (!from || destination === id) return;
      const order = groups.filter((s) => s.id !== id);
      const index = order.findIndex((s) => s.id === destination);
      if (index < 0) return;
      order.splice(index + (after ? 1 : 0), 0, from);
      void save({
        ...layout,
        sections: order.filter((s) => s.id !== "root"),
        rootPosition: order.findIndex((s) => s.id === "root"),
      });
    } else {
      const from = layout.records.find((c) => c.id === id);
      const destination =
        targetKind === "c"
          ? layout.records.find((c) => c.id === targetId)
          : null;
      if (!from || (targetKind === "c" && !destination)) return;
      const sectionId = destination
        ? destination.sectionId
        : targetId === "root"
          ? null
          : targetId;
      const positions = layout.records.filter((c) => c.id !== id);
      let index = destination
        ? positions.findIndex((c) => c.id === targetId) + (after ? 1 : 0)
        : positions.findIndex((c) => c.sectionId === sectionId);
      if (index < 0) index = positions.length;
      positions.splice(index, 0, { ...from, sectionId });
      setCollapsed((old) => {
        const next = new Set(old);
        next.delete(sectionId ?? "root");
        return next;
      });
      void save({ ...layout, records: positions });
    }
  }
  const groups = [...(layout?.sections ?? [])];
  groups.splice(layout?.rootPosition ?? 0, 0, {
    id: "root",
    name: t(localized["Ungrouped"]),
  });
  const members = (sectionId: string) =>
    (layout?.records ?? [])
      .filter((c) => (c.sectionId ?? "root") === sectionId)
      .map((c) => records.find((x) => x.id === c.id))
      .filter((c) => c && matchesSearch(query, c.name));
  const nodes = groups.flatMap((g) => [
    "s:" + g.id,
    ...(collapsed.has(g.id) ? [] : members(g.id).map((c) => "c:" + c.id)),
  ]);
  function step(key: string, direction: number) {
    if (!layout) return;
    if (key.startsWith("s:")) {
      const index = groups.findIndex((s) => "s:" + s.id === key);
      const target = groups[index + direction];
      if (target) move(key, "s:" + target.id, direction > 0);
    } else {
      let index = nodes.indexOf(key) + direction;
      const row = layout.records.find((c) => "c:" + c.id === key);
      if (direction < 0 && nodes[index] === "s:" + (row?.sectionId ?? "root"))
        index--;
      if (nodes[index]) move(key, nodes[index], direction > 0);
    }
  }
  return (
    <>
      {error && (
        <div role="alert" className="error">
          {t(error)}{" "}
          <Button
            disabled={busy}
            onClick={() => void (pending.current ? save(layout!) : load())}
          >
            {t(localized["Retry save"])}
          </Button>{" "}
          <Button
            disabled={busy}
            onClick={() =>
              void (async () => {
                if (
                  pending.current &&
                  !(await ask(
                    t(localized["Discard pending changes and leave?"]),
                    t(localized["Discard changes"]),
                  ))
                )
                  return;
                pending.current = null;
                setEditor(null);
                onCloseCreate();
                await load();
              })()
            }
          >
            {t(localized["Reload"])}
          </Button>
        </div>
      )}
      {layout && (
        <Collection>
          {groups.flatMap((group) => [
            (!query.trim() || members(group.id).length > 0) && (
              <SortableRow
                key={"s:" + group.id}
                as="div"
                id={"s:" + group.id}
                data-nest=""
                className="collection-section-heading"
                dragLabel={group.name}
                tabIndex={0}
                disabled={locked}
                onMove={(target, after) => move("s:" + group.id, target, after)}
                onStep={(direction) => step("s:" + group.id, direction)}
              >
                <Button
                  variant="icon"
                  className="section-toggle"
                  aria-label={
                    (collapsed.has(group.id)
                      ? t(localized["Expand "])
                      : t(localized["Collapse "])) + group.name
                  }
                  aria-expanded={!collapsed.has(group.id)}
                  onClick={() =>
                    setCollapsed((old) => {
                      const next = new Set(old);
                      if (!next.delete(group.id)) next.add(group.id);
                      return next;
                    })
                  }
                >
                  <Icon name="forward" />
                </Button>
                <strong>{group.name}</strong>
                {group.id !== "root" && (
                  <>
                    <Button
                      variant="icon"
                      disabled={locked}
                      aria-label={t(localized["Edit section "]) + group.name}
                      title={t(localized["Edit"])}
                      onClick={() => setEditor({ ...group })}
                    >
                      <Icon name="edit" />
                    </Button>
                    <Button
                      variant="icon"
                      className="danger"
                      disabled={locked}
                      aria-label={t(localized["Delete section "]) + group.name}
                      title={t(localized["Delete section and move content up"])}
                      onClick={() =>
                        void (async () => {
                          if (
                            await ask(
                              t(localized["Delete section and keep content?"]),
                              t(localized["Delete"]),
                            )
                          )
                            await save({
                              ...layout,
                              rootPosition:
                                layout.rootPosition -
                                (layout.sections.findIndex(
                                  (s) => s.id === group.id,
                                ) < layout.rootPosition
                                  ? 1
                                  : 0),
                              sections: layout.sections.filter(
                                (s) => s.id !== group.id,
                              ),
                              records: layout.records.map((c) =>
                                c.sectionId === group.id
                                  ? { ...c, sectionId: null }
                                  : c,
                              ),
                            });
                        })()
                      }
                    >
                      <Icon name="trash" />
                    </Button>
                  </>
                )}
              </SortableRow>
            ),
            ...(collapsed.has(group.id)
              ? []
              : members(group.id).map((record) =>
                  renderCard(record, {
                    id: "c:" + record.id,
                    disabled: locked,
                    onMove: (target, after) =>
                      move("c:" + record.id, target, after),
                    onNest: (target) => move("c:" + record.id, target, false),
                    onStep: (direction) => step("c:" + record.id, direction),
                  }),
                )),
          ])}
        </Collection>
      )}
      {editor && (
        <ResourceDialog
          title={
            editor.id
              ? t(localized["Edit collection section"])
              : t(localized["New collection section"])
          }
          name={editor.name}
          onNameChange={(name) => setEditor({ ...editor, name })}
          error={error}
          fieldsDisabled={locked}
          submitDisabled={busy}
          submitLabel={
            pending.current
              ? t(localized["Retry save"])
              : t(localized["Save section"])
          }
          onClose={() => {
            if (!busy) {
              setEditor(null);
              onCloseCreate();
            }
          }}
          onSubmit={() => {
            if (!layout) return;
            const sections = editor.id
              ? layout.sections.map((s) =>
                  s.id === editor.id ? { ...s, name: editor.name.trim() } : s,
                )
              : [
                  ...layout.sections,
                  { id: crypto.randomUUID(), name: editor.name.trim() },
                ];
            void save({ ...layout, sections });
          }}
        />
      )}
    </>
  );
}
