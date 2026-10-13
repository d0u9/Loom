import localized from "../locales/zh.json" with { type: "json" };
import { t, message, type LocalizedText } from "./i18n.js";
import { errorText } from "./labels.js";
import { ItemSummary } from "./item-summary.js";
import { Icon } from "./layout.js";
import { Button } from "./button.js";
import { Collection, RecordCard } from "./collection.js";
import { Modal } from "./modal.js";
import { Select } from "./select.js";
import { ResourceForm } from "./resource-dialog.js";
import { ItemFields } from "./item-fields.js";
import { ItemGroupFilter, matchesItemGroup } from "./item-group-filter.js";
import { api, ApiError } from "./client.js";
import React, { useState, useEffect, useRef } from "react";

export function CategoryList({
  adding,
  onCloseAdd,
  category,
  categories,
  items,
  onOpen,
  onEdit,
  itemGroups,
  onMembers,
  onSorted,
}: {
  adding: boolean;
  onCloseAdd: () => void;
  category: any;
  categories: any[];
  items: any[];
  onOpen: (id: string | null) => void;
  onEdit: (item: any) => void;
  itemGroups: string[];
  onMembers: (item: any, categoryIds: string[]) => Promise<void>;
  onSorted: () => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [itemGroup, setItemGroup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [createError, setCreateError] = useState<LocalizedText>("");
  const createPending = useRef<any>(null);
  const createForm = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!busy && draft?.name === "")
      createForm.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [busy]);
  useEffect(() => {
    if (!adding) {
      setDraft(null);
      setCreateError("");
    }
  }, [adding]);
  async function createMember() {
    if (busy) return;
    setBusy(true);
    setCreateError("");
    createPending.current ??= {
      ...draft,
      itemGroup: draft.itemGroup?.trim() || null,
      requestId: crypto.randomUUID(),
    };
    try {
      await api("/items", "POST", createPending.current);
      await onSorted();
      createPending.current = null;
      setDraft({
        name: "",
        note: "",
        itemGroup: null,
        categoryIds: [category.id],
      });
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) createPending.current = null;
      setCreateError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const [order, setOrder] = useState<{
    itemIds: string[];
    version: number;
  } | null>(null);
  const [sortError, setSortError] = useState<LocalizedText>("");
  const pendingOrder = useRef<any>(null);
  const loadOrder = async () =>
    setOrder(await api(`/categories/${category.id}/order`));
  useEffect(() => {
    void loadOrder().catch((e) => setSortError(errorText(e)));
  }, [category.id, items, categories]);
  async function saveOrder(ids: string[]) {
    if (!order || busy) return;
    setBusy(true);
    setSortError("");
    if (!pendingOrder.current)
      pendingOrder.current = {
        itemIds: ids,
        version: order.version,
        requestId: crypto.randomUUID(),
      };
    try {
      setOrder(
        await api(
          `/categories/${category.id}/order`,
          "PUT",
          pendingOrder.current,
        ),
      );
      pendingOrder.current = null;
      await onSorted();
    } catch (e) {
      setSortError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function move(key: string, target: string) {
    const ids = members.map((i) => i.id),
      from = ids.indexOf(key),
      to = ids.indexOf(target);
    if (from < 0 || to < 0 || from === to || pendingOrder.current) return;
    ids.splice(from, 1);
    ids.splice(to, 0, key);
    void saveOrder(ids);
  }

  const members = (order?.itemIds ?? [])
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean);
  const availableItems = items.filter(
    (i) =>
      !i.categoryIds.includes(category.id) && matchesItemGroup(i, itemGroup),
  );
  async function update(item: any, ids: string[]) {
    setBusy(true);
    try {
      await onMembers(item, ids);
      setSelected("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="error" role="status">
        {t(sortError)}
      </p>
      {sortError && pendingOrder.current && (
        <div className="toolbar">
          <Button
            disabled={busy}
            onClick={() => void saveOrder(pendingOrder.current.itemIds)}
          >
            {t(localized["Retry sorting"])}
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              pendingOrder.current = null;
              setSortError("");
              void loadOrder();
            }}
          >
            {t(localized["Reload order"])}
          </Button>
        </div>
      )}
      {adding && (
        <Modal
          aria-label={t(localized["Add members"])}
          onClose={() => {
            if (!busy && !createPending.current) onCloseAdd();
          }}
        >
          <h3>{t(localized["Add members"])}</h3>
          <ItemGroupFilter
            groups={itemGroups}
            value={itemGroup}
            disabled={busy || !!createPending.current}
            onChange={(group) => {
              setItemGroup(group);
              setSelected("");
            }}
          />
          <div className="member-picker">
            <label>
              {t(localized["Add existing item"])}
              <Select
                aria-label={t(localized["Add existing item"])}
                placeholder={t(localized["Filter items by name or pinyin"])}
                value={selected}
                disabled={busy || !!createPending.current}
                onChange={setSelected}
                options={availableItems.map((i) => ({
                  value: i.id,
                  label: i.name,
                }))}
              />
            </label>
            <Button
              disabled={
                busy ||
                !!createPending.current ||
                !availableItems.some((i) => i.id === selected)
              }
              onClick={() => {
                const item = items.find((i) => i.id === selected);
                if (item) void update(item, [...item.categoryIds, category.id]);
              }}
            >
              {t(localized["Add members"])}
            </Button>
          </div>
          <div className="member-create">
            <Button
              disabled={busy || !!createPending.current}
              aria-expanded={!!draft}
              aria-controls="new-category-item"
              onClick={() =>
                setDraft(
                  draft
                    ? null
                    : {
                        name: "",
                        note: "",
                        itemGroup: null,
                        categoryIds: [category.id],
                      },
                )
              }
            >
              {t(localized["New item"])}
            </Button>
            {draft && (
              <div id="new-category-item" ref={createForm}>
                <ResourceForm
                  title={t(localized["New item"])}
                  name={draft.name}
                  onNameChange={(name) => setDraft({ ...draft, name })}
                  error={createError}
                  fieldsDisabled={busy || !!createPending.current}
                  submitDisabled={busy}
                  cancelDisabled={busy || !!createPending.current}
                  submitLabel={
                    createPending.current ? t(localized["Retry save"]) : t(localized["Create and add"])
                  }
                  onSubmit={() => void createMember()}
                  onClose={() => {
                    setDraft(null);
                    setCreateError("");
                  }}
                >
                  <ItemFields
                    value={draft}
                    onChange={setDraft}
                    categories={categories}
                    itemGroups={itemGroups}
                  />
                </ResourceForm>
              </div>
            )}
          </div>
        </Modal>
      )}
      {order && members.length === 0 && (
        <p className="empty">{t(localized["This category has no items yet."])}</p>
      )}
      <div className="category-members">
        <Collection>
          {members.map((item) => (
            <RecordCard
              key={item.id}
              name={item.name}
              sort={{
                id: item.id,
                disabled: busy || !order || !!pendingOrder.current,
                onMove: (target) => move(item.id, target),
                onStep: (direction) => {
                  const index = members.findIndex((i) => i.id === item.id);
                  const target = members[index + direction];
                  if (target) move(item.id, target.id);
                },
              }}
              actions={
                <div className="member-relations">
                  {item.categoryIds
                    .filter((id: string) => id === category.id)
                    .map((id: string) => {
                      const name = categories.find((c) => c.id === id)?.name;
                      return (
                        <Button
                          key={id}
                          variant="icon"
                          disabled={busy}
                          aria-label={t(localized["From "]) + name + t(localized[" Remove"])}
                          title={t(localized["From "]) + name + t(localized[" Remove"])}
                          onClick={() =>
                            void update(
                              item,
                              item.categoryIds.filter(
                                (other: string) => other !== id,
                              ),
                            )
                          }
                        >
                          <Icon name="trash" />
                        </Button>
                      );
                    })}
                </div>
              }
              onOpen={() => {
                if (!busy) onEdit(item);
              }}
            >
              <ItemSummary
                item={item}
                categories={categories}
                currentCategoryId={category.id}
              />
            </RecordCard>
          ))}
        </Collection>
      </div>
    </>
  );
}
