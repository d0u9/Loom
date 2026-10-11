import localized from "../locales/zh.json" with { type: "json" };
import { Modal } from "./modal.js";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { api, setCsrf, leave, ApiError } from "./client.js";
import { Documents } from "./documents.js";
function App() {
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
          <button>{localized["Sign in"]}</button>
        </form>
        <p role="alert">{error}</p>
      </main>
    );
  return (
    <div className="layout">
      <nav>
        <h1>Loom</h1>
        {["Checklist", "Template", "Item", "Category"].map((x) => (
          <button
            key={x}
            className={section === x ? "selected" : ""}
            onClick={() => {
              if (!leave.guard()) return;
              setSection(x);
              setEditing(null);
            }}
          >
            {x}
          </button>
        ))}
        <button
          onClick={() =>
            void attempt(async () => {
              await api("/logout", "POST", {});
              setLogged(false);
            })
          }
        >{localized["\n          Sign out\n        "]}</button>
      </nav>
      <main>
        <header>
          <h2>{section}</h2>
          {["Item", "Category"].includes(section) && (
            <button
              onClick={() =>
                setEditing({
                  name: "",
                  note: "",
                  categoryIds: [],
                  parentId: null,
                })
              }
            >{localized["\n              New "]}{section}
            </button>
          )}
        </header>
        <p role="alert" className="error">
          {error}
        </p>
        {["Item", "Category"].includes(section) ? (
          <>
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
                  >{localized["\n                    Delete\n                  "]}</button>
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
                  <fieldset disabled={!!catalogPending}>
                    <label>{localized["\n                      Name\n                      "]}<input
                        autoFocus
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
                        <label>{localized["\n                          Note\n                          "]}<textarea
                            value={editing.note}
                            onChange={(e) =>
                              setEditing({ ...editing, note: e.target.value })
                            }
                          />
                        </label>
                        <fieldset>
                          <legend>{localized["Categories"]}</legend>
                          {categories.map((c) => (
                            <label key={c.id}>
                              <input
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
                      <label>{localized["fixture.d2cd7a9e8534"]}<select
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
                  <button>{catalogPending ? localized["Retry save"] : localized["Save"]}</button>
                  <button type="button" onClick={() => setEditing(null)}>{localized["\n                    Cancel\n                  "]}</button>
                </form>
              </Modal>
            )}
          </>
        ) : (
          <Documents
            kind={section === "Template" ? "template" : "checklist"}
            items={items}
            categories={categories}
            refreshCatalog={refresh}
          />
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
