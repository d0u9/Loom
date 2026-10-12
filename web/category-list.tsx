import localized from "../locales/zh.json" with { type: "json" };
import { Button } from "./button.js";
import { Collection, RecordCard } from "./collection.js";
import { Modal } from "./modal.js";
import { api } from "./client.js";
import React, { useState, useEffect, useRef } from "react";

export function CategoryList({
  adding,
  onCloseAdd,
  category,
  categories,
  items,
  onOpen,
  onEdit,
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
  onMembers: (item: any, categoryIds: string[]) => Promise<void>;
  onSorted: () => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<{
    itemIds: string[];
    version: number;
  } | null>(null);
  const [sortError, setSortError] = useState("");
  const pendingOrder = useRef<any>(null);
  const loadOrder = async () =>
    setOrder(await api(`/categories/${category.id}/order`));
  useEffect(() => {
    void loadOrder().catch((e) => setSortError(String(e)));
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
      setSortError(String(e));
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
        {sortError}
      </p>
      {sortError && pendingOrder.current && (
        <div className="toolbar">
          <Button
            disabled={busy}
            onClick={() => void saveOrder(pendingOrder.current.itemIds)}
          >{localized["\n            Retry sorting\n          "]}</Button>
          <Button
            disabled={busy}
            onClick={() => {
              pendingOrder.current = null;
              setSortError("");
              void loadOrder();
            }}
          >{localized["\n            Reload order\n          "]}</Button>
        </div>
      )}
      {adding && (
        <Modal aria-label={localized["Add members"]} onClose={onCloseAdd}>
          <h3>{localized["Add members"]}</h3>
          <div className="member-picker">
            <label>{localized["fixture.80bb5fdf0aea"]}<select
                aria-label={localized["fixture.96e7231a24a2"]}
                value={selected}
                disabled={busy}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">{localized["fixture.420ecfe42f1c"]}</option>
                {items
                  .filter((i) => !i.categoryIds.includes(category.id))
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              disabled={
                busy ||
                !items.some(
                  (i) =>
                    i.id === selected && !i.categoryIds.includes(category.id),
                )
              }
              onClick={() => {
                const item = items.find((i) => i.id === selected);
                if (item) void update(item, [...item.categoryIds, category.id]);
              }}
            >{localized["\n              Add members\n            "]}</Button>
          </div>
        </Modal>
      )}
      {order && members.length === 0 && (
        <p className="empty">{localized["fixture.377668869c82"]}</p>
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
                          variant="ghost"
                          className="membership-tag"
                          disabled={busy}
                          aria-label={localized["From "] + name + localized[" Remove"]}
                          title={localized["From "] + name + localized[" Remove"]}
                          onClick={() =>
                            void update(
                              item,
                              item.categoryIds.filter(
                                (other: string) => other !== id,
                              ),
                            )
                          }
                        >
                          <span>{name}</span>
                          <span aria-hidden="true">×</span>
                        </Button>
                      );
                    })}
                </div>
              }
              onOpen={() => {
                if (!busy) onEdit(item);
              }}
            >
              <h3>{item.name}</h3>
            </RecordCard>
          ))}
        </Collection>
      </div>
    </>
  );
}
