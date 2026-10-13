import { existsSync, readFileSync } from "node:fs";

// loginRateLimit: login attempts per minute; production keeps the default 10.
export type Config = { auth: { enabled: boolean; loginRateLimit?: number } };
export const defaultConfig: Config = { auth: { enabled: true } };

export function readConfig(
  path = process.env.LOOM_CONFIG ?? "data/loom.config.json",
): Config {
  if (
    !existsSync(path) &&
    path === "data/loom.config.json" &&
    !process.env.LOOM_CONFIG
  )
    return { auth: { enabled: true } };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (
      !value ||
      Array.isArray(value) ||
      typeof value !== "object" ||
      Object.keys(value).some((key) => key !== "auth") ||
      !value.auth ||
      Array.isArray(value.auth) ||
      typeof value.auth !== "object" ||
      Object.keys(value.auth).some(
        (key) => key !== "enabled" && key !== "loginRateLimit",
      ) ||
      typeof value.auth.enabled !== "boolean" ||
      (value.auth.loginRateLimit !== undefined &&
        !(
          Number.isInteger(value.auth.loginRateLimit) &&
          value.auth.loginRateLimit > 0
        ))
    )
      throw new Error(
        'Expected {"auth":{"enabled":true|false,"loginRateLimit"?:positive integer}}',
      );
    return value;
  } catch (error) {
    throw new Error(`Invalid Loom config ${path}: ${String(error)}`);
  }
}
