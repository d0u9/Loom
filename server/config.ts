import { existsSync, readFileSync } from "node:fs";

export type Config = { auth: { enabled: boolean } };
export const defaultConfig: Config = { auth: { enabled: true } };

export function readConfig(
  path = process.env.LOOM_CONFIG ?? "loom.config.json",
): Config {
  if (
    !existsSync(path) &&
    path === "loom.config.json" &&
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
      Object.keys(value.auth).some((key) => key !== "enabled") ||
      typeof value.auth.enabled !== "boolean"
    )
      throw new Error('Expected {"auth":{"enabled":true|false}}');
    return value;
  } catch (error) {
    throw new Error(`Invalid Loom config ${path}: ${String(error)}`);
  }
}
