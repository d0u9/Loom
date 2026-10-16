import localized from "../locales/zh.json" with { type: "json" };
import React, { useRef, useState } from "react";
import { t } from "./i18n.js";
import { api, ApiError } from "./client.js";
import { errorText } from "./labels.js";
import { Select } from "./select.js";
import { Button } from "./button.js";
import { Icon } from "./layout.js";

export function EntryInput({
  label,
  placeholder,
  depth,
  items,
  onAdd,
  onPending,
  refreshCatalog,
}: {
  label: string;
  placeholder: string;
  depth: number;
  items: any[];
  onAdd: (item: any, name: string) => void;
  onPending: (pending: boolean) => void;
  refreshCatalog: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [store, setStore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<any>(null);
  const created = useRef<any>(null);
  const working = useRef(false);
  const host = useRef<HTMLDivElement>(null);
  async function submit(item?: any) {
    if (working.current || (!item && !name.trim())) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      if (!item && store) {
        request.current ??= {
          name: name.trim(),
          note: "",
          categoryIds: [],
          requestId: crypto.randomUUID(),
        };
        onPending(true);
        item =
          created.current ?? (await api("/items", "POST", request.current));
        created.current = item;
        await refreshCatalog();
      }
      onAdd(item ?? null, item?.name ?? name.trim());
      request.current = null;
      created.current = null;
      onPending(false);
      setName("");
    } catch (e) {
      if (!created.current && e instanceof ApiError && e.status < 500) {
        request.current = null;
        onPending(false);
      }
      setError(t(errorText(e)));
    } finally {
      working.current = false;
      setBusy(false);
      requestAnimationFrame(() =>
        host.current?.querySelector<HTMLInputElement>("input")?.focus(),
      );
    }
  }
  return (
    <div className="quick-entry" data-depth={depth} ref={host}>
      <Icon name="add" />
      <Select
        aria-label={label}
        placeholder={placeholder}
        allowCustom
        value={name}
        disabled={busy || !!request.current}
        options={items.map((item) => ({ value: item.id, label: item.name }))}
        onChange={setName}
        onChoose={(value) =>
          void submit(items.find((item) => item.id === value))
        }
        onSubmit={() => void submit()}
        onEscape={() => setName("")}
      />
      <label className="quick-save">
        <input
          type="checkbox"
          checked={store}
          disabled={busy || !!request.current}
          onChange={(event) => setStore(event.target.checked)}
        />
        {t(localized["Save to item catalog"])}
      </label>
      {store &&
        name.trim() &&
        items.some((item) => item.name.trim() === name.trim()) && (
          <span className="quick-notice">
            {t(localized["Same name exists; select it or create separately."])}
          </span>
        )}
      {error && (
        <div className="quick-error" role="alert">
          {error}{" "}
          <Button disabled={busy} onClick={() => void submit()}>
            {t(localized["Retry save"])}
          </Button>
        </div>
      )}
    </div>
  );
}
