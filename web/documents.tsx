import localized from "../locales/zh.json" with { type: "json" };
import { Page } from "./layout.js";
import { Modal } from "./modal.js";
import React, { useEffect, useState, useRef } from "react";
import { removeEntry } from "../shared/groups.js";
import { api, leave as leaveGuard } from "./client.js";
export function Documents({
  kind,
  items,
  categories,
  refreshCatalog,
  date,
  onScheduleChange,
}: {
  kind: string;
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
    [selected, setSelected] = useState(""),
    [category, setCategory] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [choices, setChoices] = useState<any>({}),
    [removeIds, setRemoveIds] = useState<string[]>([]),
    [historyAction, setHistoryAction] = useState<any>(null),
    [resolutions, setResolutions] = useState<any>({}),
    [linking, setLinking] = useState<any>(null),
    [picker, setPicker] = useState<any[]>([]),
    [pickerOpen, setPickerOpen] = useState(false),
    [duplicate, setDuplicate] = useState<any>(null);
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
    setDoc(null);
    setDirty(false);
    setHistory(null);
    void refresh().catch((e) => setStatus(String(e)));
  }, [kind, date]);
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
        pending.current = {
          name: d.name,
          ...(kind === "checklist" ? { useDate: d.useDate ?? null } : {}),
          version: d.version,
          entries: d.entries,
          groups: d.groups,
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
        current.groups === sent.groups
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
  });
  function add(item: any) {
    const current = latest.current;
    const same = current.entries.filter(
      (e: any) => item && e.itemId === item.id,
    );
    if (same.length) {
      setDuplicate({ item, targets: same, targetId: same[0].id });
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
      version: d.version,
      categoryId,
      ...(groupId ? { groupId } : {}),
    });
    setPreview({ ...p, categoryId, groupId, content: d });
    setChoices(
      Object.fromEntries(
        p.duplicates.map((i: any) => [
          i.id,
          {
            mode: "merge",
            targetId: d.entries.find((e: any) => e.itemId === i.id).id,
          },
        ]),
      ),
    );
    setRemoveIds([]);
  }
  async function startHistory(action: string) {
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
    setResolutions(
      Object.fromEntries(
        p.items.map((i: any) => [i.id, { mode: "temporary" }]),
      ),
    );
  }
  const create = () =>
    void attempt(async () => {
      const name = creation.current?.name || prompt(localized["Name"]);
      if (!name) return;
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
      await refresh();
      await open(d.id);
    });
  const display = history || doc;
  return (
    <Page
      title={kind === "template" ? "Template" : "Checklist"}
      onCreate={!doc ? create : undefined}
    >
      <p role="status">{status}</p>
      {failedChecks.current.size > 0 && (
        <button
          onClick={() => {
            for (const [key, failed] of failedChecks.current)
              void sendCheck(failed.docId, key, failed.request);
          }}
        >{localized["\n          Retry check\n        "]}</button>
      )}
      {pickerOpen && (
        <Modal
          aria-label={localized["fixture.276901239a13"]}
          onClose={() => setPickerOpen(false)}
        >
          <h3>{localized["fixture.420ecfe42f1c"]}</h3>
          {picker.length ? (
            picker.map((i) => (
              <button
                key={i.id}
                onClick={() => {
                  add(i);
                  setPickerOpen(false);
                }}
              >
                {i.name}
              </button>
            ))
          ) : (
            <p>{localized["fixture.b0e7d3a8e1a7"]}</p>
          )}
          <button onClick={() => setPickerOpen(false)}>{localized["Cancel"]}</button>
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
          <button
            disabled={!linking.categoryId}
            onClick={() => {
              change({
                ...doc,
                groups: doc.groups.map((g: any) =>
                  g.id === linking.groupId
                    ? { ...g, categoryId: linking.categoryId }
                    : g,
                ),
              });
              setLinking(null);
            }}
          >{localized["\n            Link\n          "]}</button>
          <button onClick={() => setLinking(null)}>{localized["Cancel"]}</button>
        </Modal>
      )}
      {duplicate && (
        <Modal aria-label={localized["fixture.9e5a94eb7b01"]} onClose={() => setDuplicate(null)}>
          <h3>{duplicate.item.name}{localized["fixture.9f87fa175ab4"]}</h3>
          <label>{localized["fixture.b01af0afdca3"]}<select
              value={duplicate.targetId}
              onChange={(e) =>
                setDuplicate({ ...duplicate, targetId: e.target.value })
              }
            >
              {duplicate.targets.map((e: any) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.quantity} {e.unit} · {e.note}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              change({
                ...doc,
                entries: doc.entries.map((e: any) =>
                  e.id === duplicate.targetId ? { ...e, direct: true } : e,
                ),
              });
              setDuplicate(null);
            }}
          >
            Merge
          </button>
          <button
            onClick={() => {
              change({
                ...doc,
                entries: [...doc.entries, newEntry(duplicate.item)],
              });
              setDuplicate(null);
            }}
          >
            Keep both
          </button>
          <button onClick={() => setDuplicate(null)}>{localized["Cancel"]}</button>
        </Modal>
      )}
      {!doc ? (
        <>
          {kind === "checklist" && (
            <p className="date-heading">
              {date ? `${date}${localized["fixture.6dcd1653af16"]}` : localized["All checklists"]}
            </p>
          )}
          <div className="cards">
            {list
              .filter(
                (d) =>
                  d.kind === kind &&
                  (kind !== "checklist" || !date || d.useDate === date),
              )
              .map((d) => (
                <article key={d.id}>
                  <h3>{d.name}</h3>
                  <p>
                    {d.useDate && (
                      <span className="date-badge">{d.useDate} · </span>
                    )}
                    {d.status === "archived" ? localized["Archived"] : localized["Active"]} · v{d.version}
                  </p>
                  <button onClick={() => void attempt(() => open(d.id))}>{localized["\n                    Open\n                  "]}</button>
                </article>
              ))}
          </div>
        </>
      ) : (
        <>
          <div className="toolbar">
            <button
              onClick={() => {
                if (!dirty || confirm(localized["fixture.46c8da8a29de"])) {
                  setDoc(null);
                  setDirty(false);
                  pending.current = null;
                }
              }}
            >{localized["\n              Back\n            "]}</button>
            <button
              disabled={
                saving.current || doc.status === "archived" || !!history
              }
              onClick={() => void save()}
            >
              {kind === "template" ? localized["fixture.9031f7ab2f77"] : localized["Save / Retry"]}
            </button>
            <button
              onClick={() =>
                void attempt(async () => {
                  if (!dirty || confirm(localized["Discard local changes and reload?"])) {
                    pending.current = null;
                    setDirty(false);
                    await open(doc.id);
                  }
                })
              }
            >{localized["\n              Reload\n            "]}</button>
          </div>
          <div className="toolbar">
            {kind === "checklist" && doc.status === "active" && (
              <button
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
                      { version: doc.version, requestId: crypto.randomUUID() },
                    );
                    latest.current = result;
                    setDoc(result);
                    await refresh();
                  })
                }
              >{localized["\n                Archive\n              "]}</button>
            )}
            {doc.status === "archived" && (
              <button
                onClick={() => void attempt(() => startHistory("restore"))}
              >{localized["\n                Restore archive\n              "]}</button>
            )}
            {kind === "checklist" && (
              <>
                <button
                  onClick={() => void attempt(() => startHistory("copy"))}
                >{localized["\n                  Copy checklist\n                "]}</button>
                <button
                  onClick={() => void attempt(() => startHistory("template"))}
                >{localized["\n                  Convert to template\n                "]}</button>
              </>
            )}
            {kind === "template" && (
              <button
                disabled={
                  dirty ||
                  saving.current ||
                  checks.current.size > 0 ||
                  failedChecks.current.size > 0
                }
                onClick={() => {
                  if (confirm(localized["fixture.ad75728133c6"]))
                    void attempt(async () => {
                      await api("/templates/" + doc.id, "DELETE", {
                        version: doc.version,
                        confirm: true,
                      });
                      setDoc(null);
                      await refresh();
                    });
                }}
              >{localized["\n                Delete template\n              "]}</button>
            )}
          </div>
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
              {historyAction.categories.map((g: any) => (
                <p key={g.id}>{g.name}{localized[" Deleted; kept as a static group."]}</p>
              ))}
              <button
                onClick={() =>
                  void attempt(async () => {
                    const body = {
                      action: historyAction.action,
                      name: historyAction.name,
                      version: historyAction.version,
                      requestId: historyAction.requestId,
                      resolutions,
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
              >{localized["\n                Confirm / Retry\n              "]}</button>
              <button onClick={() => setHistoryAction(null)}>{localized["Cancel"]}</button>
            </Modal>
          )}
          <label>{localized["\n            Name\n            "]}<input
              data-1p-ignore="true"
              autoComplete="off"
              value={display.name}
              disabled={!!history || doc.status === "archived"}
              onChange={(e) => change({ ...doc, name: e.target.value })}
            />
          </label>
          {kind === "checklist" && (
            <label>{localized["\n              Use date\n              "]}<input
                type="date"
                aria-label={localized["Use date"]}
                data-1p-ignore="true"
                value={display.useDate ?? ""}
                disabled={!!history || doc.status === "archived"}
                onChange={(e) =>
                  change({ ...latest.current, useDate: e.target.value || null })
                }
              />
            </label>
          )}
          {kind === "template" && (
            <div className="toolbar">
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
              <button
                onClick={() =>
                  void attempt(async () => {
                    await startHistory("instantiate");
                  })
                }
              >{localized["fixture.f1b59d4fc9b5"]}</button>
            </div>
          )}
          {kind === "checklist" && (
            <p>
              {display.entries.filter((e: any) => e.checked).length} /{" "}
              {display.entries.length}{localized[" Completed\n            "]}</p>
          )}
          {!history && doc.status === "active" && (
            <div className="toolbar">
              <select
                aria-label={localized["fixture.420ecfe42f1c"]}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">{localized["fixture.527e0ebdb23b"]}</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!selected}
                onClick={() => add(items.find((i) => i.id === selected))}
              >{localized["fixture.4958b15e19c4"]}</button>
              <button onClick={() => add(null)}>{localized["fixture.82d440e5f3ee"]}</button>
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
              <button
                disabled={!category}
                onClick={() =>
                  void attempt(async () => {
                    const members = await api(
                      "/categories/" + category + "/members",
                    );
                    setPicker(
                      items.filter((i) => members.itemIds.includes(i.id)),
                    );
                    setPickerOpen(true);
                  })
                }
              >{localized["fixture.6361fff69a7f"]}</button>
              <button
                disabled={!category}
                onClick={() => void attempt(() => categoryPreview(category))}
              >{localized["\n                Add category\n              "]}</button>
            </div>
          )}
          {display.groups.map((g: any) => (
            <article key={g.id}>
              <strong>{g.name}</strong> ·{" "}
              {g.categoryId ? localized["Category snapshot"] : localized["Static group"]}
              {!history && doc.status === "active" && (
                <>
                  <button
                    onClick={() => {
                      setLinking({
                        groupId: g.id,
                        categoryId: g.categoryId || categories[0]?.id || "",
                      });
                    }}
                  >{localized["fixture.19325568a876"]}</button>
                  <button
                    disabled={!g.categoryId}
                    onClick={() =>
                      void attempt(() => categoryPreview(g.categoryId, g.id))
                    }
                  >
                    Update to latest
                  </button>
                  {g.excluded.length > 0 && (
                    <button
                      onClick={() =>
                        change({
                          ...doc,
                          groups: doc.groups.map((x: any) =>
                            x.id === g.id ? { ...x, excluded: [] } : x,
                          ),
                        })
                      }
                    >{localized["fixture.fcc54faeb91a"]}</button>
                  )}
                </>
              )}
            </article>
          ))}
          {preview && (
            <Modal onClose={() => setPreview(null)} aria-label={localized["Category update preview"]}>
              <h3>{preview.group.name}{localized[" · Update preview"]}</h3>
              <p className="error">{status}</p>
              <p>{localized["\n                Added "]}{preview.added.length}{localized[", removed sources "]}{preview.removed.length}
              </p>
              {preview.added.map((i: any) => (
                <p key={i.id}>+ {i.name}</p>
              ))}
              <button
                onClick={() =>
                  setChoices(
                    Object.fromEntries(
                      preview.duplicates.map((i: any) => [
                        i.id,
                        {
                          mode: "merge",
                          targetId: doc.entries.find(
                            (e: any) => e.itemId === i.id,
                          ).id,
                        },
                      ]),
                    ),
                  )
                }
              >{localized["fixture.8eeb1c6bf0b8"]}</button>
              <button
                onClick={() =>
                  setChoices(
                    Object.fromEntries(
                      preview.duplicates.map((i: any) => [
                        i.id,
                        { mode: "keep" },
                      ]),
                    ),
                  )
                }
              >{localized["fixture.d4c0394fb208"]}</button>
              {preview.duplicates.map((i: any) => (
                <label key={i.id}>
                  {i.name}
                  <select
                    value={choices[i.id]?.mode || ""}
                    onChange={(e) =>
                      setChoices({
                        ...choices,
                        [i.id]: {
                          mode: e.target.value,
                          targetId: doc.entries.find(
                            (x: any) => x.itemId === i.id,
                          ).id,
                        },
                      })
                    }
                  >
                    <option value="merge">Merge</option>
                    <option value="keep">Keep both</option>
                  </select>
                  {choices[i.id]?.mode === "merge" && (
                    <select
                      aria-label={localized["fixture.2f415c8bbccb"] + i.name}
                      value={choices[i.id]?.targetId}
                      onChange={(e) =>
                        setChoices({
                          ...choices,
                          [i.id]: {
                            ...choices[i.id],
                            targetId: e.target.value,
                          },
                        })
                      }
                    >
                      {doc.entries
                        .filter((e: any) => e.itemId === i.id)
                        .map((e: any) => (
                          <option key={e.id} value={e.id}>
                            {e.name} · {e.quantity} {e.unit} · {e.note}
                          </option>
                        ))}
                    </select>
                  )}
                </label>
              ))}
              {preview.removed.map((e: any) => (
                <label key={e.id}>
                  <input
                    data-1p-ignore="true"
                    autoComplete="off"
                    type="checkbox"
                    disabled={e.direct || e.groupIds.length > 1}
                    checked={removeIds.includes(e.id)}
                    onChange={(ev) =>
                      setRemoveIds(
                        ev.target.checked
                          ? [...removeIds, e.id]
                          : removeIds.filter((k) => k !== e.id),
                      )
                    }
                  />{localized["\n                  Remove "]}{e.name}
                  {e.direct || e.groupIds.length > 1 ? localized["fixture.3aa592be2fbe"] : ""}
                </label>
              ))}
              <button
                onClick={() =>
                  void attempt(async () => {
                    const d = preview.content;
                    const content = await api(
                      "/documents/" + d.id + "/category-compose",
                      "POST",
                      {
                        entries: d.entries,
                        groups: d.groups,
                        version: d.version,
                        categoryId: preview.categoryId,
                        ...(preview.groupId
                          ? { groupId: preview.groupId }
                          : {}),
                        expected: preview.expected,
                        choices,
                        removeIds,
                      },
                    );
                    change({ ...d, ...content });
                    setPreview(null);
                  })
                }
              >{localized["\n                Apply selection\n              "]}</button>
              <button onClick={() => setPreview(null)}>{localized["Cancel"]}</button>
            </Modal>
          )}
          {display.entries.map((e: any, index: number) => (
            <article key={e.id} className="entry">
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
                    ? items.find((i) => i.id === e.itemId)?.name || e.name
                    : e.name
                }
                disabled={!!e.itemId || !!history || doc.status === "archived"}
                onChange={(ev) => updateEntry(e.id, { name: ev.target.value })}
              />
              {(["quantity", "unit", "note"] as const).map((field) => (
                <input
                  data-1p-ignore="true"
                  autoComplete="off"
                  key={field}
                  aria-label={field}
                  className={field === "note" ? "name" : "small"}
                  placeholder={
                    { quantity: localized["fixture.5e29d121dda0"], unit: localized["fixture.80b19d68b149"], note: localized["Note"] }[field]
                  }
                  value={e[field]}
                  disabled={!!history || doc.status === "archived"}
                  onChange={(ev) =>
                    updateEntry(e.id, { [field]: ev.target.value })
                  }
                />
              ))}
              {!history && doc.status === "active" && (
                <>
                  <button
                    aria-label={localized["fixture.b2adfcc789b9"] + e.name}
                    disabled={index === 0}
                    onClick={() => {
                      const entries = [...doc.entries];
                      [entries[index - 1], entries[index]] = [
                        entries[index],
                        entries[index - 1],
                      ];
                      change({ ...doc, entries });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() =>
                      change({ ...doc, ...removeEntry(doc, e.id) })
                    }
                  >{localized["\n                    Remove\n                  "]}</button>
                  {!e.itemId && (
                    <button
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
                    >{localized["fixture.8cff895b7522"]}</button>
                  )}
                </>
              )}
            </article>
          ))}
        </>
      )}
    </Page>
  );
}
