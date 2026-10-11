import { test, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, password, id } from "../server/db.js";
test("production server restart preserves data and request replay", async ({
  request,
}) => {
  const folder = mkdtempSync(join(tmpdir(), "loom-restart-")),
    path = join(folder, "loom.sqlite");
  let child: ReturnType<typeof spawn> | undefined;
  const db = new Store(path);
  db.run(
    "INSERT INTO account VALUES(?,?)",
    "admin",
    password("restart-password"),
  );
  db.close();
  async function start() {
    const before = Date.now();
    child = spawn(process.execPath, ["dist/server/server/main.js"], {
      env: { ...process.env, LOOM_DB: path, PORT: "3211" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      let text = "";
      const timeout = setTimeout(
        () => reject(new Error("Server startup timed out")),
        10000,
      );
      child!.on("error", reject);
      child!.on("exit", (code) => reject(new Error("Server exited " + code)));
      child!.stdout!.on("data", (data) => {
        text += data;
        if (text.includes("Loom listening")) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    console.log(
      "Production startup ms:",
      Date.now() - before,
      "RSS KiB:",
      execFileSync("ps", ["-o", "rss=", "-p", String(child!.pid)])
        .toString()
        .trim(),
    );
  }
  async function stop() {
    if (!child) return;
    const exited = new Promise<void>((resolve) =>
      child!.once("exit", () => resolve()),
    );
    child.kill("SIGTERM");
    await exited;
    child = undefined;
  }
  try {
    await start();
    let response = await request.post("http://127.0.0.1:3211/api/v1/login", {
      data: { username: "admin", password: "restart-password" },
    });
    const csrf = (await response.json()).csrf;
    const body = { name: "persisted", categoryIds: [], requestId: id() };
    response = await request.post("http://127.0.0.1:3211/api/v1/items", {
      headers: { "x-csrf-token": csrf },
      data: body,
    });
    expect(response.status()).toBe(200);
    const item = await response.json();
    await stop();
    await start();
    response = await request.post("http://127.0.0.1:3211/api/v1/items", {
      headers: { "x-csrf-token": csrf },
      data: body,
    });
    expect((await response.json()).id).toBe(item.id);
    expect(
      (await (await request.get("http://127.0.0.1:3211/api/v1/items")).json())
        .length,
    ).toBe(1);
  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
