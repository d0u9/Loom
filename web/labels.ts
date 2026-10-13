import localized from "../locales/zh.json" with { type: "json" };
import { english } from "./translations.js";
import { t, type LocalizedText } from "./i18n.js";
export const resourceLabels: Record<string, string> = {
  get Item() {
    return t(localized["Item"]);
  },
  get Category() {
    return t(localized["Category"]);
  },
  get Template() {
    return t(localized["Template"]);
  },
  get Checklist() {
    return t(localized["Checklist"]);
  },
};

export function errorKey(message: string, status: number): string {
  const messages: Record<string, string> = {
    "Invalid credentials": localized["Incorrect username or password."],
    "Item is referenced": localized["This item is referenced and cannot be deleted."],
    "Category is referenced": localized["This category is referenced and cannot be deleted."],
    "Invalid origin": localized["Untrusted request origin. Retry from the app."],
    "Invalid CSRF token": localized["Security verification expired. Refresh and retry."],
    "Category members changed; reload before creating":
      localized["Category members changed. Refresh before creating a checklist."],
    "Category members changed; reload before sorting":
      localized["Category members changed. Refresh before sorting."],
    "Version conflict": localized["Content changed. Refresh and retry."],
  };
  if (messages[message]) return messages[message];
  if (/[\u4e00-\u9fff]/.test(message)) return message;
  if (status === 401) return localized["Your session expired. Sign in again."];
  if (status === 403) return localized["Security verification failed. Refresh and retry."];
  if (status === 404) return localized["This resource does not exist or was deleted."];
  if (status === 409) return localized["Content changed or the action conflicts with its current state. Refresh and retry."];
  if (status === 429) return localized["Too many requests. Try again later."];
  if (status >= 500) return localized["The service could not complete this action. Retry the original request."];
  return localized["Check the submitted values and try again."];
}

export function errorLabel(message: string, status: number): string {
  return t(errorKey(message, status));
}
export function errorText(error: unknown): LocalizedText {
  if (error instanceof Error) {
    if ("localized" in error && error.localized)
      return error.localized as LocalizedText;
    if ("status" in error) return errorKey(error.message, Number(error.status));
    const key = Object.entries(english).find(
      ([key, value]) => key === error.message || value === error.message,
    )?.[0];
    return key ?? errorKey(error.message, 500);
  }
  return errorKey(String(error), 500);
}
