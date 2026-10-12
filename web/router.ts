import { match } from "pinyin-pro";
import { useEffect, useRef, useState } from "react";
import { leave } from "./client.js";

const sections: Record<string, string> = {
  items: "Item",
  categories: "Category",
  templates: "Template",
  checklists: "Checklist",
};
export function resourcePath(
  section: string,
  id?: string | null,
  date?: string | null,
) {
  return (
    "/" +
    Object.keys(sections).find((key) => sections[key] === section)! +
    (id ? "/" + encodeURIComponent(id) : "") +
    (section === "Checklist" && date ? "?date=" + encodeURIComponent(date) : "")
  );
}
export function useRoute() {
  const [url, setUrl] = useState(() => location.pathname + location.search);
  const index = useRef(0);
  const restoring = useRef(false);
  useEffect(() => {
    history.replaceState({ loomIndex: 0 }, "", url);
    setUrl(location.pathname + location.search);
    const pop = () => {
      const next = history.state?.loomIndex ?? 0;
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      if (!leave.guard()) {
        restoring.current = true;
        history.go(index.current - next);
        return;
      }
      index.current = next;
      setUrl(location.pathname + location.search);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function navigate(path: string, check = true) {
    if (path === location.pathname + location.search) return;
    if (check && !leave.guard()) return;
    history.pushState({ loomIndex: ++index.current }, "", path);
    setUrl(path);
  }
  const parsed = new URL(url, location.origin);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const section = sections[parts[0]] || "Item";
  return {
    section,
    id: parts[1] || null,
    date: section === "Checklist" ? parsed.searchParams.get("date") : null,
    valid:
      parsed.pathname === "/" || (!!sections[parts[0]] && parts.length <= 2),
    resolveRoot(path: string) {
      if (location.pathname !== "/") return;
      history.replaceState({ loomIndex: index.current }, "", path);
      setUrl(path);
    },
    navigate,
  };
}
// Plain substring, or pinyin initials/full spelling such as "jid" for eggs.
export function matchesText(text: string, query: string) {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    text.toLowerCase().includes(q) ||
    (/^[a-z]+$/.test(q) && !!match(text, q))
  );
}
export function matchesSearch(
  query: string,
  ...fields: (string | null | undefined)[]
) {
  return fields.some((field) => matchesText(field ?? "", query));
}
