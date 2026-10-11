import localized from "../locales/zh.json" with { type: "json" };
import { AppLayout, Page } from "./layout.js";
import { Modal } from "./modal.js";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { api, setCsrf, leave, ApiError } from "./client.js";
import { Documents } from "./documents.js";
function App() {
  const [date, setDate] = useState<string | null>(null),
    [schedule, setSchedule] = useState<any[]>([]);
  const refreshSchedule = async () => setSchedule(await api("/documents"));
  const [logged, setLogged] = useState(false),
    [section, setSection] = useState("Item"),
    [items, setItems] = useState<any[]>([]),
    [categories, setCategories] = useState<any[]>([]),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [catalogPending, setCatalogPending] = useState<any>(null);
  const refresh = async () => {
    const [i, c] = await Promise.all([api("/items"), api("/categories")]);
    setItems(i);
    setCategories(c);
    await refreshSchedule();
  };
  useEffect(() => {
    api("/session")
      .then((s) => {
        setCsrf(s.csrf);
        setLogged(true);
        return refresh();
      })
      .catch(() => {});
  }, []);
  async function attempt(fn: () => Promise<any>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) setCatalogPending(null);
      setError(String(e));
    }
  }
  if (!logged)
    return (
      <main className="login">
        <h1>Loom</h1>
        <p>{localized["A place for everything on your checklist."]}</p>
        <form
          method="post"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void attempt(async () => {
              const s = await api("/login", "POST", Object.fromEntries(f));
              setCsrf(s.csrf);
              setLogged(true);
              await refresh();
            });
          }}
        >
          <label>{localized["\n            Username\n            "]}<input
              name="username"
              defaultValue="admin"
              autoComplete="username"
              required
            />
          </label>
          <label>{localized["\n            Password\n            "]}<input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary">{localized["Sign in"]}</button>
        </form>
        <p role="alert">{error}</p>
      </main>
    );
  return (
    <AppLayout
      section={section}
      date={date}
      schedule={schedule}
      onSection={(next) => {
        if (!leave.guard()) return;
        if (next === "Checklist") setDate(null);
        setSection(next);
        setEditing(null);
      }}
      onDate={(next) => {
        if (!leave.guard()) return;
        setDate(next);
        setSection("Checklist");
        setEditing(null);
      }}
      onLogout={() =>
        void attempt(async () => {
          await api("/logout", "POST", {});
          setLogged(false);
        })
      }
    >
      <p role="alert" className="error">
        {error}
      </p>
      {["Item", "Category"].includes(section) ? (
        <Page
          title={section}
          onCreate={() =>
            setEditing({ name: "", note: "", categoryIds: [], parentId: null })
          }
        >
          <div className="cards">
            {(section === "Item" ? items : categories).map((x) => (
              <article key={x.id}>
                <h3>{x.name}</h3>
                <p>
                  {section === "Item"
                    ? x.note
                    : categories.find((c) => c.id === x.parentId)?.name ||
                      localized["fixture.b9e8a7335ec8"]}
                </p>
                <p>
                  {x.categoryIds
                    ?.map(
                      (k: string) => categories.find((c) => c.id === k)?.name,
                    )
                    .join(" · ")}
                </p>
                <button onClick={() => setEditing({ ...x })}>{localized["Edit"]}</button>
                <button
                  onClick={() => {
                    if (confirm(localized["Delete "] + x.name + localized["Question mark"]))
                      void attempt(async () => {
                        await api(
                          "/" +
                            (section === "Item" ? "items" : "categories") +
                            "/" +
                            x.id,
                          "DELETE",
                          { version: x.version },
                        );
                        await refresh();
                      });
                  }}
                >{localized["\n                  Delete\n                "]}</button>
              </article>
            ))}
          </div>
          {editing && (
            <Modal
              onClose={() => {
                if (!catalogPending) setEditing(null);
              }}
              aria-label={localized["Edit "] + section}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void attempt(async () => {
                    const path =
                      "/" + (section === "Item" ? "items" : "categories");
                    const body =
                      section === "Item"
                        ? {
                            name: editing.name,
                            note: editing.note,
                            categoryIds: editing.categoryIds,
                          }
                        : { name: editing.name, parentId: editing.parentId };
                    const payload = catalogPending || {
                      ...body,
                      ...(editing.id
                        ? { version: editing.version }
                        : section === "Item"
                          ? { requestId: crypto.randomUUID() }
                          : {}),
                    };
                    if (!editing.id && section === "Item")
                      setCatalogPending(payload);
                    await api(
                      path + (editing.id ? "/" + editing.id : ""),
                      editing.id ? "PUT" : "POST",
                      payload,
                    );
                    setCatalogPending(null);
                    setEditing(null);
                    await refresh();
                  });
                }}
              >
                <h3>
                  {editing.id ? localized["Edit"] : localized["New"]} {section}
                </h3>
                <p className="error" role="alert">
                  {error}
                </p>
                <fieldset className="form-fields" disabled={!!catalogPending}>
                  <label>{localized["\n                    Name\n                    "]}<input
                      data-1p-ignore="true"
                      autoComplete="off"
                      required
                      maxLength={200}
                      value={editing.name}
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                    />
                  </label>
                  {section === "Item" ? (
                    <>
                      <label>{localized["\n                        Note\n                        "]}<textarea
                          data-1p-ignore="true"
                          autoComplete="off"
                          value={editing.note}
                          onChange={(e) =>
                            setEditing({ ...editing, note: e.target.value })
                          }
                        />
                      </label>
                      <fieldset>
                        <legend>{localized["Categories"]}</legend>
                        {categories.length === 0 && (
                          <p className="empty">{localized["No categories yet. You can add them later."]}</p>
                        )}
                        {categories.map((c) => (
                          <label key={c.id}>
                            <input
                              data-1p-ignore="true"
                              autoComplete="off"
                              type="checkbox"
                              checked={editing.categoryIds.includes(c.id)}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  categoryIds: e.target.checked
                                    ? [...editing.categoryIds, c.id]
                                    : editing.categoryIds.filter(
                                        (k: string) => k !== c.id,
                                      ),
                                })
                              }
                            />
                            {c.name}
                          </label>
                        ))}
                      </fieldset>
                    </>
                  ) : (
                    <label>{localized["fixture.7f7c5dec3f9d"]}<select
                        value={editing.parentId || ""}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            parentId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">{localized["fixture.4522f8325fde"]}</option>
                        {categories
                          .filter((c) => c.id !== editing.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                </fieldset>
                <div className="form-actions">
                  <button className="primary">
                    {catalogPending ? localized["Retry save"] : localized["Save"]}
                  </button>
                  <button type="button" onClick={() => setEditing(null)}>{localized["\n                    Cancel\n                  "]}</button>
                </div>
              </form>
            </Modal>
          )}
        </Page>
      ) : (
        <Documents
          kind={section === "Template" ? "template" : "checklist"}
          items={items}
          categories={categories}
          refreshCatalog={refresh}
          date={date}
          onScheduleChange={refreshSchedule}
        />
      )}
    </AppLayout>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
