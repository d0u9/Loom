import { useSyncExternalStore } from "react";
import { english } from "./translations.js";
export type Language = "zh" | "en";
let language: Language = "zh";
try {
  if (localStorage.getItem("loom.language") === "en") language = "en";
} catch {}
if (typeof document !== "undefined")
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
export type LocalizedText =
  string | { parts: (string | { literal: string })[] };
export function message(
  ...parts: (LocalizedText | { literal: string })[]
): LocalizedText {
  return {
    parts: parts.flatMap((part) =>
      typeof part === "string" || "literal" in part ? [part] : part.parts,
    ),
  };
}
const listeners = new Set<() => void>();
export function setLanguage(next: Language) {
  language = next;
  try {
    localStorage.setItem("loom.language", next);
  } catch {}
  if (typeof document !== "undefined")
    document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  listeners.forEach((listener) => listener());
}
export function useLanguage() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => language,
  );
}
export function t(text: LocalizedText): string {
  if (typeof text !== "string")
    return text.parts
      .map((part) => (typeof part === "string" ? t(part) : part.literal))
      .join("");
  if (language === "zh") return text;
  const key = text.trim();
  const translated = english[key];
  return translated === undefined ? text : text.replace(key, translated);
}
