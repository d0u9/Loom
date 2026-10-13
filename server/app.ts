import {
  responseSchema,
  errorSchema,
  object as obj,
  uuid,
  short as str,
  version,
} from "./schema.js";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import staticFiles from "@fastify/static";
import swagger from "@fastify/swagger";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Store, Problem, requireThat, id, hash, verify } from "./db.js";
import { registerHistory } from "./history.js";
import { registerDocuments } from "./documents.js";
import { randomBytes } from "node:crypto";
import { defaultConfig, type Config } from "./config.js";
export async function app(store: Store, config: Config = defaultConfig) {
  const anonymousCsrf = randomBytes(32).toString("hex");
  const api = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY || false,
  });
  await api.register(cookie);
  await api.register(rateLimit, { global: false });
  await api.register(swagger, {
    openapi: {
      info: { title: "Loom API", version: "1.0.0" },
      components: {
        securitySchemes: {
          session: { type: "apiKey", in: "cookie", name: "session" },
          bearer: { type: "http", scheme: "bearer" },
        },
      },
      security: config.auth.enabled ? [{ session: [] }, { bearer: [] }] : [],
    },
  });
  api.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/v1")) return;
    const method = Array.isArray(route.method) ? route.method[0] : route.method;
    route.schema = {
      ...route.schema,
      ...(route.url === "/api/v1/items" && method === "GET"
        ? {
            querystring: obj(
              { itemGroup: { type: "string", maxLength: 200 } },
              [],
            ),
          }
        : {}),
      response: {
        200: responseSchema(route.url, method),
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        404: errorSchema,
        409: errorSchema,
        429: errorSchema,
        500: errorSchema,
      },
      ...(route.url === "/api/v1/login" ? { security: [] } : {}),
    };
  });
  api.setErrorHandler((error: any, _req, reply) => {
    reply.code(error.statusCode || 500).send({
      message: error.statusCode ? error.message : "Internal server error",
      details: error.details || null,
    });
  });
  api.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    if (req.url.split("?")[0] === "/api/v1/login") {
      if (
        req.headers.origin &&
        req.headers.origin !== `${req.protocol}://${req.headers.host}`
      )
        throw new Problem(403, "Invalid origin");
      return;
    }
    const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (bearer) {
      requireThat(
        store.get("SELECT id FROM tokens WHERE hash=?", hash(bearer)),
        "Unauthorized",
        401,
      );
      return;
    }
    if (!config.auth.enabled) {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        requireThat(
          !req.headers.origin ||
            req.headers.origin === `${req.protocol}://${req.headers.host}`,
          "Invalid origin",
          403,
        );
        requireThat(
          req.headers["x-csrf-token"] === anonymousCsrf,
          "Invalid CSRF token",
          403,
        );
      }
      return;
    }
    const session =
      req.cookies.session &&
      store.get(
        "SELECT * FROM sessions WHERE hash=? AND expires>?",
        hash(req.cookies.session),
        Date.now(),
      );
    requireThat(session, "Unauthorized", 401);
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
      requireThat(
        req.headers["x-csrf-token"] === session.csrf,
        "Invalid CSRF token",
        403,
      );
  });
  const route = (method: any, url: string, body: any, fn: any) =>
    api.route({
      method,
      url: "/api/v1" + url,
      schema: body ? { body } : undefined,
      config:
        url === "/login"
          ? {
              rateLimit: {
                max: config.auth.loginRateLimit ?? 10,
                timeWindow: 60000,
              },
            }
          : undefined,
      handler: fn,
    });
  route(
    "POST",
    "/login",
    obj(
      {
        username: str,
        password: { type: "string", minLength: 1, maxLength: 1000 },
      },
      ["username", "password"],
    ),
    async (req: any, reply: any) => {
      requireThat(config.auth.enabled, "Login is disabled", 409);
      const account = store.get(
        "SELECT * FROM account WHERE username=?",
        req.body.username,
      );
      requireThat(
        account && verify(req.body.password, account.password),
        "Invalid credentials",
        401,
      );
      const token = randomBytes(32).toString("hex"),
        csrf = randomBytes(32).toString("hex");
      store.run("DELETE FROM sessions WHERE expires<?", Date.now());
      store.run(
        "INSERT INTO sessions VALUES(?,?,?)",
        hash(token),
        csrf,
        Date.now() + 7 * 86400000,
      );
      reply.setCookie("session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: req.protocol === "https",
        path: "/",
      });
      return { csrf, username: account.username };
    },
  );
  route("GET", "/session", null, (req: any, reply: any) => {
    reply.header("cache-control", "no-store");
    if (!config.auth.enabled)
      return { csrf: anonymousCsrf, authEnabled: false };
    const s = store.get(
      "SELECT csrf FROM sessions WHERE hash=?",
      hash(req.cookies.session || ""),
    );
    return {
      csrf: s?.csrf || null,
      authEnabled: true,
      username: store.get("SELECT username FROM account")?.username,
    };
  });
  route("POST", "/logout", obj({}, []), (req: any, reply: any) => {
    store.run(
      "DELETE FROM sessions WHERE hash=?",
      hash(req.cookies.session || ""),
    );
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });
  route("GET", "/openapi.json", null, () => api.swagger());
  route("GET", "/tokens", null, () => store.all("SELECT id,name FROM tokens"));
  route("POST", "/tokens", obj({ name: str }, ["name"]), (req: any) => {
    const token = randomBytes(32).toString("hex"),
      key = id();
    store.run(
      "INSERT INTO tokens VALUES(?,?,?)",
      key,
      req.body.name,
      hash(token),
    );
    return { id: key, token };
  });
  route("DELETE", "/tokens/:id", null, (req: any) => {
    store.run("DELETE FROM tokens WHERE id=?", req.params.id);
    return { ok: true };
  });
  route("GET", "/items", null, (req: any) =>
    (req.query.itemGroup === undefined
      ? store.all("SELECT * FROM items ORDER BY name")
      : store.all(
          "SELECT * FROM items WHERE COALESCE(itemGroup, '')=? ORDER BY name",
          req.query.itemGroup.trim(),
        )
    ).map((i) => ({
      ...i,
      categoryIds: store
        .all("SELECT categoryId FROM item_categories WHERE itemId=?", i.id)
        .map((c) => c.categoryId),
    })),
  );
  const itemBody = obj(
    {
      name: str,
      note: { type: "string", maxLength: 10000 },
      itemGroup: {
        anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }],
      },
      categoryIds: { type: "array", items: uuid, uniqueItems: true },
      version,
      requestId: uuid,
    },
    ["name", "categoryIds"],
  );
  const saveItem = (req: any) => {
    const b = req.body,
      key = req.params.id || id();
    const prior = req.params.id ? store.resource("items", key) : null;
    if (prior) store.version(prior, b.version);
    const itemGroup =
      b.itemGroup === undefined
        ? (prior?.itemGroup ?? null)
        : b.itemGroup?.trim() || null;
    b.categoryIds.forEach((c: string) => store.resource("categories", c));
    store.run(
      "INSERT INTO items(id,name,note,itemGroup) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,note=excluded.note,itemGroup=excluded.itemGroup,version=version+1",
      key,
      b.name,
      b.note || "",
      itemGroup,
    );
    // Keep existing memberships so their Category order survives.
    store.run(
      "DELETE FROM item_categories WHERE itemId=? AND categoryId NOT IN (SELECT value FROM json_each(?))",
      key,
      JSON.stringify(b.categoryIds),
    );
    b.categoryIds.forEach((c: string) =>
      store.run(
        "INSERT OR IGNORE INTO item_categories(itemId,categoryId,position) VALUES(?,?,(SELECT COALESCE(MAX(position)+1,0) FROM item_categories WHERE categoryId=?))",
        key,
        c,
        c,
      ),
    );
    return store.resource("items", key);
  };
  route(
    "POST",
    "/items",
    { ...itemBody, required: [...itemBody.required, "requestId"] },
    (req: any) => store.once("create-item", req.body, () => saveItem(req)),
  );
  route(
    "PUT",
    "/items/:id",
    { ...itemBody, required: [...itemBody.required, "version"] },
    (req: any) => store.tx(() => saveItem(req)),
  );
  route("DELETE", "/items/:id", obj({ version }, ["version"]), (req: any) =>
    store.tx(() => {
      store.version(store.resource("items", req.params.id), req.body.version);
      const refs = store.itemRefs(req.params.id);
      if (refs.length) throw new Problem(409, "Item is referenced", refs);
      store.run("DELETE FROM items WHERE id=?", req.params.id);
      return { ok: true };
    }),
  );
  route("GET", "/categories", null, () =>
    store.all("SELECT * FROM categories ORDER BY name"),
  );
  const orderedMembers = (key: string) => {
    store.resource("categories", key);
    return store
      .all(
        "SELECT itemId FROM item_categories WHERE categoryId=? ORDER BY position",
        key,
      )
      .map((x) => x.itemId);
  };
  route("GET", "/categories/:id/order", null, (req: any) => ({
    itemIds: orderedMembers(req.params.id),
    version: store.resource("categories", req.params.id).version,
  }));
  route(
    "PUT",
    "/categories/:id/order",
    obj(
      {
        itemIds: { type: "array", items: uuid, uniqueItems: true },
        version,
        requestId: uuid,
      },
      ["itemIds", "version", "requestId"],
    ),
    (req: any) =>
      store.once("category-order:" + req.params.id, req.body, () => {
        const category = store.resource("categories", req.params.id);
        store.version(category, req.body.version);
        const current = store.members(category.id);
        requireThat(
          current.length === req.body.itemIds.length &&
            current.every((k) => req.body.itemIds.includes(k)),
          "Category members changed; reload before sorting",
          409,
        );
        store.run(
          "UPDATE item_categories SET position=j.key FROM json_each(?) j WHERE categoryId=? AND itemId=j.value",
          JSON.stringify(req.body.itemIds),
          category.id,
        );
        store.run(
          "UPDATE categories SET version=version+1 WHERE id=?",
          category.id,
        );
        return { itemIds: req.body.itemIds, version: category.version + 1 };
      }),
  );
  route("GET", "/categories/:id/members", null, (req: any) => ({
    itemIds: store.members(req.params.id),
  }));
  const categoryBody = obj({ name: str, version }, ["name"]);
  const saveCategory = (req: any) => {
    const b = req.body,
      key = req.params.id || id();
    if (req.params.id)
      store.version(store.resource("categories", key), b.version);
    store.run(
      "INSERT INTO categories(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=version+1",
      key,
      b.name,
    );
    return store.resource("categories", key);
  };
  route("POST", "/categories", categoryBody, (req: any) =>
    store.tx(() => saveCategory(req)),
  );
  route(
    "PUT",
    "/categories/:id",
    { ...categoryBody, required: [...categoryBody.required, "version"] },
    (req: any) => store.tx(() => saveCategory(req)),
  );
  route(
    "DELETE",
    "/categories/:id",
    obj({ version }, ["version"]),
    (req: any) =>
      store.tx(() => {
        const key = req.params.id;
        store.version(store.resource("categories", key), req.body.version);
        const refs = store.all(
          "SELECT i.id,i.name,'Item' AS kind FROM items i JOIN item_categories r ON i.id=r.itemId WHERE r.categoryId=?",
          key,
        );
        if (refs.length) throw new Problem(409, "Category is referenced", refs);
        store.run("DELETE FROM categories WHERE id=?", key);
        return { ok: true };
      }),
  );
  registerDocuments(route, store);
  registerHistory(route, store);
  const web = resolve("dist/web");
  if (existsSync(web)) {
    await api.register(staticFiles, { root: web });
    api.setNotFoundHandler((req, reply) => {
      const path = req.url.split("?")[0];
      if (
        req.method === "GET" &&
        /^\/(items|categories|templates|checklists)(\/[^/]+)?$/.test(path)
      )
        return reply.sendFile("index.html");
      return reply.code(404).send({ message: "Not found" });
    });
  }
  return api;
}
