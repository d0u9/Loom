# Loom

A personal Checklist application using TypeScript / Fastify / React / SQLite. Requires Node.js 24.13 or later.

```sh
npm ci
LOOM_PASSWORD='a-password-of-at-least-twelve-characters' npm run init
npm run build
npm start
```

Open http://127.0.0.1:3000; the default username is `admin`. `LOOM_DB` defaults to `data/loom.sqlite`, and `LOOM_USER` sets the initialization username. Remote deployments use HTTPS, set `HOST=0.0.0.0`, and let a reverse proxy handle TLS.

For development, run `npm run server` and `npm run dev` separately. `npm test` verifies the API/database, and `npm run check` checks types. Browser-session write requests must submit the `x-csrf-token` returned by `/api/v1/session`. External callers can create revocable Bearer tokens. After authentication, `/api/v1/openapi.json` provides the API contract.

See the [roadmap](docs/roadmap.md) for implementation progress and acceptance records.

## Backup and Restore

```sh
npm run backup -- /absolute/path/loom-backup.sqlite
# Stop the service first; restore to a new path without overwriting existing data
LOOM_DB=/absolute/path/restored.sqlite npm run restore -- /absolute/path/loom-backup.sqlite
LOOM_DB=/absolute/path/restored.sqlite npm start
```

Backup uses the SQLite online backup API and supports running WAL databases. Restore checks integrity and refuses to overwrite existing databases or leftover WAL files. Confirm restoration before switching paths. Backups include accounts and tokens; keep them as private data.

## Containers

```sh
docker compose build
docker compose run --rm -e LOOM_PASSWORD='a-password-of-at-least-twelve-characters' loom node dist/server/server/cli.js init
docker compose up -d
```

The image uses a non-root user, `/data` is a persistent volume, and the port binds only to localhost by default. When deploying across networks behind a reverse proxy, enable HTTPS and set `TRUST_PROXY` to trusted proxy IPs/CIDRs; do not trust arbitrary sources. The image contains only production dependencies and build outputs.

## Verification

```sh
npm test
npm run build
# Use an installed Chrome; in other environments, install the test browser first
npx playwright install chromium
npm run test:e2e
```

`LOOM_CHROME` can specify the browser executable. Installed Chrome is used automatically on macOS; otherwise Playwright Chromium is used. End-to-end tests use temporary databases, desktop/mobile dimensions, and production-server restart tests, without accessing personal databases. See the [API usage contract](docs/api.md) for API operation order.
