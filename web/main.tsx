import localized from "../locales/zh.json" with { type: "json" };
import { Button } from "./button.js";
import { useRoute, resourcePath, matchesSearch } from "./router.js";
import { CategoryList } from "./category-list.js";
import { AppLayout, Page } from "./layout.js";
import { Collection, RecordCard } from "./collection.js";
import { ResourceDialog } from "./resource-dialog.js";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { api, setCsrf, leave, ApiError } from "./client.js";
import { Documents } from "./documents.js";
function App() {
  const route = useRoute();
  const { section, date } = route;
  const categoryId = section === "Category" ? route.id : null;
  const [schedule, setSchedule] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const refreshSchedule = async () => setSchedule(await api("/documents"));
  const [authEnabled, setAuthEnabled] = useState(true);
  const [username, setUsername] = useState("");
  const [logged, setLogged] = useState<boolean | null>(null),
    [items, setItems] = useState<any[]>([]),
    [categories, setCategories] = useState<any[]>([]),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [addingMembers, setAddingMembers] = useState(false),
    [editingKind, setEditingKind] = useState("Item"),
    [catalogPending, setCatalogPending] = useState<any>(null);
  const refresh = async () => {
    const [i, c] = await Promise.all([api("/items"), api("/categories")]);
    setItems(i);
    setCategories(c);
    await refreshSchedule();
  };
  async function loadSession() {
    setError("");
    try {
      const s = await api("/session");
      setCsrf(s.csrf);
      setAuthEnabled(s.authEnabled !== false);
      setUsername(s.username ?? "");
      route.resolveRoot(s.authEnabled === false ? "/checklists" : "/items");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        route.resolveRoot("/items");
        setLogged(false);
      } else setError(String(e));
      return;
    }
    try {
      await refresh();
    } catch (e) {
      setError(String(e));
    }
    setLogged(true);
  }
  useEffect(() => {
    void loadSession();
  }, []);
  useEffect(() => {
    setEditing(null);
    setAddingMembers(false);
    setQuery("");
    if (section === "Item" && route.id) {
      const item = items.find((i) => i.id === route.id);
      if (item) {
        setEditingKind("Item");
        setEditing({ ...item });
      }
    }
  }, [section, route.id, logged]);
  function closeEditing() {
    setEditing(null);
    if (section === "Item" && route.id) route.navigate("/items");
  }
  async function attempt(fn: () => Promise<any>) {
    try {
      setError("");
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) setCatalogPending(null);
      setError(String(e));
    }
  }
  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name;
  const currentCategory = categories.find((c) => c.id === categoryId);
  const records = (section === "Item" ? items : categories).filter((x) =>
    matchesSearch(
      query,
      x.name,
      x.note,
      section === "Item" ? x.categoryIds.map(categoryName).join(" · ") : null,
    ),
  );

  if (logged === null)
    return error ? (
      <main className="login">
        <p className="error" role="alert">
          {error}
        </p>
        <Button onClick={() => void loadSession()}>{localized["Retry"]}</Button>
      </main>
    ) : (
      <div aria-busy="true">
        <p className="session-status" role="status">{localized["\n          Checking session…\n        "]}</p>
      </div>
    );
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
              setUsername(s.username ?? "");
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
          <Button type="submit" variant="primary">{localized["\n            Sign in\n          "]}</Button>
        </form>
        <p role="alert">{error}</p>
      </main>
    );
  return (
    <AppLayout
      username={username}
      section={section}
      date={date}
      schedule={schedule}
      onSection={(next) => route.navigate(resourcePath(next))}
      onDate={(next) => route.navigate(resourcePath("Checklist", null, next))}
      onLogout={
        authEnabled
          ? () =>
              void attempt(async () => {
                await api("/logout", "POST", {});
                setLogged(false);
              })
          : undefined
      }
    >
      <p role="alert" className="error">
        {error}
      </p>
      {!route.valid ? (
        <p role="alert">{localized["Page not found."]}</p>
      ) : ["Item", "Category"].includes(section) ? (
        <Page
          search={!route.id ? { value: query, onChange: setQuery } : undefined}
          title={
            currentCategory && section === "Category"
              ? currentCategory.name
              : section
          }
          primaryAction={
            currentCategory && section === "Category"
              ? {
                  label: localized["Add members"],
                  onClick: () => setAddingMembers(true),
                }
              : {
                  label: localized["New "] + section,
                  onClick: () => {
                    setEditingKind(section);
                    setEditing({
                      name: "",
                      note: "",
                      categoryIds: [],
                    });
                  },
                }
          }
        >
          {route.id &&
          !(section === "Category"
            ? currentCategory
            : items.find((i) => i.id === route.id)) ? (
            <p role="alert">{localized["This resource does not exist or was deleted."]}</p>
          ) : section === "Category" && currentCategory ? (
            <CategoryList
              key={currentCategory.id}
              adding={addingMembers}
              onCloseAdd={() => setAddingMembers(false)}
              onSorted={refresh}
              category={currentCategory}
              categories={categories}
              items={items}
              onOpen={(id) => route.navigate(resourcePath("Category", id))}
              onEdit={(item) => {
                setEditingKind("Item");
                setEditing({ ...item });
              }}
              onMembers={async (item, categoryIds) =>
                attempt(async () => {
                  await api("/items/" + item.id, "PUT", {
                    name: item.name,
                    note: item.note,
                    categoryIds,
                    version: item.version,
                  });
                  await refresh();
                })
              }
            />
          ) : (
            <>
              <Collection>
                {records.map((x) => (
                  <RecordCard
                    key={x.id}
                    name={x.name}
                    onOpen={() => route.navigate(resourcePath(section, x.id))}
                    actions={
                      <>
                        <Button
                          variant="icon"
                          aria-label={localized["Edit"]}
                          title={localized["Edit"]}
                          onClick={() => {
                            if (section === "Item")
                              route.navigate(resourcePath(section, x.id));
                            else {
                              setEditingKind(section);
                              setEditing({ ...x });
                            }
                          }}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M14 5l5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16z" />
                          </svg>
                        </Button>
                        <Button
                          variant="icon"
                          className="danger"
                          aria-label={localized["Delete"]}
                          title={localized["Delete"]}
                          onClick={() => {
                            if (confirm(localized["Delete "] + x.name + localized["Question mark"]))
                              void attempt(async () => {
                                await api(
                                  "/" +
                                    (section === "Item"
                                      ? "items"
                                      : "categories") +
                                    "/" +
                                    x.id,
                                  "DELETE",
                                  { version: x.version },
                                );
                                await refresh();
                              });
                          }}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" />
                          </svg>
                        </Button>
                      </>
                    }
                  >
                    <h3>{x.name}</h3>
                    {section === "Item" ? (
                      <div className="item-details">
                        <p className="item-note" title={x.note}>
                          {x.note}
                        </p>
                        <div
                          className="category-tags"
                          aria-label={localized["Categories"]}
                          title={x.categoryIds
                            .map(categoryName)
                            .filter(Boolean)
                            .join(" · ")}
                        >
                          {x.categoryIds.slice(0, 2).map(
                            (id: string) =>
                              categoryName(id) && (
                                <span className="category-tag" key={id}>
                                  {categoryName(id)}
                                </span>
                              ),
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="category-tags" aria-label={localized["Parent category"]}>
                        <span className="empty">{localized["Category"]}</span>
                      </div>
                    )}
                  </RecordCard>
                ))}
              </Collection>
              {query.trim() && records.length === 0 && (
                <p className="empty">{localized["No matching results."]}</p>
              )}
            </>
          )}
          {editing && (
            <ResourceDialog
              title={(editing.id ? localized["Edit "] : localized["New "]) + editingKind}
              name={editing.name}
              onNameChange={(name) => setEditing({ ...editing, name })}
              error={error}
              fieldsDisabled={!!catalogPending}
              cancelDisabled={!!catalogPending}
              submitLabel={catalogPending ? localized["Retry save"] : localized["Save"]}
              onClose={() => {
                if (!catalogPending) closeEditing();
              }}
              onSubmit={() => {
                void attempt(async () => {
                  const path =
                    "/" + (editingKind === "Item" ? "items" : "categories");
                  const body =
                    editingKind === "Item"
                      ? {
                          name: editing.name,
                          note: editing.note,
                          categoryIds: editing.categoryIds,
                        }
                      : { name: editing.name };
                  const payload = catalogPending || {
                    ...body,
                    ...(editing.id
                      ? { version: editing.version }
                      : editingKind === "Item"
                        ? { requestId: crypto.randomUUID() }
                        : {}),
                  };
                  if (!editing.id && editingKind === "Item")
                    setCatalogPending(payload);
                  await api(
                    path + (editing.id ? "/" + editing.id : ""),
                    editing.id ? "PUT" : "POST",
                    payload,
                  );
                  setCatalogPending(null);
                  closeEditing();
                  await refresh();
                });
              }}
            >
              {editingKind === "Item" ? (
                <>
                  <label>{localized["\n                    Note\n                    "]}<textarea
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
              ) : null}
            </ResourceDialog>
          )}
        </Page>
      ) : (
        <Documents
          kind={section === "Template" ? "template" : "checklist"}
          documentId={route.id}
          query={query}
          onSearch={setQuery}
          onNavigate={(id) =>
            route.navigate(resourcePath(section, id, date), false)
          }
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
