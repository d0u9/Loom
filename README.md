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
