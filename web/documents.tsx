import localized from "../locales/zh.json" with { type: "json" };
import { t, message, type LocalizedText } from "./i18n.js";
import { errorText, resourceLabels } from "./labels.js";
import { ActionTools } from "./action-tools.js";
import { ItemSummary } from "./item-summary.js";
import { ItemFields, ItemNameMatches, sameName } from "./item-fields.js";
import { ItemGroupFilter, matchesItemGroup } from "./item-group-filter.js";
import { Button } from "./button.js";
import { matchesSearch } from "./router.js";
import { ResourceDialog, ResourceForm } from "./resource-dialog.js";
import { Icon, Page } from "./layout.js";
import { Collection, RecordCard } from "./collection.js";
import { Modal, ask } from "./modal.js";
import { Select } from "./select.js";
import { SortableRow } from "./sortable.js";
import React, { useEffect, useState, useRef } from "react";
import {
  addItems,
  removeSection,
  moveNode,
  nodeId,
  children,
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
    [statusFilter, setStatusFilter] = useState(date ? "all" : "active"),
    [dirty, updateDirty] = useState(false),
    // Collapsed sections are a view choice only; never saved.
    [hideDone, setHideDone] = useState(false),
    // Documents open in reading mode; the pencil enters edit mode.
    [reading, setReading] = useState(true),
    [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [status, setStatus] = useState<LocalizedText>(""),
    [editingName, setEditingName] = useState<string | null>(null),
    [quickNames, setQuickNames] = useState<Record<string, string>>({}),
    [itemQuery, setItemQuery] = useState(""),
    [itemGroup, setItemGroup] = useState<string | null>(null),
    [pickerQuery, setPickerQuery] = useState(""),
    [newDate, setNewDate] = useState(""),
    [addMode, setAddMode] = useState<"Item" | "Category">("Item"),
    [mergeTargets, setMergeTargets] = useState<Record<string, string>>({}),
    [entryMove, setEntryMove] = useState<any>(null),
    [noteEditor, setNoteEditor] = useState<any>(null),
    [sectionEditor, setSectionEditor] = useState<any>(null),
    [sectionName, setSectionName] = useState(""),
    [sectionParent, setSectionParent] = useState(""),
    [targetSection, setTargetSection] = useState(""),
    [historyAction, setHistoryAction] = useState<any>(null),
    [picker, setPicker] = useState<any[]>([]),
    [addOpen, setAddOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [archiving, setArchiving] = useState(false),
    [creating, setCreating] = useState(false),
    [newName, setNewName] = useState(""),
    [createBusy, setCreateBusy] = useState(false),
    [newItem, setNewItem] = useState<any>(null),
    [newItemBusy, setNewItemBusy] = useState(false),
    [newItemError, setNewItemError] = useState<LocalizedText>(""),
    [pickerOpen, setPickerOpen] = useState(false),
    [sectionError, setSectionError] = useState<LocalizedText>("");
  useEffect(() => {
    setStatusFilter(date ? "all" : "active");
  }, [date]);
  const latest = useRef<any>(null),
    saving = useRef(false),
    pending = useRef<any>(null),
    creation = useRef<any>(null),
    checks = useRef(new Map<string, Promise<any>>()),
    // Entry IDs the server knows; only these can be checked before a save.
    savedIds = useRef(new Set<string>()),
    saveDelay = useRef(0),
    failedChecks = useRef(new Map<string, { docId: string; request: any }>());
  const dirtyNow = useRef(false);
  const saveTask = useRef<Promise<void> | null>(null);
  const setDirty = (value: boolean) => {
    dirtyNow.current = value;
    updateDirty(value);
  };
  const newItemRequest = useRef<any>(null);
  const newItemCreated = useRef<any>(null);
  const newItemSaving = useRef(false);
  const newItemHost = useRef<HTMLDivElement>(null);
  const newItemMatches = sameName(items, newItem?.name);
  useEffect(() => {
    if (!newItemBusy && newItem?.name === "")
      newItemHost.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [newItemBusy]);
  useEffect(() => {
    if (!newItem)
      newItemHost.current
        ?.querySelector<HTMLButtonElement>(".form-actions .button")
        ?.focus();
  }, [!!newItem]);
  const archiveRequests = useRef(new Map<string, any>());
  const refresh = async () => {
    setList(await api("/documents"));
    await onScheduleChange();
  };
  useEffect(() => {
    let active = true;
    setDoc(null);
    setDirty(false);
    setMenuOpen(false);
    setAddOpen(false);
    setNewItem(null);
    setNewItemError("");
    setTargetSection("");
    setItemGroup(null);
    setSectionEditor(null);
    setEntryMove(null);
    setMergeTargets({});
    pending.current = null;
    checks.current.clear();
    failedChecks.current.clear();
    void refresh().catch((e) => {
      if (active) setStatus(errorText(e));
    });
    if (documentId)
      void (async () => {
        const d = await api("/documents/" + documentId);
        if (!active) return;
        if (d.kind !== kind)
          throw new Error(localized["This document belongs to another page."]);
        latest.current = d;
        savedIds.current = new Set(d.entries.map((e: any) => e.id));
        setDoc(d);
        setStatus("");
      })().catch((e) => {
        if (active) setStatus(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [kind, date, documentId]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (
        dirty ||
        newItemSaving.current ||
        newItemRequest.current ||
        checks.current.size ||
        failedChecks.current.size
      ) {
        e.preventDefault();
      }
    };
    leaveGuard.guard = async () => {
      if (newItemSaving.current || newItemRequest.current) return false;
      if (await flush()) {
        await Promise.all([...checks.current.values()]);
        if (!failedChecks.current.size) return true;
      }
      return ask(
        t(localized["Discard pending changes and leave?"]),
        t(localized["Discard and leave"]),
      );
    };
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
      setStatus(errorText(e));
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
  const changeChecklistStatus = async (target: any) => {
    if (archiving) return;
    setArchiving(true);
    try {
      await Promise.all([...checks.current.values()]);
      const request = archiveRequests.current.get(target.id) ?? {
        version: target.version,
        requestId: crypto.randomUUID(),
        ...(target.status === "archived"
          ? { action: "restore", name: target.name }
          : {}),
      };
      archiveRequests.current.set(target.id, request);
      const result = await api(
        target.status === "archived"
          ? "/documents/" + target.id + "/history-apply"
          : "/checklists/" + target.id + "/archive",
        "POST",
        request,
      );
      archiveRequests.current.delete(target.id);
      if (doc?.id === target.id) {
        latest.current = result;
        savedIds.current = new Set(result.entries.map((e: any) => e.id));
        setDoc(result);
      }
      await refresh();
    } finally {
      setArchiving(false);
    }
  };
  const editNext = useRef(false);
  useEffect(() => {
    setReading(kind !== "template" || !editNext.current);
    editNext.current = false;
  }, [documentId, kind]);
  const open = async (key: string) => {
    if (!(await leaveGuard.guard())) return;
    if (key !== documentId) {
      onNavigate(key);
      return;
    }
    pending.current = null;
    checks.current.clear();
    failedChecks.current.clear();
    const d = await api("/documents/" + key);
    savedIds.current = new Set(d.entries.map((e: any) => e.id));
    latest.current = d;
    setDoc(d);
    setDirty(false);
    setQuickNames({});
    setStatus("");
  };
  // Typing waits for a pause; one-shot edits such as drags save at once.
  const change = (next: any, typing = false) => {
    saveDelay.current = typing ? 500 : 0;
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
  function save(): Promise<void> {
    if (saveTask.current) return saveTask.current;
    const task = performSave().finally(() => {
      saveTask.current = null;
      if (dirtyNow.current && !pending.current) void save();
    });
    saveTask.current = task;
    return task;
  }
  async function flush() {
    if (saveTask.current) await saveTask.current;
    while (dirtyNow.current) {
      await save();
      if (pending.current) return false;
    }
    return true;
  }
  async function performSave() {
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
          sections: d.sections ?? [],
          requestId: crypto.randomUUID(),
        };
      }
      const sent = pending.current;
      const result = await api("/documents/" + latest.current.id, "PUT", sent);
      pending.current = null;
      savedIds.current = new Set(result.entries.map((e: any) => e.id));
      const current = latest.current;
      if (
        current.entries === sent.entries &&
        current.name === sent.name &&
        (kind !== "checklist" || (current.useDate ?? null) === sent.useDate) &&
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
    } catch (e) {
      setStatus(
        message(
          errorText(e),
          localized["; retry is available. Reload if there is a conflict."],
        ),
      );
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (dirty && !pending.current) {
      const timer = setTimeout(() => void save(), saveDelay.current);
      return () => clearTimeout(timer);
    }
  }, [doc, dirty, kind]);
  const newEntry = (item: any) => ({
    id: crypto.randomUUID(),
    itemId: item?.id || null,
    name: item?.name || t(localized["New entry"]),
    quantity: "",
    unit: "",
    note: "",
    checked: false,
    sectionId: targetSection || null,
  });
  function add(item: any) {
    const current = latest.current;
    const same = current.entries.filter(
      (e: any) => item && e.itemId === item.id,
    );
    if (same.length) {
      return;
    }
    change({ ...current, entries: [...current.entries, newEntry(item)] });
  }
  function closeNewItem() {
    if (
      newItemSaving.current ||
      (newItemRequest.current && !newItemCreated.current)
    )
      return;
    newItemRequest.current = null;
    newItemCreated.current = null;
    setNewItem(null);
  }
  async function createItem() {
    if (newItemSaving.current) return;
    newItemSaving.current = true;
    setNewItemBusy(true);
    setNewItemError("");
    newItemRequest.current ??= {
      ...newItem,
      name: newItem.name.trim(),
      itemGroup: newItem.itemGroup?.trim() || null,
      requestId: crypto.randomUUID(),
    };
    try {
      const item =
        newItemCreated.current ??
        (await api("/items", "POST", newItemRequest.current));
      newItemCreated.current = item;
      add(item);
      await refreshCatalog();
      newItemRequest.current = null;
      newItemCreated.current = null;
      setNewItem({
        name: "",
        note: "",
        itemGroup: itemGroup || null,
        categoryIds: [],
      });
    } catch (e) {
      if (!newItemCreated.current && e instanceof ApiError && e.status < 500)
        newItemRequest.current = null;
      setNewItemError(errorText(e));
    } finally {
      newItemSaving.current = false;
      setNewItemBusy(false);
    }
  }
  const updateEntry = (key: string, patch: any, typing = false) =>
    change(
      {
        ...latest.current,
        entries: latest.current.entries.map((e: any) =>
          e.id === key ? { ...e, ...patch } : e,
        ),
      },
      typing,
    );
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
      setStatus(message(errorText(e), localized["; retry the check."]));
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
  async function addCategory(categoryId: string) {
    const { itemIds } = await api("/categories/" + categoryId + "/order");
    const byId = new Map(items.map((i) => [i.id, i]));
    const members = itemIds.map((k: string) => byId.get(k)).filter(Boolean);
    addMembers(members);
  }
  // Merge into the latest draft, including edits and saves completed during loading.
  function addMembers(members: any[]) {
    change(
      addItems(
        latest.current,
        members,
        () => crypto.randomUUID(),
        targetSection || null,
      ),
    );
  }
  async function startHistory(action: string) {
    setMenuOpen(false);
    if (
      dirtyNow.current ||
      saving.current ||
      checks.current.size ||
      failedChecks.current.size
    ) {
      setStatus(localized["Save changes before using history actions."]);
      return;
    }
    const d = latest.current;
    const p = await api("/documents/" + d.id + "/history-preview", "POST", {
      action,
      version: d.version,
    });
    setHistoryAction({
      ...p,
      action,
      id: d.id,
      useDate: date ?? "",
      requestId: crypto.randomUUID(),
    });
    setMergeTargets({});
  }
  const create = () => {
    setStatus("");
    setNewName(creation.current?.name || "");
    setNewDate(creation.current?.useDate ?? date ?? "");
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
          ...(kind === "checklist" ? { useDate: newDate || null } : {}),
          name,
          entries: [],
          requestId: crypto.randomUUID(),
        };
      const d = await api("/documents", "POST", creation.current);
      creation.current = null;
      setStatus("");
      setCreating(false);
      await refresh();
      editNext.current = true;
      await open(d.id);
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) creation.current = null;
      setStatus(errorText(e));
    } finally {
      setCreateBusy(false);
    }
  };
  if (documentId && !doc)
    return (
      <Page
        title={
          kind === "template"
            ? t(localized["Template"])
            : t(localized["Checklist"])
        }
        showView={false}
        onBack={() => onNavigate(null)}
      >
        <p role="status">{t(status) || t(localized["Loading…"])}</p>
      </Page>
    );
  const display = doc;
  const itemGroups = [
    ...new Set<string>(items.map((i) => i.itemGroup).filter(Boolean)),
  ].sort(new Intl.Collator("zh-CN", { numeric: true }).compare);
  const matchingItems = items.filter(
    (i) => matchesItemGroup(i, itemGroup) && matchesSearch(itemQuery, i.name),
  );
  const matchingPickerItems = picker.filter(
    (i) => matchesItemGroup(i, itemGroup) && matchesSearch(pickerQuery, i.name),
  );
  // Progress and success fit beside the title; problems stay in the page.
  const quiet =
    [
      t(localized["Saving…"]),
      t(localized["Saved"]),
      t(localized["Check saved"]),
    ].includes(t(status)) || t(status).startsWith(t(localized["Completed "]));
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
  // Entries and sections share one order per parent; "into" nests in a section.
  function move(
    id: string,
    targetId: string,
    place: "before" | "after" | "into",
  ) {
    const next = moveNode(doc, id, targetId, place);
    try {
      // Rejects dropping into its own subtree or past two levels.
      validateSections(next);
    } catch {
      return;
    }
    if (place === "into")
      setCollapsed((prev) => {
        const open = new Set(prev);
        open.delete(targetId);
        return open;
      });
    change(next);
  }
  // Arrow keys: sections swap within their parent; entries walk the visible
  // rows, entering a section below them and leaving one above them.
  function step(id: string, parent: string | null, direction: number) {
    const place = direction > 0 ? "after" : "before";
    const sibling = doc.sections?.some((s: any) => s.id === id);
    const ids = (sibling ? children(doc, parent) : contentRows(doc, true)).map(
      (n: any) => nodeId(n),
    );
    const target = ids[ids.indexOf(id) + direction];
    const heading = !sibling && doc.sections?.some((s: any) => s.id === target);
    if (target) move(id, target, heading && direction > 0 ? "into" : place);
  }
  function sectionOptions() {
    return [
      { value: "", label: t(localized["Root"]) },
      ...(doc.sections ?? []).map((s: any) => ({
        value: s.id,
        label: sectionLabel(s.id),
      })),
    ];
  }
  function contentRows(content: any, folded = false, quick = false): any[] {
    const rows: any[] = [];
    const walk = (parent: string | null, depth: number) => {
      let nodes = children(content, parent);
      // Completion changes the view only; persisted order and section ownership stay intact.
      if (folded && kind === "checklist") {
        nodes = nodes.filter(
          (node) => !(hideDone && "entry" in node && node.entry.checked),
        );
        nodes = [
          ...nodes.filter((node) => !("entry" in node && node.entry.checked)),
          ...nodes.filter((node) => "entry" in node && node.entry.checked),
        ];
      }
      for (const node of nodes) {
        if ("entry" in node) rows.push({ entry: node.entry, depth, parent });
        else if (depth < 3) {
          rows.push({ section: node.section, depth, parent });
          if (!(folded && collapsed.has(node.section.id)))
            walk(node.section.id, depth + 1);
        }
      }
      if (quick && parent) rows.push({ quick: true, parent, depth });
    };
    walk(null, 0);
    return rows;
  }

  function quickEntry(sectionId: string | null, depth: number) {
    const key = sectionId ?? "root";
    const label = doc.sections?.find((s: any) => s.id === sectionId)?.name;
    const value = quickNames[key] ?? "";
    const set = (name: string) =>
      setQuickNames((names) => ({ ...names, [key]: name }));
    return (
      <div
        className="quick-entry"
        key={"quick-entry:" + key}
        data-depth={depth}
      >
        <Icon name="add" />
        <input
          aria-label={
            label
              ? t(localized["New temporary entry · "]) + label
              : t(localized["New temporary entry"])
          }
          placeholder={
            label
              ? t(localized["Add to “"]) +
                label +
                t(localized["Add prompt suffix"])
              : t(localized["Add temporary entry…"])
          }
          value={value}
          data-1p-ignore="true"
          autoComplete="off"
          onChange={(event) => set(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              set("");
              event.currentTarget.blur();
            }
            if (
              event.key !== "Enter" ||
              event.nativeEvent.isComposing ||
              !value.trim()
            )
              return;
            event.preventDefault();
            void attempt(async () => {
              change({
                ...latest.current,
                entries: [
                  ...latest.current.entries,
                  { ...newEntry(null), name: value.trim(), sectionId },
                ],
              });
              set("");
              if (kind === "checklist") await save();
            });
          }}
        />
      </div>
    );
  }

  const records = list.filter(
    (d) =>
      d.kind === kind &&
      (kind !== "checklist" ||
        statusFilter === "all" ||
        d.status === statusFilter) &&
      (kind !== "checklist" || !date || d.useDate === date) &&
      matchesSearch(
        query,
        d.name,
        d.useDate,
        d.status === "archived"
          ? t(localized["Archived"])
          : t(localized["Active"]),
      ),
  );

  return (
    <Page
      search={!doc ? { value: query, onChange: onSearch } : undefined}
      title={
        doc
          ? display.name
          : kind === "template"
            ? t(localized["Template"])
            : t(localized["Checklist"])
      }
      onBack={
        doc
          ? async () => {
              if (await leaveGuard.guard()) {
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
        doc && doc.status === "active"
          ? [
              ...(kind === "checklist"
                ? [
                    {
                      label: hideDone
                        ? t(localized["Show completed"])
                        : t(localized["Hide completed"]),
                      icon: "completed" as const,
                      iconOnly: true,
                      pressed: !hideDone,
                      onClick: () => setHideDone((value) => !value),
                    },
                  ]
                : []),
              // Reading mode drops edit actions instead of keeping blank slots.
              ...(reading
                ? []
                : [
                    {
                      label: t(localized["New section"]),
                      icon: "sectionAdd" as const,
                      iconOnly: true,
                      onClick: () => {
                        setSectionEditor({});
                        setSectionName("");
                        setSectionParent("");
                      },
                    },
                  ]),
              ...(!reading
                ? [
                    {
                      label: t(localized["Add entries"]),
                      icon: "add" as const,
                      iconOnly: true,
                      onClick: () => setAddOpen(true),
                    },
                  ]
                : []),
              {
                label: reading
                  ? t(localized["Edit mode"])
                  : t(localized["Done editing"]),
                icon: reading ? ("edit" as const) : ("check" as const),
                pressed: !reading,
                iconOnly: true,
                onClick: () => setReading((value) => !value),
              },
            ]
          : undefined
      }
      primaryAction={
        !doc
          ? {
              label:
                t(localized["New "]) +
                (kind === "template"
                  ? t(localized["Template"])
                  : t(localized["Checklist"])),
              onClick: create,
            }
          : kind === "template"
            ? reading
              ? // Flush pending edits before instantiating the current template.
                {
                  label: t(localized["Create checklist"]),
                  icon: "checklist",
                  disabled: !!pending.current && !saving.current,
                  onClick: () =>
                    void attempt(async () => {
                      if (await flush()) await startHistory("instantiate");
                    }),
                }
              : undefined
            : undefined
      }
      filter={
        !doc && kind === "checklist"
          ? {
              label: t(localized["Checklist status"]),
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: "active", label: t(localized["Active"]) },
                { value: "archived", label: t(localized["Archived"]) },
                { value: "all", label: t(localized["All"]) },
              ],
            }
          : undefined
      }
      showView={!doc}
      // The list's date filter uses the same small grey slot beside the title.
      status={
        doc ? (quiet ? status : "") : kind === "checklist" ? (date ?? "") : ""
      }
    >
      {!quiet && status && (
        <p role="alert" className="error">
          {t(status)}
          {pending.current && !saving.current && (
            <Button onClick={() => void save()}>
              {t(localized["Retry save"])}
            </Button>
          )}
        </p>
      )}
      {creating && (
        <ResourceDialog
          title={
            t(localized["New "]) +
            (kind === "template"
              ? t(localized["Template"])
              : t(localized["Checklist"]))
          }
          name={newName}
          onNameChange={setNewName}
          error={t(status)}
          fieldsDisabled={createBusy || !!creation.current}
          cancelDisabled={createBusy || !!creation.current}
          submitDisabled={createBusy}
          submitLabel={
            createBusy
              ? t(localized["Creating…"])
              : creation.current
                ? t(localized["Retry creation"])
                : t(localized["Create"])
          }
          onSubmit={() => {
            void submitCreate();
          }}
          onClose={() => {
            if (!createBusy && !creation.current) setCreating(false);
          }}
        >
          {kind === "checklist" && (
            <label>
              {t(localized["Use date (optional)"])}
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </label>
          )}
        </ResourceDialog>
      )}

      {failedChecks.current.size > 0 && (
        <Button
          onClick={() => {
            for (const [key, failed] of failedChecks.current)
              void sendCheck(failed.docId, key, failed.request);
          }}
        >
          {t(localized["Retry check"])}
        </Button>
      )}
      {pickerOpen && (
        <Modal
          aria-label={t(localized["Choose item from category"])}
          onClose={() => setPickerOpen(false)}
        >
          <h3>{t(localized["Choose item"])}</h3>
          <ItemGroupFilter
            groups={itemGroups}
            value={itemGroup}
            onChange={setItemGroup}
          />
          <input
            aria-label={t(localized["Search "]) + resourceLabels.Item}
            placeholder={
              t(localized["Search by name or pinyin "]) + resourceLabels.Item
            }
            data-1p-ignore="true"
            autoComplete="off"
            value={pickerQuery}
            onChange={(event) => setPickerQuery(event.target.value)}
          />
          <div className="add-list">
            {matchingPickerItems.length ? (
              matchingPickerItems.map((i) => (
                <Button
                  key={i.id}
                  variant="ghost"
                  onClick={() => {
                    add(i);
                  }}
                >
                  {i.name}
                </Button>
              ))
            ) : (
              <p>
                {t(localized["No matching"])}
                {" " + resourceLabels.Item}
              </p>
            )}
          </div>
          <Button onClick={() => setPickerOpen(false)}>
            {t(localized["Done"])}
          </Button>
        </Modal>
      )}
      {noteEditor && (
        <Modal
          aria-label={t(localized["Edit note"])}
          onClose={() => setNoteEditor(null)}
        >
          <h3>
            {noteEditor.name}
            {t(localized["'s note"])}
          </h3>
          <label>
            {t(localized["Note"])}
            <textarea
              data-1p-ignore="true"
              autoComplete="off"
              autoFocus
              value={noteEditor.note}
              onChange={(ev) =>
                setNoteEditor({ ...noteEditor, note: ev.target.value })
              }
            />
          </label>
          <div className="form-actions">
            <Button
              variant="primary"
              onClick={() => {
                updateEntry(noteEditor.id, { note: noteEditor.note });
                setNoteEditor(null);
              }}
            >
              {t(localized["Save"])}
            </Button>
            <Button onClick={() => setNoteEditor(null)}>
              {t(localized["Cancel"])}
            </Button>
          </div>
        </Modal>
      )}
      {entryMove && (
        <Modal
          aria-label={t(localized["Move entry"])}
          onClose={() => setEntryMove(null)}
        >
          <h3>
            {t(localized["Move"])}
            {entryMove.name}
          </h3>
          <label>
            {t(localized["Section"])}
            <Select
              aria-label={t(localized["Section "]) + entryMove.name}
              value={entryMove.sectionId || ""}
              onChange={(id) =>
                setEntryMove({ ...entryMove, sectionId: id || null })
              }
              options={sectionOptions()}
            />
          </label>
          <Button
            onClick={() => {
              updateEntry(entryMove.id, { sectionId: entryMove.sectionId });
              setEntryMove(null);
            }}
          >
            {t(localized["Move"])}
          </Button>
          <Button onClick={() => setEntryMove(null)}>
            {t(localized["Cancel"])}
          </Button>
        </Modal>
      )}
      {sectionEditor && (
        <ResourceDialog
          submitLabel={t(localized["Save section"])}
          title={
            sectionEditor.id
              ? t(localized["Edit section"])
              : t(localized["New section"])
          }
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
              setSectionError(errorText(e));
            }
          }}
        >
          <label>
            {t(localized["Parent section"])}
            <Select
              aria-label={t(localized["Parent section"])}
              value={sectionParent}
              onChange={setSectionParent}
              options={sectionOptions().filter(
                (o) =>
                  o.value !== sectionEditor.id &&
                  (!o.value ||
                    !(doc.sections ?? []).find((s: any) => s.id === o.value)
                      ?.parentSectionId),
              )}
            />
          </label>
        </ResourceDialog>
      )}
      {!doc ? (
        <>
          <Collection>
            {records.map((d) => (
              <RecordCard
                key={d.id}
                name={d.name}
                onOpen={() => void attempt(() => open(d.id))}
                actions={
                  kind === "checklist" ? (
                    <Button
                      variant="icon"
                      aria-label={t(
                        localized[
                          d.status === "archived" ? "Activate" : "Archive"
                        ],
                      )}
                      title={t(
                        localized[
                          d.status === "archived" ? "Activate" : "Archive"
                        ],
                      )}
                      disabled={archiving}
                      onClick={() =>
                        void attempt(() => changeChecklistStatus(d))
                      }
                    >
                      <Icon
                        name={d.status === "archived" ? "activate" : "archive"}
                      />
                    </Button>
                  ) : undefined
                }
              >
                <h3>{d.name}</h3>
                <p
                  className={
                    kind === "checklist" ? "checklist-meta" : undefined
                  }
                >
                  {(kind === "checklist" || d.useDate) && (
                    <span className="document-date">
                      {d.useDate}
                      <span className="document-meta-separator"> · </span>
                    </span>
                  )}
                  {kind === "checklist" ? (
                    <span
                      className="document-progress"
                      aria-label={
                        t(localized["Completed "]) + d.done + "/" + d.total + ""
                      }
                      title={
                        t(localized["Completed "]) + d.done + "/" + d.total + ""
                      }
                    >
                      <Icon name="check" />
                      {d.done}/{d.total}
                    </span>
                  ) : (
                    "" + d.total + t(localized[" items"])
                  )}
                  {d.status === "archived" && (
                    <span className="document-archive">
                      <span className="document-meta-separator"> · </span>
                      {t(localized["Archived"])}
                    </span>
                  )}
                </p>
              </RecordCard>
            ))}
          </Collection>
          {query.trim() && records.length === 0 && (
            <p className="empty">{t(localized["No matching results."])}</p>
          )}
        </>
      ) : (
        <>
          {menuOpen && (
            <Modal
              aria-label={t(localized["Checklist settings"])}
              onClose={() => setMenuOpen(false)}
            >
              <h3>{t(localized["Settings and actions"])}</h3>
              <label>
                {t(localized["Name"])}
                <input
                  data-1p-ignore="true"
                  autoComplete="off"
                  value={display.name}
                  disabled={doc.status === "archived"}
                  onChange={(e) =>
                    change({ ...doc, name: e.target.value }, true)
                  }
                />
              </label>
              {kind === "checklist" && (
                <label>
                  {t(localized["Use date"])}
                  <input
                    type="date"
                    aria-label={t(localized["Use date"])}
                    data-1p-ignore="true"
                    value={display.useDate ?? ""}
                    disabled={doc.status === "archived"}
                    onChange={(e) =>
                      change({
                        ...latest.current,
                        useDate: e.target.value || null,
                      })
                    }
                  />
                </label>
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
                        if (
                          !dirty ||
                          (await ask(
                            t(localized["Discard local changes and reload?"]),
                            t(localized["Reload"]),
                          ))
                        ) {
                          pending.current = null;
                          setDirty(false);
                          await open(doc.id);
                        }
                      })
                    }
                  >
                    {t(localized["Reload"])}
                  </Button>
                </div>
                <div className="toolbar">
                  {kind === "checklist" && doc.status === "active" && (
                    <Button
                      disabled={
                        dirty ||
                        saving.current ||
                        checks.current.size > 0 ||
                        failedChecks.current.size > 0
                      }
                      onClick={() =>
                        void attempt(() => changeChecklistStatus(doc))
                      }
                    >
                      {t(localized["Archive"])}
                    </Button>
                  )}
                  {doc.status === "archived" && (
                    <Button
                      onClick={() =>
                        void attempt(() => startHistory("restore"))
                      }
                    >
                      {t(localized["Restore archive"])}
                    </Button>
                  )}
                  {kind === "checklist" && (
                    <>
                      <Button
                        onClick={() => void attempt(() => startHistory("copy"))}
                      >
                        {t(localized["Copy checklist"])}
                      </Button>
                      <Button
                        onClick={() =>
                          void attempt(() => startHistory("template"))
                        }
                      >
                        {t(localized["Convert to template"])}
                      </Button>
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
                      onClick={async () => {
                        if (
                          await ask(
                            t(
                              localized[
                                "Delete this template? Existing checklists will be kept."
                              ],
                            ),
                            t(localized["Delete template"]),
                          )
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
                    >
                      <Icon name="trash" />
                      {t(localized["Delete template"])}
                    </Button>
                  )}
                  {kind === "checklist" && (
                    <Button
                      variant="danger"
                      disabled={
                        dirty ||
                        saving.current ||
                        checks.current.size > 0 ||
                        failedChecks.current.size > 0
                      }
                      onClick={async () => {
                        if (
                          await ask(
                            t(
                              localized[
                                "Permanently delete this checklist? This cannot be undone."
                              ],
                            ),
                            t(localized["Delete checklist"]),
                          )
                        )
                          void attempt(async () => {
                            await api("/checklists/" + doc.id, "DELETE", {
                              version: doc.version,
                              confirm: true,
                            });
                            onNavigate(null);
                            setDoc(null);
                            await refresh();
                          });
                      }}
                    >
                      <Icon name="trash" />
                      {t(localized["Delete checklist"])}
                    </Button>
                  )}
                </div>
              </div>
            </Modal>
          )}
          {historyAction && (
            <Modal
              onClose={() => setHistoryAction(null)}
              aria-label={t(localized["History actions"])}
            >
              <h3>
                {t(localized["Confirm"])}
                {t(
                  (
                    {
                      instantiate: localized["Create checklist"],
                      copy: localized["Copy checklist"],
                      restore: localized["Restore checklist"],
                      template: localized["Convert to template"],
                    } as Record<string, string>
                  )[historyAction.action],
                )}
              </h3>
              <p className="error">{t(status)}</p>
              <label>
                {t(localized["Name"])}
                <input
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
              {(historyAction.action === "instantiate" ||
                historyAction.action === "copy") && (
                <label>
                  {t(localized["Use date (optional)"])}
                  <input
                    type="date"
                    value={historyAction.useDate}
                    onChange={(e) =>
                      setHistoryAction({
                        ...historyAction,
                        useDate: e.target.value,
                        requestId: crypto.randomUUID(),
                      })
                    }
                  />
                </label>
              )}
              {historyAction.items.length > 0 && (
                <p>
                  {t(
                    localized[
                      "Deleted items will be kept as temporary entries. Their content is preserved."
                    ],
                  )}
                </p>
              )}
              {(historyAction.duplicates ?? []).map((d: any) => (
                <label key={d.itemId}>
                  {d.entries[0].name}
                  {t(localized[": choose values to keep"])}
                  <Select
                    aria-label={
                      d.entries[0].name +
                      t(localized[": choose values to keep"])
                    }
                    placeholder={t(localized["Choose"])}
                    value={mergeTargets[d.itemId] || ""}
                    options={d.entries.map((e: any) => ({
                      value: e.id,
                      label: [
                        e.note,
                        e.checked
                          ? t(localized["Checked"])
                          : t(localized["Unchecked"]),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    }))}
                    onChange={(id) => {
                      setMergeTargets({
                        ...mergeTargets,
                        [d.itemId]: id,
                      });
                      setHistoryAction({
                        ...historyAction,
                        requestId: crypto.randomUUID(),
                      });
                    }}
                  />
                </label>
              ))}
              <Button
                onClick={() =>
                  void attempt(async () => {
                    const body = {
                      action: historyAction.action,
                      name: historyAction.name,
                      version: historyAction.version,
                      requestId: historyAction.requestId,
                      mergeTargets,
                      ...(historyAction.useDate
                        ? { useDate: historyAction.useDate }
                        : {}),
                    };
                    const result = await api(
                      "/documents/" + historyAction.id + "/history-apply",
                      "POST",
                      body,
                    );
                    setHistoryAction(null);
                    setStatus(
                      message(localized["Completed "], {
                        literal: result.name,
                      }),
                    );
                    await refreshCatalog();
                    await refresh();
                    if (result.kind === kind) await open(result.id);
                  })
                }
              >
                {t(localized["Confirm / Retry"])}
              </Button>
              <Button onClick={() => setHistoryAction(null)}>
                {t(localized["Cancel"])}
              </Button>
            </Modal>
          )}
          {kind === "checklist" && (
            <p className="entries-progress">
              {display.entries.filter((e: any) => e.checked).length} /{" "}
              {display.entries.length}
              {t(localized["Completed"])}
            </p>
          )}
          {addOpen && doc.status === "active" && (
            <Modal
              aria-label={
                newItem ? t(localized["New item"]) : t(localized["Add entries"])
              }
              onClose={() => (newItem ? closeNewItem() : setAddOpen(false))}
            >
              <div ref={newItemHost}>
                {newItem ? (
                  <ResourceForm
                    title={t(localized["New item"])}
                    name={newItem.name}
                    onNameChange={(name) => setNewItem({ ...newItem, name })}
                    error={newItemError}
                    fieldsDisabled={newItemBusy || !!newItemRequest.current}
                    submitDisabled={newItemBusy}
                    cancelDisabled={
                      newItemBusy ||
                      (!!newItemRequest.current && !newItemCreated.current)
                    }
                    submitLabel={
                      newItemRequest.current
                        ? t(localized["Retry save"])
                        : newItemMatches.length
                          ? t(localized["Create a separate item"])
                          : t(localized["Create and add"])
                    }
                    onSubmit={() => void createItem()}
                    onClose={closeNewItem}
                  >
                    <ItemNameMatches
                      items={newItemMatches}
                      categories={categories}
                      onSelect={(item) => {
                        add(item);
                        setNewItem(null);
                      }}
                    />
                    <p>
                      {t(
                        localized[
                          "Create an item in the catalog and add it to the current section."
                        ],
                      )}
                    </p>
                    <ItemFields
                      value={newItem}
                      onChange={setNewItem}
                      categories={categories}
                      itemGroups={itemGroups}
                    />
                  </ResourceForm>
                ) : (
                  <>
                    <h3>{t(localized["Add entries"])}</h3>
                    <label>
                      {t(localized["Add to section"])}
                      <Select
                        aria-label={t(localized["Add to section"])}
                        value={targetSection}
                        onChange={setTargetSection}
                        options={sectionOptions()}
                      />
                    </label>
                    {/* One source at a time: pick an Item, or act on a whole Category. */}
                    <div className="add-sources">
                      <div
                        className="view-switch source-switch"
                        role="tablist"
                        aria-label={t(localized["Entry source"])}
                      >
                        {(["Item", "Category"] as const).map((mode) => (
                          <Button
                            key={mode}
                            variant="ghost"
                            role="tab"
                            aria-label={
                              mode === "Item"
                                ? t(localized["Add from items"])
                                : t(localized["Add from categories"])
                            }
                            aria-selected={addMode === mode}
                            onClick={() => {
                              setAddMode(mode);
                              setItemQuery("");
                            }}
                          >
                            <Icon
                              name={mode === "Item" ? "item" : "category"}
                            />
                            {mode === "Item"
                              ? t(localized["Item"])
                              : t(localized["Category"])}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <ItemGroupFilter
                      groups={itemGroups}
                      value={itemGroup}
                      onChange={setItemGroup}
                      disabled={addMode === "Category"}
                    />
                    <input
                      aria-label={
                        t(localized["Search "]) + resourceLabels[addMode]
                      }
                      placeholder={
                        t(localized["Search by name or pinyin "]) +
                        resourceLabels[addMode]
                      }
                      data-1p-ignore="true"
                      autoComplete="off"
                      value={itemQuery}
                      onChange={(e) => setItemQuery(e.target.value)}
                    />
                    <div className="add-list" role="tabpanel">
                      {addMode === "Item" &&
                        [
                          ...new Set(
                            matchingItems.map((i) => i.itemGroup ?? ""),
                          ),
                        ]
                          .sort((a, b) =>
                            a ? (b ? a.localeCompare(b) : 1) : -1,
                          )
                          .map((group) => {
                            const members = matchingItems.filter(
                              (i) => (i.itemGroup ?? "") === group,
                            );
                            const label = group || t(localized["Ungrouped"]);
                            return (
                              <React.Fragment key={"group:" + group}>
                                <div className="add-group">
                                  <span>{label}</span>
                                  <Button
                                    variant="icon"
                                    aria-label={
                                      t(localized["Add whole group "]) + label
                                    }
                                    title={
                                      t(localized["Add whole group "]) + label
                                    }
                                    onClick={() => addMembers(members)}
                                  >
                                    <Icon name="add" />
                                  </Button>
                                </div>
                                {members.map((i) => (
                                  <Button
                                    variant="ghost"
                                    key={i.id}
                                    onClick={() => add(i)}
                                  >
                                    <span>{i.name}</span>
                                    <Icon name="add" />
                                  </Button>
                                ))}
                              </React.Fragment>
                            );
                          })}
                      {addMode === "Category" &&
                        categories
                          .filter((c) => matchesSearch(itemQuery, c.name))
                          .map((c) => (
                            <div key={c.id} className="add-category">
                              <span>{c.name}</span>
                              <Button
                                variant="ghost"
                                aria-label={
                                  t(localized["From "]) +
                                  c.name +
                                  t(localized[" Choose item"])
                                }
                                onClick={() =>
                                  void attempt(async () => {
                                    const members = await api(
                                      "/categories/" + c.id + "/members",
                                    );
                                    setPicker(
                                      items.filter((i) =>
                                        members.itemIds.includes(i.id),
                                      ),
                                    );
                                    setAddOpen(false);
                                    setPickerQuery("");
                                    setPickerOpen(true);
                                  })
                                }
                              >
                                {t(localized["Choose item [f00f6cfadf64]"])}
                              </Button>
                              <Button
                                variant="ghost"
                                aria-label={
                                  t(localized["Add category "]) + c.name
                                }
                                onClick={() =>
                                  void attempt(async () => {
                                    await addCategory(c.id);
                                  })
                                }
                              >
                                {t(localized["Add category"])}
                              </Button>
                            </div>
                          ))}
                      {(addMode === "Item"
                        ? matchingItems.length === 0
                        : !categories.some((x) =>
                            matchesSearch(itemQuery, x.name),
                          )) && (
                        <p>
                          {t(localized["No matching"])}
                          {" " + resourceLabels[addMode]}
                        </p>
                      )}
                    </div>
                    <div className="form-actions">
                      {addMode === "Item" && (
                        <Button
                          onClick={() => {
                            setNewItem({
                              name: "",
                              note: "",
                              itemGroup: itemGroup || null,
                              categoryIds: [],
                            });
                            setNewItemError("");
                          }}
                        >
                          {t(localized["New item"])}
                        </Button>
                      )}
                      <Button onClick={() => setAddOpen(false)}>
                        {t(localized["Done"])}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Modal>
          )}
          <div className="entries">
            {contentRows(
              display,
              true,
              doc.status === "active" && !reading,
            ).map((row: any, index: number, rows: any[]) =>
              row.quick ? (
                quickEntry(row.parent, row.depth)
              ) : row.section ? (
                <SortableRow
                  as="div"
                  data-nest=""
                  data-group-end={
                    index === rows.length - 1 ||
                    rows[index + 1].depth === 0 ||
                    undefined
                  }
                  id={row.section.id}
                  className={"entry section-heading level-" + (row.depth + 1)}
                  key={row.section.id}
                  dragLabel={row.section.name}
                  disabled={doc.status !== "active" || reading}
                  tabIndex={doc.status === "active" && !reading ? 0 : undefined}
                  aria-label={t(localized["Section "]) + row.section.name}
                  // The whole heading toggles; its edit/delete buttons do not.
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "button:not(.section-toggle),summary",
                      )
                    )
                      return;
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (!next.delete(row.section.id))
                        next.add(row.section.id);
                      return next;
                    });
                  }}
                  onMove={(target, after) =>
                    move(row.section.id, target, after ? "after" : "before")
                  }
                  onNest={(target) => move(row.section.id, target, "into")}
                  onStep={(direction) =>
                    step(row.section.id, row.parent, direction)
                  }
                  style={{
                    paddingLeft: `calc(var(--space-4) + ${row.depth} * var(--space-4))`,
                  }}
                >
                  <Button
                    variant="icon"
                    className="section-toggle"
                    aria-expanded={!collapsed.has(row.section.id)}
                    aria-label={
                      (collapsed.has(row.section.id)
                        ? t(localized["Expand "])
                        : t(localized["Collapse "])) + row.section.name
                    }
                  >
                    <Icon name="forward" />
                  </Button>
                  <strong title={row.section.name}>{row.section.name}</strong>
                  {doc.status === "active" && !reading && (
                    <ActionTools>
                      <Button
                        variant="icon"
                        aria-label={
                          t(localized["Edit section "]) + row.section.name
                        }
                        onClick={() => {
                          setSectionEditor(row.section);
                          setSectionName(row.section.name);
                          setSectionParent(row.section.parentSectionId || "");
                        }}
                      >
                        <Icon name="edit" />
                      </Button>
                      <Button
                        className="danger"
                        variant="icon"
                        aria-label={
                          t(localized["Delete section "]) + row.section.name
                        }
                        title={t(
                          localized["Delete section and move content up"],
                        )}
                        onClick={() =>
                          change({
                            ...doc,
                            ...removeSection(doc, row.section.id),
                          })
                        }
                      >
                        <Icon name="trash" />
                      </Button>
                    </ActionTools>
                  )}
                </SortableRow>
              ) : (
                (() => {
                  const e = row.entry;
                  const linkedItem =
                    doc.status === "active"
                      ? items.find((i) => i.id === e.itemId)
                      : null;
                  const editable = doc.status === "active" && !reading;
                  const nameInput =
                    editable && !e.itemId && editingName !== e.id ? (
                      <button
                        type="button"
                        className={
                          "name entry-name-display " +
                          (e.checked ? "checked" : "")
                        }
                        aria-label={t(localized["Entry name"])}
                        onClick={() => setEditingName(e.id)}
                      >
                        {e.name}
                      </button>
                    ) : (
                      <input
                        autoFocus={editingName === e.id}
                        onBlur={() => setEditingName(null)}
                        onKeyDown={(event) => {
                          if (
                            event.key !== "Enter" ||
                            event.nativeEvent.isComposing ||
                            !e.name.trim()
                          )
                            return;
                          event.preventDefault();
                          if (kind === "checklist") void save();
                          setEditingName(null);
                        }}
                        data-1p-ignore="true"
                        autoComplete="off"
                        aria-label={t(localized["Entry name"])}
                        className={"name " + (e.checked ? "checked" : "")}
                        value={linkedItem?.name || e.name}
                        disabled={!!e.itemId || doc.status === "archived"}
                        onChange={(ev) =>
                          updateEntry(e.id, { name: ev.target.value }, true)
                        }
                      />
                    );
                  const nameControl = (
                    <div className="entry-name">
                      {nameInput}
                      {e.note && (
                        <p className="entry-note" title={e.note}>
                          {e.note}
                        </p>
                      )}
                    </div>
                  );
                  return (
                    <SortableRow
                      key={e.id}
                      as="div"
                      id={e.id}
                      className="entry"
                      data-completed={
                        (kind === "checklist" && e.checked) || undefined
                      }
                      data-depth={row.depth}
                      data-group-end={
                        index === rows.length - 1 ||
                        rows[index + 1].depth === 0 ||
                        undefined
                      }
                      dragLabel={e.name}
                      disabled={!editable}
                      onMove={(target, after) =>
                        move(e.id, target, after ? "after" : "before")
                      }
                      onNest={(target) => move(e.id, target, "into")}
                      onStep={(direction) => step(e.id, row.parent, direction)}
                      tabIndex={editable ? 0 : undefined}
                      aria-label={e.name}
                      style={{
                        paddingLeft: "var(--space-4)",
                      }}
                    >
                      {kind === "checklist" && (
                        <span className="entry-check">
                          <input
                            data-1p-ignore="true"
                            autoComplete="off"
                            aria-label={t(localized["Check "]) + e.name}
                            type="checkbox"
                            style={{
                              marginRight: "0",
                            }}
                            disabled={
                              doc.status === "archived" ||
                              !savedIds.current.has(e.id) ||
                              checks.current.has(e.id) ||
                              failedChecks.current.has(e.id)
                            }
                            checked={e.checked}
                            onChange={(ev) => checked(e, ev.target.checked)}
                          />

                          <Icon name="check" />
                        </span>
                      )}
                      {/* Template edit mode drops Item info to focus on editing. */}
                      {linkedItem && !(kind === "template" && !reading) ? (
                        <ItemSummary
                          item={linkedItem}
                          categories={categories}
                          name={nameControl}
                          maxTags={1}
                        />
                      ) : (
                        nameControl
                      )}
                      {editable && (
                        <ActionTools>
                          {editable && (
                            <Button
                              variant="icon"
                              aria-label={t(localized["Edit note "]) + e.name}
                              title={t(localized["Edit note"])}
                              onClick={() =>
                                setNoteEditor({
                                  id: e.id,
                                  name: e.name,
                                  note: e.note,
                                })
                              }
                            >
                              <Icon name="edit" />
                            </Button>
                          )}
                          {doc.status === "active" && (
                            <>
                              {(doc.sections ?? []).length > 0 && (
                                <Button
                                  variant="icon"
                                  aria-label={t(localized["Move "]) + e.name}
                                  title={t(localized["Move to section"])}
                                  onClick={() => setEntryMove(e)}
                                >
                                  <Icon name="forward" />
                                </Button>
                              )}
                              <Button
                                variant="icon"
                                aria-label={t(localized["Remove "]) + e.name}
                                title={t(localized["Remove"])}
                                onClick={() =>
                                  change({
                                    ...doc,
                                    entries: doc.entries.filter(
                                      (x: any) => x.id !== e.id,
                                    ),
                                  })
                                }
                              >
                                <Icon name="trash" />
                              </Button>
                            </>
                          )}
                        </ActionTools>
                      )}
                    </SortableRow>
                  );
                })()
              ),
            )}
          </div>
          {doc.status === "active" && !reading && quickEntry(null, 0)}
        </>
      )}
    </Page>
  );
}
