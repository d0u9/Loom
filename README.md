# Loom

A personal Checklist application using TypeScript / Fastify / React / SQLite. Requires Node.js 24.13 or later and pnpm 12.4.1.

If pnpm is not installed, use `npm install -g pnpm@12.4.1`. The repository maintains only `pnpm-lock.yaml`, using frozen-lockfile installation for builds and deployment.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm start
```

Open http://127.0.0.1:3000. On first use, set a username and password (at least 10 characters) on the Web page; submitting enters the application directly. Existing accounts see the login page. `LOOM_DB` defaults to `data/loom.sqlite`, and `LOOM_USER` sets the initialization username. Remote deployments use HTTPS, set `HOST=0.0.0.0`, and let a reverse proxy handle TLS.

Development needs only one command to start the backend and frontend together:

```sh
# Allow phones to access the frontend over the LAN
pnpm dev --host
```

Open http://localhost:5173; API requests automatically proxy to backend port 3000. The frontend updates automatically and the backend restarts using Node file watching, avoiding calls to outdated endpoints after page updates. Ctrl+C stops both services. Development needs no build first or separate terminal running `pnpm run server`; first use sets up the account directly on the Web page. Restart `pnpm dev` once after changing the development startup script itself.

`pnpm test` verifies the API/database, and `pnpm run check` checks types. Browser-session write requests must submit the `x-csrf-token` returned by `/api/v1/session`. External callers can create revocable Bearer tokens. After authentication, `/api/v1/openapi.json` provides the API contract.

See the [roadmap](docs/roadmap.md) for implementation progress and acceptance records.

## Interface and Calendar

All four pages share the sidebar and page framework, with right-side content centered at a maximum width of 960px. Click Checklist to see all checklists; click a calendar day to see that day. Desktop uses the sidebar calendar; mobile expands the calendar to select a date.

Checklist "Use date" can be set or cleared and autosaves; creating a checklist on the selected date defaults to that day. Archive/restore preserve the date; copies and template instances default to unscheduled.

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

### Published image

GitHub Actions builds `dev` as `ghcr.io/d0u9/loom:dev`. Version tags such as `image-v0.0.1`, created on a commit reachable from `dev`, publish `ghcr.io/d0u9/loom:0.0.1` and move `ghcr.io/d0u9/loom:latest` to that build. Image versions are independent of package versions and the historical `v0.0.1` Git tag. Builds currently target Linux amd64. Each build checks fresh startup and authentication-disabled host configuration before publishing.

From the repository directory, using the supplied host `config/`:

```sh
docker pull ghcr.io/d0u9/loom:0.0.1
docker run -d --name loom-dev --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v loom-dev-data:/data \
  --mount type=bind,source="$(pwd)/config",target=/etc/loom,readonly \
  -e LOOM_CONFIG=/etc/loom/loom.config.json \
  ghcr.io/d0u9/loom:0.0.1
```

Reuse the existing database volume name when replacing a container. To access the service from LAN devices, bind the port to the appropriate host interface instead of localhost. A new GHCR package may be private initially: its owner must set package visibility to public for anonymous pulls, or consumers must log in to GHCR with a token granting `read:packages`.

To publish another image version from `dev`:

```sh
git switch dev
git tag image-v0.0.2
git push origin dev image-v0.0.2
```

Use a new version tag for each release; do not move published image tags. Image builds use the existing Dockerfile with the pinned pnpm version and frozen lockfile. The workflow uses `GITHUB_TOKEN` with package-write permission, requiring no separate registry secret.

### Build locally

```sh
docker compose build
docker compose up -d
```

Compose mounts host `./config/` read-only at container `/etc/loom/` and reads `config/loom.config.json` through `LOOM_CONFIG`. The database remains in the existing `loom-data` volume; recreating the container preserves data.

Disable authentication: Set `auth.enabled` to `false` in host `config/loom.config.json`. Run `docker compose up -d --force-recreate` when first applying the new mount; later configuration changes need only `docker compose restart loom`, without entering the container, copying files, or rebuilding the image. The whole configuration directory is mounted, so restarting also reads new content after editors replace files.

Set up the account on the first Web visit, without executing `docker exec … init`. Existing data volumes use the original account for login. `pnpm run init` remains available for CLI pre-initialization and requires `LOOM_PASSWORD`.

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

### Database Version

Database schema is currently version 1 (`server/db.ts`, recorded in `PRAGMA user_version`). New databases create tables automatically at startup; other versions refuse startup, without automatic upgrades for old development databases.

### Global Configuration and Authentication-Disabled Mode

`data/loom.config.json` is global configuration read at startup, retaining login by default:

```json
{
  "auth": { "enabled": true }
}
```

Set enabled to false, then restart `pnpm dev` or the production service to use Web and API without login. The root opens `/checklists` directly, other direct links retain their paths, and sign-out is hidden; account initialization is unnecessary. Writes still first obtain csrf from `/api/v1/session` and then supply x-csrf-token; valid Bearer tokens also remain usable.

`LOOM_CONFIG=/absolute/path/config.json pnpm start` specifies a configuration file. Repository Compose defaults to host `config/loom.config.json`; direct local execution still defaults to `data/loom.config.json`. For your own `docker run`, add `--mount type=bind,source="$(pwd)/config",target=/etc/loom,readonly -e LOOM_CONFIG=/etc/loom/loom.config.json` alongside the existing database volume. Restart the container after changing host configuration. Invalid JSON/types/unknown fields and missing custom paths fail startup, preventing invalid configuration from silently taking effect. A missing default file still enables login. Optional `auth.loginRateLimit` (positive integer, login attempts per minute) defaults to 10; retain the production default. Only e2e passes a higher value in `e2e/start.ts`. Database, listening address, and port continue using existing environment variables.

Disabling login lets anyone who can connect to the service access and modify all data, including LAN devices. Re-enabling login does not delete data or accounts. If no account was initialized, re-enable login, restart, then set up the account on the Web page.

Move to another machine: Stop the service and wait for exit, copy the entire `data/` into `data/` in the same project version, then start without reinitializing the account. Direct local execution moves default configuration together with the database; repository Compose also requires copying `config/`. If `LOOM_DB` or `LOOM_CONFIG` was set, copy the specified files separately. Move old project-root `loom.config.json` to `data/loom.config.json`; the new location does not automatically read the old one. A missing default file enables authentication. `data/` is private local data; do not commit it to Git or include it in images.

## Interface Language

Chinese and English are supported. Switch using a fixed-size language icon button on the login page and at the bottom of navigation. Its hover hint and accessible name identify the target language; it is also available on mobile and with authentication disabled. Chinese is the default. The current browser stores the language choice and retains it on refresh; user data such as item names, notes, and group names remains unchanged.

### v0.0.2 Simplified Version

Template saving updates only current content without version history; creating a checklist copies the saved template. Categories support only one-time bulk addition, without ongoing synchronization. Historically deleted Items remain temporary entries by default.

The database removes category-source tables (groups, entry_sources), entries.direct, and template_revisions, while schema remains version 1. v0.0.1 databases are incompatible; development data is rebuilt directly.
