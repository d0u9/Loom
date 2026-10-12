import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("global config opens checklists without login and auth can be re-enabled on restart", async ({
  page,
  request,
}) => {
  const folder = mkdtempSync(join(tmpdir(), "loom-anonymous-")),
    config = join(folder, "config.json"),
    db = join(folder, "loom.sqlite"),
    base = "http://127.0.0.1:3212";
  let child: ReturnType<typeof spawn> | undefined;
  const start = async (enabled: boolean) => {
    writeFileSync(config, JSON.stringify({ auth: { enabled } }));
    child = spawn(process.execPath, ["dist/server/server/main.js"], {
      env: {
        ...process.env,
        LOOM_CONFIG: config,
        LOOM_DB: db,
        HOST: "127.0.0.1",
        PORT: "3212",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(
        () => reject(new Error("Startup timed out")),
        10000,
      );
      const fail = (e: Error) => {
        clearTimeout(timeout);
        reject(e);
      };
      child!.once("error", fail);
      child!.once("exit", (code) => fail(new Error("Server exited " + code)));
      child!.stdout!.on("data", (data) => {
        output += data;
        if (output.includes("Loom listening")) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) =>
      child!.once("exit", () => resolve()),
    );
    child.kill("SIGTERM");
    await exited;
    child = undefined;
  };
  try {
    await start(false);
    await page.goto(base + "/");
    await expect(page).toHaveURL(base + "/checklists");
    await expect(
      page
        .locator(".page-header")
        .getByRole("heading", { name: "Checklist", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(localized["Password"], { exact: true })).toHaveCount(0);
    await expect(page.locator(".sidebar-account .account-name")).toHaveText(
      localized["No sign-in required"],
    );
    await expect(page.getByLabel(localized["Account menu"], { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: localized["Sign out"], exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: localized["fixture.b075aa0598f1"], exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(localized["Name"], { exact: true })
      .fill("Anonymous list");
    await page.getByRole("button", { name: localized["Create"], exact: true }).click();
    await expect(
      page
        .locator(".page-header")
        .getByRole("heading", { name: "Anonymous list", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page
        .locator(".page-header")
        .getByRole("heading", { name: "Anonymous list", exact: true }),
    ).toBeVisible();
    await stop();
    await start(false);
    await page
      .getByLabel(localized["New temporary entry"], { exact: true })
      .fill("Saved after backend restart");
    await page.getByLabel(localized["New temporary entry"], { exact: true }).press("Enter");
    await expect(page.getByRole("status")).toContainText(localized["Saved"]);
    const documents = await (
      await request.get(base + "/api/v1/documents")
    ).json();
    const saved = await (
      await request.get(base + "/api/v1/documents/" + documents[0].id)
    ).json();
    expect(saved.entries[0].name).toBe("Saved after backend restart");
    await expect(page.getByLabel(localized["Password"], { exact: true })).toHaveCount(0);
    await page.goto(base + "/items");
    await expect(page).toHaveURL(base + "/items");
    await expect(
      page.getByRole("button", { name: localized["fixture.aa7084084271"], exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(localized["Password"], { exact: true })).toHaveCount(0);
    await stop();
    await start(true);
    await page.goto(base + "/checklists");
    await expect(page.getByLabel(localized["Password"], { exact: true })).toBeVisible();
    expect((await request.get(base + "/api/v1/documents")).status()).toBe(401);
  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
