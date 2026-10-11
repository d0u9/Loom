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
import { registerGroups } from "./groups.js";
import { registerDocuments } from "./documents.js";
import { randomBytes } from "node:crypto";
export async function app(store: Store) {
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
      security: [{ session: [] }, { bearer: [] }],
    },
  });
  api.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api/v1")) return;
    const method = Array.isArray(route.method) ? route.method[0] : route.method;
    route.schema = {
      ...route.schema,
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
          ? { rateLimit: { max: 10, timeWindow: 60000 } }
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
      return { csrf };
    },
  );
  route("GET", "/session", null, (req: any) => {
    const s = store.get(
      "SELECT csrf FROM sessions WHERE hash=?",
      hash(req.cookies.session || ""),
    );
    return { csrf: s?.csrf || null };
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
  route("GET", "/items", null, () =>
    store.all("SELECT * FROM items ORDER BY name").map((i) => ({
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
      categoryIds: { type: "array", items: uuid, uniqueItems: true },
      version,
      requestId: uuid,
    },
    ["name", "categoryIds"],
  );
  const saveItem = (req: any) => {
    const b = req.body,
      key = req.params.id || id();
    if (req.params.id) store.version(store.resource("items", key), b.version);
    b.categoryIds.forEach((c: string) => store.resource("categories", c));
    store.run(
      "INSERT INTO items(id,name,note) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,note=excluded.note,version=version+1",
      key,
      b.name,
      b.note || "",
    );
    store.run("DELETE FROM item_categories WHERE itemId=?", key);
    b.categoryIds.forEach((c: string) =>
      store.run("INSERT INTO item_categories VALUES(?,?)", key, c),
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
  route("GET", "/categories/:id/members", null, (req: any) => ({
    itemIds: store.members(req.params.id),
  }));
  const categoryBody = obj(
    { name: str, parentId: { anyOf: [uuid, { type: "null" }] }, version },
    ["name", "parentId"],
  );
  const saveCategory = (req: any) => {
    const b = req.body,
      key = req.params.id || id();
    if (req.params.id)
      store.version(store.resource("categories", key), b.version);
    let parent = b.parentId;
    while (parent) {
      requireThat(parent !== key, "Category cycle");
      parent = store.resource("categories", parent).parentId;
    }
    store.run(
      "INSERT INTO categories(id,name,parentId) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,parentId=excluded.parentId,version=version+1",
      key,
      b.name,
      b.parentId,
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
        const refs = [
          ...store.all(
            "SELECT id,name,'Category' AS kind FROM categories WHERE parentId=?",
            key,
          ),
          ...store.all(
            "SELECT i.id,i.name,'Item' AS kind FROM items i JOIN item_categories r ON i.id=r.itemId WHERE r.categoryId=?",
            key,
          ),
          ...store.all(
            "SELECT d.id,d.name,d.kind FROM documents d JOIN groups g ON g.documentId=d.id WHERE g.categoryId=?",
            key,
          ),
        ];
        if (refs.length) throw new Problem(409, "Category is referenced", refs);
        store.run("DELETE FROM categories WHERE id=?", key);
        return { ok: true };
      }),
  );
  registerDocuments(route, store);
  registerGroups(route, store);
  registerHistory(route, store);
  const web = resolve("dist/web");
  if (existsSync(web)) {
    await api.register(staticFiles, { root: web });
  }
  return api;
}
