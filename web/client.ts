import localized from "../locales/zh.json" with { type: "json" };
import { t, message, type LocalizedText } from "./i18n.js";
import { errorKey } from "./labels.js";
export class ApiError extends Error {
  constructor(
    public status: number,
    public localized: LocalizedText,
    public details?: any,
  ) {
    super(t(localized));
  }
}
export let csrf = "";
export async function api(
  path: string,
  method = "GET",
  body?: any,
): Promise<any> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("/api/v1" + path, {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: payload,
    });
    const text = await response.text();
    const label = `${method} /api/v1${path}${localized["Diagnostic HTTP prefix"]}${response.status}${localized["Diagnostic HTTP suffix"]}`;
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {}
    if (!data || typeof data !== "object")
      throw new ApiError(
        response.ok ? 502 : response.status,
        message(
          { literal: label },
          localized[
            " returned empty or invalid JSON. Check that the server is running: pnpm dev (default port 3000)."
          ],
        ),
      );
    if (
      attempt === 0 &&
      response.status === 403 &&
      data.message === "Invalid CSRF token" &&
      !["GET", "HEAD", "OPTIONS"].includes(method)
    ) {
      const session = await api("/session");
      if (typeof session.csrf === "string" && session.csrf) {
        setCsrf(session.csrf);
        continue;
      }
    }
    if (!response.ok)
      throw new ApiError(
        response.status,
        message(
          errorKey(data.message ?? "", response.status),
          ...(Array.isArray(data.details)
            ? [
                localized[" References:"],
                ...data.details.flatMap((ref: any, index: number) => [
                  ...(index
                    ? [{ literal: localized["Reference separator"] }]
                    : []),
                  ref.kind === "Category"
                    ? localized["Category"]
                    : ref.kind === "template"
                      ? localized["Template"]
                      : localized["Checklist"],
                  {
                    literal: `${localized["Reference opening quote"]}${ref.name}${localized["Reference closing quote"]}`,
                  },
                ]),
              ]
            : []),
        ),
        data.details,
      );
    return data;
  }
}
export function setCsrf(value: string) {
  csrf = value;
}

// Navigation guard; a Promise means the user is being asked.
export const leave = { guard: (): boolean | Promise<boolean> => true };
