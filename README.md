# Loom

A personal Checklist application using TypeScript / Fastify / React / SQLite. Requires Node.js 24.13 or later and pnpm 12.4.1.

If pnpm is not installed, use `npm install -g pnpm@12.4.1`. The repository maintains only `pnpm-lock.yaml`, using frozen-lockfile installation for builds and deployment.

```sh
pnpm install --frozen-lockfile
LOOM_PASSWORD='a-password-of-at-least-ten-characters' pnpm run init
pnpm run build
pnpm start
```

Open http://127.0.0.1:3000; the default username is `admin`. `LOOM_DB` defaults to `data/loom.sqlite`, and `LOOM_USER` sets the initialization username. Remote deployments use HTTPS, set `HOST=0.0.0.0`, and let a reverse proxy handle TLS.

Development needs only one command to start the backend and frontend together:

```sh
# Allow phones to access the frontend over the LAN
pnpm dev --host
```

Open http://localhost:5173; API requests automatically proxy to backend port 3000. The frontend updates automatically and the backend restarts using Node file watching, avoiding calls to outdated endpoints after page updates. Ctrl+C stops both services. Development needs no build first or separate terminal running `pnpm run server`; first use still requires account initialization. Restart `pnpm dev` once after changing the development startup script itself.

`pnpm test` verifies the API/database, and `pnpm run check` checks types. Browser-session write requests must submit the `x-csrf-token` returned by `/api/v1/session`. External callers can create revocable Bearer tokens. After authentication, `/api/v1/openapi.json` provides the API contract.

See the [roadmap](docs/roadmap.md) for implementation progress and acceptance records.

## Interface and Calendar

All four pages share the sidebar and page framework, with right-side content centered at a maximum width of 960px. Click Checklist to see all checklists; click a calendar day to see that day. Desktop uses the sidebar calendar; mobile expands the calendar to select a date.

Checklist "Use date" can be set or cleared and autosaves; creating a checklist on the selected date defaults to that day. Archive/restore preserve the date; copies and template instances default to unscheduled. Restarting the service after upgrading automatically migrates the old database, without account reinitialization.

Ordinary business inputs are marked for 1Password to ignore; the login page still supports password autofill. Reminders, recurring scheduling, and external calendar synchronization are currently unavailable.

## Backup and Restore

```sh
pnpm run backup /absolute/path/loom-backup.sqlite
# Stop the service first; restore to a new path without overwriting existing data
LOOM_DB=/absolute/path/restored.sqlite pnpm run restore /absolute/path/loom-backup.sqlite
LOOM_DB=/absolute/path/restored.sqlite pnpm start
```

Backup uses the SQLite online backup API and supports running WAL databases. Restore checks integrity and refuses to overwrite existing databases or leftover WAL files. Confirm restoration before switching paths. Backups include accounts and tokens; keep them as private data.

## Containers

```sh
docker compose build
docker compose run --rm -e LOOM_PASSWORD='a-password-of-at-least-ten-characters' loom node dist/server/server/cli.js init
docker compose up -d
```

The image uses a non-root user, `/data` is a persistent volume, and the port binds only to localhost by default. When deploying across networks behind a reverse proxy, enable HTTPS and set `TRUST_PROXY` to trusted proxy IPs/CIDRs; do not trust arbitrary sources. The image contains only production dependencies and build outputs.

## Verification

```sh
pnpm test
pnpm run build
# Use an installed Chrome; in other environments, install the test browser first
pnpm exec playwright install chromium
pnpm run test:e2e
```

`LOOM_CHROME` can specify the browser executable. Installed Chrome is used automatically on macOS; otherwise Playwright Chromium is used. End-to-end tests use temporary databases, desktop/mobile dimensions, and production-server restart tests, without accessing personal databases. See the [API usage contract](docs/api.md) for API operation order.

### Flat Categories, Merging, and Section Upgrade

All Categories are peers, and Template/Checklist automatically merge the same Item. A source count reaching zero removes only the document entry. The detail "Add entry" dialog can create sections (at most three levels); sections can be edited, moved up, or removed, and entries can select their section. Deleting a nonempty section promotes its content and retains entries.

Startup after upgrading runs migration 6. Back up first: `pnpm run backup /absolute/path/loom-before-v6.sqlite` (build the CLI before running). Existing category IDs and direct memberships are retained, and old parent/child relationships are stored in legacy_category_parents. Parent categories no longer recursively show child-category Items. Choose retained values for old duplicate entries during editing/historical operations; old revision and archive content is not modified.

Rollback requires stopping the new service, restoring a pre-upgrade backup to a new database path, and then running old code. Do not connect old code directly to a migration 6 database (entries have added columns and old writes are incompatible). Refer to the restore commands above. Writes made after the backup are absent from the old backup.

### Global Configuration and Authentication-Disabled Mode

Root `loom.config.json` is global configuration read at startup, retaining login by default:

```json
{
  "auth": { "enabled": true }
}
```

Set enabled to false, then restart `pnpm dev` or the production service to use Web and API without login. The root opens `/checklists` directly, other direct links retain their paths, and sign-out is hidden; account initialization is unnecessary. Writes still first obtain csrf from `/api/v1/session` and then supply x-csrf-token; valid Bearer tokens also remain usable.

`LOOM_CONFIG=/absolute/path/config.json pnpm start` specifies a configuration file. Docker can mount it at `/app/loom.config.json` or specify LOOM_CONFIG. Invalid JSON/types/unknown fields and missing custom paths fail startup, preventing invalid configuration from silently taking effect. A missing default file still enables login. Optional `auth.loginRateLimit` (positive integer, login attempts per minute) defaults to 10; retain the production default. Only e2e passes a higher value in `e2e/start.ts`. Database, listening address, and port continue using existing environment variables.

Disabling login lets anyone who can connect to the service access and modify all data, including LAN devices. Re-enabling login does not delete data or accounts. If no account was initialized, first create it using the init steps above, then enable login and restart.
