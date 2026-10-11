import localized from "../locales/zh.json" with { type: "json" };
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export let csrf = "";
export async function api(path: string, method = "GET", body?: any) {
  const response = await fetch("/api/v1" + path, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
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
      `${label}${localized[" returned empty or invalid JSON. Check that the server is running: pnpm dev (default port 3000)."]}`,
    );
  if (!response.ok)
    throw new ApiError(
      response.status,
      (data.message ?? `${label}${localized["fixture.b99864aaa910"]}`) +
        (data.details ? " " + JSON.stringify(data.details) : ""),
    );
  return data;
}
export function setCsrf(value: string) {
  csrf = value;
}

export const leave = { guard: () => true };
