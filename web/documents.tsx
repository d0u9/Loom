import localized from "../locales/zh.json" with { type: "json" };
import { Button } from "./button.js";
import { matchesSearch } from "./router.js";
import { ResourceDialog } from "./resource-dialog.js";
import { Icon, Page } from "./layout.js";
import { Collection, RecordCard } from "./collection.js";
import { Modal } from "./modal.js";
import React, { useEffect, useState, useRef } from "react";
import {
  removeEntry,
  removeGroup,
  removeSection,
  duplicateItems,
  mergeContent,
  validateSections,
} from "../shared/groups.js";
import { ApiError, api, leave as leaveGuard } from "./client.js";
export function Documents({
  kind,
  documentId,
  query,
  onSearch,
  onNavigate,
  items,
  categories,
  refreshCatalog,
  date,
  onScheduleChange,
}: {
  kind: string;
  documentId: string | null;
  query: string;
  onSearch: (value: string) => void;
  onNavigate: (id: string | null) => void;
  date: string | null;
  onScheduleChange: () => Promise<void>;
  items: any[];
  categories: any[];
  refreshCatalog: () => Promise<void>;
}) {
  const [list, setList] = useState<any[]>([]),
    [doc, setDoc] = useState<any>(null),
    [dirty, setDirty] = useState(false),
    [status, setStatus] = useState(""),
    [revisions, setRevisions] = useState<any[]>([]),
    [history, setHistory] = useState<any>(null),
    [itemQuery, setItemQuery] = useState(""),
    [category, setCategory] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [mergeTargets, setMergeTargets] = useState<Record<string, string>>({}),
    [entryMove, setEntryMove] = useState<any>(null),
    [sectionEditor, setSectionEditor] = useState<any>(null),
    [sectionName, setSectionName] = useState(""),
    [sectionParent, setSectionParent] = useState(""),
    [targetSection, setTargetSection] = useState(""),
    [historyAction, setHistoryAction] = useState<any>(null),
    [resolutions, setResolutions] = useState<any>({}),
    [linking, setLinking] = useState<any>(null),
    [picker, setPicker] = useState<any[]>([]),
    [addOpen, setAddOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [creating, setCreating] = useState(false),
    [newName, setNewName] = useState(""),
    [createBusy, setCreateBusy] = useState(false),
    [pickerOpen, setPickerOpen] = useState(false),
    [sectionError, setSectionError] = useState("");
  const latest = useRef<any>(null),
    saving = useRef(false),
    pending = useRef<any>(null),
    creation = useRef<any>(null),
    itemCreation = useRef(new Map<string, any>()),
    checks = useRef(new Map<string, Promise<any>>()),
    failedChecks = useRef(new Map<string, { docId: string; request: any }>());
  const refresh = async () => {
    setList(await api("/documents"));
    await onScheduleChange();
  };
  useEffect(() => {
    let active = true;
    setDoc(null);
    setDirty(false);
    setHistory(null);
    setMenuOpen(false);
    setAddOpen(false);
    setTargetSection("");
    setSectionEditor(null);
    setEntryMove(null);
    setMergeTargets({});
    pending.current = null;
    checks.current.clear();
    failedChecks.current.clear();
    void refresh().catch((e) => {
      if (active) setStatus(String(e));
    });
    if (documentId)
      void (async () => {
        const d = await api("/documents/" + documentId);
        if (!active) return;
        if (d.kind !== kind) throw new Error(localized["This document belongs to another page."]);
        latest.current = d;
        setDoc(d);
        setStatus("");
        if (d.kind === "template") {
          const revisions = await api(
            "/templates/" + documentId + "/revisions",
          );
          if (active) setRevisions(revisions);
        }
      })().catch((e) => {
        if (active) setStatus(String(e));
      });
    return () => {
      active = false;
    };
  }, [kind, date, documentId]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty || checks.current.size || failedChecks.current.size) {
        e.preventDefault();
      }
    };
    leaveGuard.guard = () =>
      !saving.current &&
      ((!dirty && !checks.current.size && !failedChecks.current.size) ||
        confirm(localized["Discard pending changes and leave?"]));
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
      leaveGuard.guard = () => true;
    };
  }, [dirty]);
  async function attempt(fn: () => Promise<any>) {
    try {
      await fn();
    } catch (e) {
      setStatus(String(e));
      if (
        e instanceof ApiError &&
        Array.isArray(e.details) &&
        e.details[0]?.entries
      ) {
        setHistoryAction((current: any) =>
          current
            ? {
                ...current,
                duplicates: e.details,
                requestId: crypto.randomUUID(),
              }
            : current,
        );
      }
    }
  }
  const open = async (key: string) => {
    if (
      (dirty ||
        saving.current ||
        checks.current.size ||
        failedChecks.current.size) &&
      !confirm(localized["Discard changes and open another checklist?"])
    )
      return;
    if (key !== documentId) {
      onNavigate(key);
      return;
    }
    pending.current = null;
    checks.current.clear();
    failedChecks.current.clear();
    const d = await api("/documents/" + key);
    latest.current = d;
    setDoc(d);
    setDirty(false);
    setHistory(null);
    setStatus("");
    if (d.kind === "template")
      setRevisions(await api("/templates/" + key + "/revisions"));
  };
  const change = (next: any) => {
    validateSections(next);
    if (
      targetSection &&
      !(next.sections ?? []).some((s: any) => s.id === targetSection)
    )
      setTargetSection("");
    latest.current = next;
    setDoc(next);
    setDirty(true);
  };
  async function save() {
    if (saving.current || !latest.current) return;
    saving.current = true;
    setStatus(localized["Saving…"]);
    try {
      if (!pending.current) {
        const d = latest.current;
        if (duplicateItems(d).length) throw new Error(localized["Merge duplicate entries first"]);
        pending.current = {
          name: d.name,
          ...(kind === "checklist" ? { useDate: d.useDate ?? null } : {}),
          version: d.version,
          entries: d.entries,
          groups: d.groups,
          sections: d.sections ?? [],
          requestId: crypto.randomUUID(),
        };
      }
      const sent = pending.current;
      const result = await api("/documents/" + latest.current.id, "PUT", sent);
      pending.current = null;
      const current = latest.current;
      if (
        current.entries === sent.entries &&
        current.name === sent.name &&
        (kind !== "checklist" || (current.useDate ?? null) === sent.useDate) &&
        current.groups === sent.groups &&
        (current.sections ?? []).length === sent.sections.length &&
        JSON.stringify(current.sections ?? []) === JSON.stringify(sent.sections)
      ) {
        const checkedNow = new Map(
          current.entries.map((e: any) => [e.id, e.checked]),
        );
        result.entries = result.entries.map((e: any) => ({
          ...e,
          checked: checkedNow.get(e.id) ?? e.checked,
        }));
        latest.current = result;
        setDoc(result);
        setDirty(false);
      } else {
        latest.current = { ...current, version: result.version };
        setDoc(latest.current);
      }
      setStatus(localized["Saved"]);
      await refresh();
      if (kind === "template")
        setRevisions(await api("/templates/" + result.id + "/revisions"));
    } catch (e) {
      setStatus(String(e) + localized["; retry is available. Reload if there is a conflict."]);
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (dirty && kind === "checklist") {
      const timer = setTimeout(() => void save(), 600);
      return () => clearTimeout(timer);
    }
  }, [doc, dirty, kind]);
  const newEntry = (item: any) => ({
    id: crypto.randomUUID(),
    itemId: item?.id || null,
    name: item?.name || localized["New entry"],
    quantity: "",
    unit: "",
    note: "",
    checked: false,
    direct: true,
    groupIds: [],
    sectionId: targetSection || null,
  });
  function add(item: any) {
    const current = latest.current;
    const same = current.entries.filter(
      (e: any) => item && e.itemId === item.id,
    );
    if (same.length) {
      updateEntry(same[0].id, { direct: true });
      return;
    }
    change({ ...current, entries: [...current.entries, newEntry(item)] });
  }
  const updateEntry = (key: string, patch: any) =>
    change({
      ...latest.current,
      entries: latest.current.entries.map((e: any) =>
        e.id === key ? { ...e, ...patch } : e,
      ),
    });
  async function sendCheck(docId: string, key: string, request: any) {
    const promise = api(
      "/checklists/" + docId + "/entries/" + key + "/checked",
      "PUT",
      request,
    );
    checks.current.set(key, promise);
    setDoc({ ...latest.current });
    try {
      await promise;
      failedChecks.current.delete(key);
      setStatus(localized["Check saved"]);
    } catch (e) {
      failedChecks.current.set(key, { docId, request });
      setStatus(String(e) + localized["; retry the check."]);
    } finally {
      checks.current.delete(key);
      setDoc({ ...latest.current });
    }
  }
  function checked(entry: any, value: boolean) {
    if (checks.current.has(entry.id) || failedChecks.current.has(entry.id))
      return;
    const d = latest.current;
    const updated = {
      ...d,
      entries: d.entries.map((e: any) =>
        e.id === entry.id ? { ...e, checked: value } : e,
      ),
    };
    latest.current = updated;
    setDoc(updated);
    void sendCheck(d.id, entry.id, {
      checked: value,
      requestId: crypto.randomUUID(),
    });
  }
  async function categoryPreview(categoryId: string, groupId?: string) {
    const d = latest.current;
    const p = await api("/documents/" + d.id + "/category-preview", "POST", {
      entries: d.entries,
      groups: d.groups,
      sections: d.sections ?? [],
      version: d.version,
      categoryId,
      ...(groupId ? { groupId } : {}),
    });
    setPreview({ ...p, categoryId, groupId, content: d });
  }
  async function startHistory(action: string) {
    setMenuOpen(false);
    if (
      dirty ||
      saving.current ||
      checks.current.size ||
      failedChecks.current.size
    ) {
      setStatus(localized["Save changes before using history actions."]);
      return;
    }
    const d = latest.current;
    const revision =
      action === "instantiate"
        ? history?.revision || revisions[0]?.revision
        : undefined;
    const p = await api("/documents/" + d.id + "/history-preview", "POST", {
      action,
      version: d.version,
      ...(revision ? { revision } : {}),
    });
    setHistoryAction({
      ...p,
      action,
      revision,
      id: d.id,
      requestId: crypto.randomUUID(),
    });
    setMergeTargets({});
    setResolutions(
      Object.fromEntries(
        p.items.map((i: any) => [i.id, { mode: "temporary" }]),
      ),
    );
  }
  const create = () => {
    setStatus("");
    setNewName(creation.current?.name || "");
    setCreating(true);
  };
  const submitCreate = async () => {
    if (createBusy) return;
    const name = creation.current?.name || newName.trim();
    if (!name) {
      setStatus(localized["Enter a name"]);
      return;
    }
    setCreateBusy(true);
    try {
      if (!creation.current)
        creation.current = {
          kind,
          ...(kind === "checklist" ? { useDate: date } : {}),
          name,
          entries: [],
          groups: [],
          requestId: crypto.randomUUID(),
        };
      const d = await api("/documents", "POST", creation.current);
      creation.current = null;
      setStatus("");
      setCreating(false);
      await refresh();
      await open(d.id);
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) creation.current = null;
      setStatus(String(e));
    } finally {
      setCreateBusy(false);
    }
  };
  if (documentId && !doc)
    return (
      <Page
        title={kind === "template" ? "Template" : "Checklist"}
        showView={false}
        onBack={() => onNavigate(null)}
      >
        <p role="status">{status || localized["Loading…"]}</p>
      </Page>
    );
  const display = history || doc;
  function sectionLabel(key: string): string {
    const section = (doc?.sections ?? []).find((s: any) => s.id === key);
    const parts: string[] = [];
    let node = section;
    while (node && parts.length < 3) {
      parts.unshift(node.name);
      node = (doc.sections ?? []).find(
        (s: any) => s.id === node.parentSectionId,
      );
    }
    return parts.join(" / ");
  }
  function contentRows(content: any): any[] {
    const rows: any[] = [];
    const walk = (parent: string | null, depth: number) => {
      rows.push(
        ...content.entries
          .filter((e: any) => (e.sectionId ?? null) === parent)
          .map((entry: any) => ({ entry, depth })),
      );
      if (depth >= 3) return;
      for (const section of (content.sections ?? []).filter(
        (s: any) => s.parentSectionId === parent,
      )) {
        rows.push({ section, depth });
        walk(section.id, depth + 1);
      }
    };
    walk(null, 0);
    return rows;
  }

  const records = list.filter(
    (d) =>
      d.kind === kind &&
      (kind !== "checklist" || !date || d.useDate === date) &&
      matchesSearch(
        query,
        d.name,
        d.useDate,
        d.status === "archived" ? localized["Archived"] : localized["Active"],
      ),
  );

  return (
    <Page
      search={!doc ? { value: query, onChange: onSearch } : undefined}
      title={
        doc ? display.name : kind === "template" ? "Template" : "Checklist"
      }
      onBack={
        doc
          ? () => {
              if (leaveGuard.guard()) {
                onNavigate(null);
                setDoc(null);
                setDirty(false);
                pending.current = null;
              }
            }
          : undefined
      }
      onMore={doc ? () => setMenuOpen(true) : undefined}
      secondaryActions={
        doc && !history && doc.status === "active"
          ? [
              {
                label: localized["New section"],
                onClick: () => {
                  setSectionEditor({});
                  setSectionName("");
                  setSectionParent("");
                },
              },
              ...(kind === "template"
                ? [{ label: localized["Add entries"], onClick: () => setAddOpen(true) }]
                : []),
            ]
          : undefined
      }
      primaryAction={
        !doc
          ? {
              label: localized["New "] + (kind === "template" ? "Template" : "Checklist"),
              onClick: create,
            }
          : kind === "template"
            ? {
                label: localized["fixture.9031f7ab2f77"],
                icon: "save",
                onClick: () => void save(),
                disabled: saving.current || !!history,
              }
            : !history && doc.status === "active"
              ? { label: localized["Add entries"], onClick: () => setAddOpen(true) }
              : undefined
      }
      showView={!doc}
    >
      <p role="status">{status}</p>
      {creating && (
        <ResourceDialog
          title={localized["New "] + (kind === "template" ? "Template" : "Checklist")}
          name={newName}
          onNameChange={setNewName}
          error={status}
          fieldsDisabled={createBusy || !!creation.current}
          cancelDisabled={createBusy || !!creation.current}
          submitDisabled={createBusy}
          submitLabel={
            createBusy ? localized["Creating…"] : creation.current ? localized["Retry creation"] : localized["Create"]
          }
          onSubmit={() => {
            void submitCreate();
          }}
          onClose={() => {
            if (!createBusy && !creation.current) setCreating(false);
          }}
        />
      )}

      {failedChecks.current.size > 0 && (
        <Button
          onClick={() => {
            for (const [key, failed] of failedChecks.current)
              void sendCheck(failed.docId, key, failed.request);
          }}
        >{localized["\n          Retry check\n        "]}</Button>
      )}
      {pickerOpen && (
        <Modal
          aria-label={localized["fixture.276901239a13"]}
          onClose={() => setPickerOpen(false)}
        >
          <h3>{localized["fixture.420ecfe42f1c"]}</h3>
          {picker.length ? (
            picker.map((i) => (
              <Button
                key={i.id}
                onClick={() => {
                  add(i);
                  setPickerOpen(false);
                }}
              >
                {i.name}
              </Button>
            ))
          ) : (
            <p>{localized["fixture.b0e7d3a8e1a7"]}</p>
          )}
          <Button onClick={() => setPickerOpen(false)}>{localized["Cancel"]}</Button>
        </Modal>
      )}
      {linking && (
        <Modal aria-label={localized["fixture.5b90b5e5288b"]} onClose={() => setLinking(null)}>
          <label>{localized["fixture.6d10b531e1ca"]}<select
              value={linking.categoryId}
              onChange={(e) =>
                setLinking({ ...linking, categoryId: e.target.value })
              }
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={!linking.categoryId}
            onClick={() => {
              change({
                ...doc,
                ...mergeContent({
                  ...doc,
                  groups: doc.groups.map((g: any) =>
                    g.id === linking.groupId
                      ? { ...g, categoryId: linking.categoryId }
                      : g,
                  ),
                }),
              });
              setLinking(null);
            }}
          >{localized["\n            Link\n          "]}</Button>
          <Button onClick={() => setLinking(null)}>{localized["Cancel"]}</Button>
        </Modal>
      )}
      {doc &&
        !history &&
        doc.status === "active" &&
        duplicateItems(doc).length > 0 && (
          <Modal aria-label={localized["Merge duplicate entries"]} onClose={() => onNavigate(null)}>
            <h3>{localized["Duplicate entries: choose data to keep"]}</h3>
            {duplicateItems(doc).map((d) => (
              <label key={d.itemId}>
                {d.entries[0].name}
                <select
                  aria-label={localized["Keep "] + d.entries[0].name}
                  value={mergeTargets[d.itemId] || ""}
                  onChange={(ev) =>
                    setMergeTargets({
                      ...mergeTargets,
                      [d.itemId]: ev.target.value,
                    })
                  }
                >
                  <option value="">{localized["Choose values to keep"]}</option>
                  {d.entries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.quantity} {e.unit} · {e.note} ·{" "}
                      {e.checked ? localized["Checked"] : localized["Unchecked"]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <Button
              disabled={duplicateItems(doc).some(
                (d) => !mergeTargets[d.itemId],
              )}
              onClick={() => {
                change({ ...doc, ...mergeContent(doc, mergeTargets) });
                setMergeTargets({});
              }}
            >{localized["\n              Merge and keep all sources\n            "]}</Button>
          </Modal>
        )}
      {entryMove && (
        <Modal aria-label={localized["Move entry"]} onClose={() => setEntryMove(null)}>
          <h3>{localized["Move "]}{entryMove.name}</h3>
          <label>{localized["\n            Section\n            "]}<select
              aria-label={localized["Section "] + entryMove.name}
              value={entryMove.sectionId || ""}
              onChange={(ev) =>
                setEntryMove({
                  ...entryMove,
                  sectionId: ev.target.value || null,
                })
              }
            >
              <option value="">{localized["Root"]}</option>
              {(doc.sections ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {sectionLabel(s.id)}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => {
              updateEntry(entryMove.id, { sectionId: entryMove.sectionId });
              setEntryMove(null);
            }}
          >{localized["\n            Move\n          "]}</Button>
          <Button onClick={() => setEntryMove(null)}>{localized["Cancel"]}</Button>
        </Modal>
      )}
      {sectionEditor && (
        <ResourceDialog
          submitLabel={localized["Save section"]}
          title={sectionEditor.id ? localized["Edit section"] : localized["New section"]}
          name={sectionName}
          onNameChange={setSectionName}
          error={sectionError}
          onClose={() => {
            setSectionEditor(null);
            setSectionError("");
          }}
          onSubmit={() => {
            try {
              const section = {
                id: sectionEditor.id || crypto.randomUUID(),
                name: sectionName.trim(),
                parentSectionId: sectionParent || null,
              };
              change({
                ...doc,
                sections: sectionEditor.id
                  ? doc.sections.map((s: any) =>
                      s.id === section.id ? section : s,
                    )
                  : [...(doc.sections ?? []), section],
              });
              setSectionEditor(null);
              setSectionError("");
            } catch (e) {
              setSectionError(String(e));
            }
          }}
        >
          <label>{localized["\n            Parent section\n            "]}<select
              aria-label={localized["Parent section"]}
              value={sectionParent}
              onChange={(e) => setSectionParent(e.target.value)}
            >
              <option value="">{localized["Root"]}</option>
              {(doc.sections ?? [])
                .filter((s: any) => s.id !== sectionEditor.id)
                .map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s.id)}
                  </option>
                ))}
            </select>
          </label>
        </ResourceDialog>
      )}
      {!doc ? (
        <>
          {kind === "checklist" && (
            <p className="date-heading">
              {date ? `${date}${localized["fixture.6dcd1653af16"]}` : localized["All checklists"]}
            </p>
          )}
          <Collection>
            {records.map((d) => (
              <RecordCard
                key={d.id}
                name={d.name}
                onOpen={() => void attempt(() => open(d.id))}
              >
                <h3>{d.name}</h3>
                <p>
                  {d.useDate && (
                    <span className="date-badge">{d.useDate} · </span>
                  )}
                  {d.status === "archived" ? localized["Archived"] : localized["Active"]} · v{d.version}
                </p>
              </RecordCard>
            ))}
          </Collection>
          {query.trim() && records.length === 0 && (
            <p className="empty">{localized["No matching results."]}</p>
          )}
        </>
      ) : (
        <>
          {menuOpen && (
            <Modal aria-label={localized["Checklist settings"]} onClose={() => setMenuOpen(false)}>
              <h3>{localized["Settings and actions"]}</h3>
              <label>{localized["\n                Name\n                "]}<input
                  data-1p-ignore="true"
                  autoComplete="off"
                  value={display.name}
                  disabled={!!history || doc.status === "archived"}
                  onChange={(e) => change({ ...doc, name: e.target.value })}
                />
              </label>
              {kind === "checklist" && (
                <label>{localized["\n                  Use date\n                  "]}<input
                    type="date"
                    aria-label={localized["Use date"]}
                    data-1p-ignore="true"
                    value={display.useDate ?? ""}
                    disabled={!!history || doc.status === "archived"}
                    onChange={(e) =>
                      change({
                        ...latest.current,
                        useDate: e.target.value || null,
                      })
                    }
                  />
                </label>
              )}
              {kind === "template" && (
                <div className="field-row">
                  <label>
                    Revision
                    <select
                      value={history?.revision || ""}
                      onChange={(e) =>
                        void attempt(async () =>
                          setHistory(
                            e.target.value
                              ? await api(
                                  "/templates/" +
                                    doc.id +
                                    "/revisions/" +
                                    e.target.value,
                                )
                              : null,
                          ),
                        )
                      }
                    >
                      <option value="">{localized["Current content"]}</option>
                      {revisions.map((r) => (
                        <option key={r.revision} value={r.revision}>
                          revision {r.revision}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    onClick={() =>
                      void attempt(async () => {
                        await startHistory("instantiate");
                      })
                    }
                  >{localized["fixture.ad0f2d04ee05"]}</Button>
                </div>
              )}
              <div
                className="document-menu"
                onClick={(e) => {
                  const button = (e.target as HTMLElement).closest("button");
                  if (button && !button.disabled) setMenuOpen(false);
                }}
              >
                <div className="toolbar">
                  <Button
                    onClick={() =>
                      void attempt(async () => {
                        if (!dirty || confirm(localized["Discard local changes and reload?"])) {
                          pending.current = null;
                          setDirty(false);
                          await open(doc.id);
                        }
                      })
                    }
                  >{localized["\n                    Reload\n                  "]}</Button>
                </div>
                <div className="toolbar">
                  {kind === "checklist" && doc.status === "active" && (
                    <Button
                      disabled={saving.current || !!history}
                      onClick={() => void save()}
                    >{localized["\n                      Save / Retry\n                    "]}</Button>
                  )}
                  {kind === "checklist" && doc.status === "active" && (
                    <Button
                      disabled={
                        dirty ||
                        saving.current ||
                        checks.current.size > 0 ||
                        failedChecks.current.size > 0
                      }
                      onClick={() =>
                        void attempt(async () => {
                          await Promise.all([...checks.current.values()]);
                          const result = await api(
                            "/checklists/" + doc.id + "/archive",
                            "POST",
                            {
                              version: doc.version,
                              requestId: crypto.randomUUID(),
                            },
                          );
                          latest.current = result;
                          setDoc(result);
                          await refresh();
                        })
                      }
                    >{localized["\n                      Archive\n                    "]}</Button>
                  )}
                  {doc.status === "archived" && (
                    <Button
                      onClick={() =>
                        void attempt(() => startHistory("restore"))
                      }
                    >{localized["\n                      Restore archive\n                    "]}</Button>
                  )}
                  {kind === "checklist" && (
                    <>
                      <Button
                        onClick={() => void attempt(() => startHistory("copy"))}
                      >{localized["\n                        Copy checklist\n                      "]}</Button>
                      <Button
                        onClick={() =>
                          void attempt(() => startHistory("template"))
                        }
                      >{localized["\n                        Convert to template\n                      "]}</Button>
                    </>
                  )}
                  {kind === "template" && (
                    <Button
                      variant="danger"
                      disabled={
                        dirty ||
                        saving.current ||
                        checks.current.size > 0 ||
                        failedChecks.current.size > 0
                      }
                      onClick={() => {
                        if (
                          confirm(localized["fixture.ad75728133c6"])
                        )
                          void attempt(async () => {
                            await api("/templates/" + doc.id, "DELETE", {
                              version: doc.version,
                              confirm: true,
                            });
                            onNavigate(null);
                            setDoc(null);
                            await refresh();
                          });
                      }}
                    >{localized["\n                      Delete template\n                    "]}</Button>
                  )}
                </div>
              </div>
            </Modal>
          )}
          {historyAction && (
            <Modal onClose={() => setHistoryAction(null)} aria-label={localized["History actions"]}>
              <h3>{localized["Confirm "]}{historyAction.action}</h3>
              <p className="error">{status}</p>
              <label>{localized["\n                Name\n                "]}<input
                  data-1p-ignore="true"
                  autoComplete="off"
                  value={historyAction.name}
                  onChange={(e) =>
                    setHistoryAction({
                      ...historyAction,
                      name: e.target.value,
                      requestId: crypto.randomUUID(),
                    })
                  }
                />
              </label>
              {historyAction.items.map((i: any) => (
                <fieldset key={i.id}>
                  <legend>{localized["fixture.3ff2c475d562"]}{i.name}</legend>
                  <select
                    aria-label={localized["Resolution "] + i.name}
                    value={resolutions[i.id]?.mode}
                    onChange={(e) => {
                      setHistoryAction({
                        ...historyAction,
                        requestId: crypto.randomUUID(),
                      });
                      setResolutions({
                        ...resolutions,
                        [i.id]: {
                          mode: e.target.value,
                          name: i.name,
                          itemId: items[0]?.id,
                        },
                      });
                    }}
                  >
                    <option value="temporary">{localized["Keep as temporary entry"]}</option>
                    <option value="existing">{localized["fixture.9a8dfd51e08d"]}</option>
                    <option value="new">{localized["fixture.2b109ccf2461"]}</option>
                  </select>
                  {resolutions[i.id]?.mode === "existing" && (
                    <select
                      aria-label={localized["fixture.5a10ca43d247"]}
                      value={resolutions[i.id]?.itemId || ""}
                      onChange={(e) => {
                        setHistoryAction({
                          ...historyAction,
                          requestId: crypto.randomUUID(),
                        });
                        setResolutions({
                          ...resolutions,
                          [i.id]: {
                            ...resolutions[i.id],
                            itemId: e.target.value,
                          },
                        });
                      }}
                    >
                      <option value="">{localized["fixture.420ecfe42f1c"]}</option>
                      {items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {resolutions[i.id]?.mode === "new" && (
                    <input
                      data-1p-ignore="true"
                      autoComplete="off"
                      aria-label={localized["fixture.4877ba70dffd"]}
                      value={resolutions[i.id]?.name || ""}
                      onChange={(e) => {
                        setHistoryAction({
                          ...historyAction,
                          requestId: crypto.randomUUID(),
                        });
                        setResolutions({
                          ...resolutions,
                          [i.id]: {
                            ...resolutions[i.id],
                            name: e.target.value,
                          },
                        });
                      }}
                    />
                  )}
                </fieldset>
              ))}
              {(historyAction.duplicates ?? []).map((d: any) => (
                <label key={d.itemId}>
                  {d.entries[0].name}{localized[": choose values to keep\n                  "]}<select
                    value={mergeTargets[d.itemId] || ""}
                    onChange={(ev) => {
                      setMergeTargets({
                        ...mergeTargets,
                        [d.itemId]: ev.target.value,
                      });
                      setHistoryAction({
                        ...historyAction,
                        requestId: crypto.randomUUID(),
                      });
                    }}
                  >
                    <option value="">{localized["Choose"]}</option>
                    {d.entries.map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {e.quantity} {e.unit} · {e.note} ·{" "}
                        {e.checked ? localized["Checked"] : localized["Unchecked"]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {historyAction.categories.map((g: any) => (
                <p key={g.id}>{g.name}{localized[" Deleted; kept as a static group."]}</p>
              ))}
              <Button
                onClick={() =>
                  void attempt(async () => {
                    const body = {
                      action: historyAction.action,
                      name: historyAction.name,
                      version: historyAction.version,
                      requestId: historyAction.requestId,
                      resolutions,
                      mergeTargets,
                      ...(historyAction.revision
                        ? { revision: historyAction.revision }
                        : {}),
                    };
                    const result = await api(
                      "/documents/" + historyAction.id + "/history-apply",
                      "POST",
                      body,
                    );
                    setHistoryAction(null);
                    setStatus(localized["Completed "] + result.name);
                    await refreshCatalog();
                    await refresh();
                    if (result.kind === kind) await open(result.id);
                  })
                }
              >{localized["\n                Confirm / Retry\n              "]}</Button>
              <Button onClick={() => setHistoryAction(null)}>{localized["Cancel"]}</Button>
            </Modal>
          )}
          {kind === "checklist" && (
            <p className="entries-progress">
              {display.entries.filter((e: any) => e.checked).length} /{" "}
              {display.entries.length}{localized[" Completed\n            "]}</p>
          )}
          {addOpen && !history && doc.status === "active" && (
            <Modal aria-label={localized["Add entries"]} onClose={() => setAddOpen(false)}>
              <h3>{localized["Add entries"]}</h3>
              <label>{localized["\n                Add to section\n                "]}<select
                  aria-label={localized["Add to section"]}
                  value={targetSection}
                  onChange={(e) => setTargetSection(e.target.value)}
                >
                  <option value="">{localized["Root"]}</option>
                  {(doc.sections ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {sectionLabel(s.id)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="add-options">
                <section className="add-source" aria-label={localized["fixture.4faf27d9f1e2"]}>
                  <h4>Item</h4>
                  <input
                    aria-label={localized["fixture.2de8d9b98b44"]}
                    placeholder={localized["fixture.da2939ca69f7"]}
                    data-1p-ignore="true"
                    autoComplete="off"
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                  />
                  <div className="add-item-list">
                    {items
                      .filter((i) => matchesSearch(itemQuery, i.name))
                      .map((i) => (
                        <Button
                          variant="ghost"
                          key={i.id}
                          onClick={() => {
                            add(i);
                            setAddOpen(false);
                          }}
                        >
                          <span>{i.name}</span>
                          <Icon name="add" />
                        </Button>
                      ))}
                    {!items.some((i) => matchesSearch(itemQuery, i.name)) && (
                      <p>{localized["fixture.b9bffce17bd7"]}</p>
                    )}
                  </div>
                </section>
                <section className="add-source" aria-label={localized["Add from categories"]}>
                  <h4>Category</h4>
                  <select
                    aria-label={localized["fixture.1c6b15dc81da"]}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">{localized["fixture.e674764c46e1"]}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="add-category-actions">
                    <Button
                      disabled={!category}
                      onClick={() =>
                        void attempt(async () => {
                          const members = await api(
                            "/categories/" + category + "/members",
                          );
                          setPicker(
                            items.filter((i) => members.itemIds.includes(i.id)),
                          );
                          setAddOpen(false);
                          setPickerOpen(true);
                        })
                      }
                    >{localized["fixture.dc148bf14730"]}</Button>
                    <Button
                      disabled={!category}
                      onClick={() =>
                        void attempt(async () => {
                          await categoryPreview(category);
                          setAddOpen(false);
                        })
                      }
                    >{localized["\n                      Add category\n                    "]}</Button>
                  </div>
                </section>
                <Button
                  onClick={() => {
                    add(null);
                    setAddOpen(false);
                  }}
                >{localized["fixture.51edd3d1a7b4"]}</Button>
              </div>
              <div className="form-actions">
                <Button onClick={() => setAddOpen(false)}>{localized["Cancel"]}</Button>
              </div>
            </Modal>
          )}
          {display.groups.length > 0 && (
            <div className="entries entry-groups">
              {display.groups.map((g: any) => (
                <div key={g.id} className="entry entry-group">
                  <span className="category-tag">{g.name}</span>
                  <span className="entry-group-kind">
                    {g.categoryId ? localized["Category snapshot"] : localized["Static group"]}
                  </span>
                  {!history && doc.status === "active" && (
                    <>
                      <Button
                        onClick={() =>
                          change({ ...doc, ...removeGroup(doc, g.id) })
                        }
                      >{localized["\n                        Remove category source\n                      "]}</Button>
                      <Button
                        onClick={() => {
                          setLinking({
                            groupId: g.id,
                            categoryId: g.categoryId || categories[0]?.id || "",
                          });
                        }}
                      >{localized["fixture.586f0d70adc0"]}</Button>
                      <Button
                        disabled={!g.categoryId}
                        onClick={() =>
                          void attempt(() =>
                            categoryPreview(g.categoryId, g.id),
                          )
                        }
                      >
                        Update to latest
                      </Button>
                      {g.excluded.length > 0 && (
                        <Button
                          onClick={() =>
                            change({
                              ...doc,
                              groups: doc.groups.map((x: any) =>
                                x.id === g.id ? { ...x, excluded: [] } : x,
                              ),
                            })
                          }
                        >{localized["fixture.a2a368d97d61"]}</Button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {preview && (
            <Modal onClose={() => setPreview(null)} aria-label={localized["Category update preview"]}>
              <h3>{preview.group.name}{localized[" · Update preview"]}</h3>
              <p className="error">{status}</p>
              <p>{localized["\n                Added "]}{preview.added.length}{localized[", removed sources "]}{preview.removed.length}
              </p>
              {preview.added.map((i: any) => (
                <p key={i.id}>+ {i.name}</p>
              ))}
              {preview.duplicates.map((i: any) => (
                <p key={i.id}>{i.name}{localized[": merge automatically, keeping existing data and position"]}</p>
              ))}
              {preview.removed.map((e: any) => (
                <p key={e.id}>
                  {e.name}{localized[": sources "]}{e.groupIds.length + Number(e.direct)} →{" "}
                  {e.groupIds.length - 1 + Number(e.direct)}
                  {e.direct || e.groupIds.length > 1
                    ? localized["(keep entry)"]
                    : localized["(remove entry)"]}
                </p>
              ))}
              <Button
                onClick={() =>
                  void attempt(async () => {
                    const d = preview.content;
                    const content = await api(
                      "/documents/" + d.id + "/category-compose",
                      "POST",
                      {
                        entries: d.entries,
                        groups: d.groups,
                        sections: d.sections ?? [],
                        version: d.version,
                        categoryId: preview.categoryId,
                        ...(preview.groupId
                          ? { groupId: preview.groupId }
                          : {}),
                        expected: preview.expected,
                      },
                    );
                    change({
                      ...d,
                      ...content,
                      entries: content.entries.map((e: any) =>
                        d.entries.some((x: any) => x.id === e.id)
                          ? e
                          : { ...e, sectionId: targetSection || null },
                      ),
                    });
                    setPreview(null);
                  })
                }
              >{localized["\n                Apply selection\n              "]}</Button>
              <Button onClick={() => setPreview(null)}>{localized["Cancel"]}</Button>
            </Modal>
          )}
          <div className="entries">
            {contentRows(display).map((row: any) =>
              row.section ? (
                <div
                  className="entry section-heading"
                  key={row.section.id}
                  style={{
                    paddingLeft: `calc(var(--space-4) + ${row.depth} * var(--space-4))`,
                  }}
                >
                  <strong>{row.section.name}</strong>
                  {!history && doc.status === "active" && (
                    <>
                      <Button
                        variant="icon"
                        aria-label={localized["Edit section "] + row.section.name}
                        onClick={() => {
                          setSectionEditor(row.section);
                          setSectionName(row.section.name);
                          setSectionParent(row.section.parentSectionId || "");
                        }}
                      >
                        <Icon name="edit" />
                      </Button>
                      <Button
                        variant="icon"
                        aria-label={localized["fixture.7e9e29246aeb"] + row.section.name}
                        onClick={() => {
                          const sections = [...doc.sections],
                            index = sections.findIndex(
                              (s: any) => s.id === row.section.id,
                            );
                          const prev = sections
                            .slice(0, index)
                            .findLast(
                              (s: any) =>
                                s.parentSectionId ===
                                row.section.parentSectionId,
                            );
                          if (prev) {
                            const pos = sections.indexOf(prev);
                            [sections[pos], sections[index]] = [
                              sections[index],
                              sections[pos],
                            ];
                            change({ ...doc, sections });
                          }
                        }}
                      >
                        <Icon name="up" />
                      </Button>
                      <Button
                        className="danger"
                        variant="icon"
                        aria-label={localized["Delete section "] + row.section.name}
                        title={localized["Delete section and move content up"]}
                        onClick={() =>
                          change({
                            ...doc,
                            ...removeSection(doc, row.section.id),
                          })
                        }
                      >
                        <Icon name="trash" />
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                (() => {
                  const e = row.entry,
                    index = display.entries.findIndex(
                      (x: any) => x.id === e.id,
                    );
                  return (
                    <div
                      key={e.id}
                      className="entry"
                      style={{
                        paddingLeft: `calc(var(--space-4) + ${row.depth} * var(--space-4))`,
                      }}
                    >
                      {kind === "checklist" && (
                        <input
                          data-1p-ignore="true"
                          autoComplete="off"
                          aria-label={localized["Check "] + e.name}
                          type="checkbox"
                          disabled={
                            doc.status === "archived" ||
                            dirty ||
                            checks.current.has(e.id) ||
                            failedChecks.current.has(e.id)
                          }
                          checked={e.checked}
                          onChange={(ev) => checked(e, ev.target.checked)}
                        />
                      )}
                      <input
                        data-1p-ignore="true"
                        autoComplete="off"
                        aria-label={localized["Entry name"]}
                        className={"name " + (e.checked ? "checked" : "")}
                        value={
                          e.itemId && !history && doc.status === "active"
                            ? items.find((i) => i.id === e.itemId)?.name ||
                              e.name
                            : e.name
                        }
                        disabled={
                          !!e.itemId || !!history || doc.status === "archived"
                        }
                        onChange={(ev) =>
                          updateEntry(e.id, { name: ev.target.value })
                        }
                      />
                      {(["quantity", "unit", "note"] as const).map((field) => (
                        <input
                          data-1p-ignore="true"
                          autoComplete="off"
                          key={field}
                          aria-label={field}
                          className={field === "note" ? "note" : "small"}
                          placeholder={
                            { quantity: localized["fixture.5e29d121dda0"], unit: localized["fixture.80b19d68b149"], note: localized["Note"] }[
                              field
                            ]
                          }
                          value={e[field]}
                          disabled={!!history || doc.status === "archived"}
                          onChange={(ev) =>
                            updateEntry(e.id, { [field]: ev.target.value })
                          }
                        />
                      ))}
                      <span
                        className="entry-source-count"
                        title={localized["fixture.c06d43389e8c"]}
                      >
                        {e.groupIds.length + Number(e.direct)}{localized[" sources\n                      "]}</span>
                      {!history && doc.status === "active" && (
                        <>
                          {(doc.sections ?? []).length > 0 && (
                            <Button
                              variant="icon"
                              aria-label={localized["Move "] + e.name}
                              title={localized["Move to section"]}
                              onClick={() => setEntryMove(e)}
                            >
                              <Icon name="forward" />
                            </Button>
                          )}
                          <Button
                            variant="icon"
                            aria-label={localized["fixture.b2adfcc789b9"] + e.name}
                            title={localized["fixture.f853a70b1204"]}
                            disabled={
                              !doc.entries
                                .slice(0, index)
                                .some(
                                  (x: any) =>
                                    (x.sectionId ?? null) ===
                                    (e.sectionId ?? null),
                                )
                            }
                            onClick={() => {
                              const entries = [...doc.entries];
                              const previous = entries
                                .slice(0, index)
                                .findLastIndex(
                                  (x: any) =>
                                    (x.sectionId ?? null) ===
                                    (e.sectionId ?? null),
                                );
                              if (previous < 0) return;
                              [entries[previous], entries[index]] = [
                                entries[index],
                                entries[previous],
                              ];
                              change({ ...doc, entries });
                            }}
                          >
                            <Icon name="up" />
                          </Button>
                          <Button
                            className="danger"
                            variant="icon"
                            aria-label={localized["Remove "] + e.name}
                            title={localized["Remove"]}
                            onClick={() =>
                              change({ ...doc, ...removeEntry(doc, e.id) })
                            }
                          >
                            <Icon name="trash" />
                          </Button>
                          {!e.itemId && (
                            <Button
                              variant="icon"
                              aria-label={localized["fixture.7f45326bd629"] + e.name}
                              title={localized["fixture.bb4959e0bed1"]}
                              onClick={() =>
                                void attempt(async () => {
                                  if (!itemCreation.current.has(e.id))
                                    itemCreation.current.set(e.id, {
                                      name: e.name,
                                      note: "",
                                      categoryIds: [],
                                      requestId: crypto.randomUUID(),
                                    });
                                  const item = await api(
                                    "/items",
                                    "POST",
                                    itemCreation.current.get(e.id),
                                  );
                                  await refreshCatalog();
                                  updateEntry(e.id, { itemId: item.id });
                                })
                              }
                            >
                              <Icon name="save" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()
              ),
            )}
          </div>
        </>
      )}
    </Page>
  );
}
