# Loom Roadmap & Milestones

Status: M1–M4 complete; M5 implementation/local verification complete, container acceptance awaits a runtime. Proceed by acceptance results without preset completion dates. Product rules: [Design Doc](design.md) and [AGENTS.md](../AGENTS.md).

## Milestones

| Phase | Status | Deliverables | Acceptance criteria |
| --- | --- | --- | --- |
| M0 Design and contracts | Complete | Product constraints, Design Doc, Roadmap, draft API contract, desktop/mobile page prototypes | Consistent four concepts and history/deletion/category-source rules; demonstrable main pages/conflict choices; finalized API request/response/error contracts |
| M1 Foundation and catalog | Complete | TS/Fastify/React/Vite skeleton, SQLite migrations, single-account login, Item/Category API and management pages | Editable Items with multiple categories; category trees reject cycles; active references prevent deletion; restart retains data |
| M2 Templates and checklists | Complete | Shared editor, temporary entries, quantity/unit/notes/order, Template revisions, instantiation, Checklist checking/saving | Immutable historical revisions; current names synchronize without changing history; independent instances/templates; each checklist checks independently; failed saves retain edits |
| M3 Category sources and updates | Complete | Whole-category expansion, source recording, Merge/Keep both, Update to latest preview/application, within-group exclusions | Updates retain data/checking; multiple sources do not incorrectly delete entries; explicit duplicate choices; manual removal does not automatically re-add; version conflicts prevent stale application |
| M4 History lifecycle | Complete | Archive, restore, copy, convert to template, missing Item handling, Template deletion | Archives read-only and release active references; deleted Item snapshots queryable; users can link/create/retain temporary entries; copying resets checking, restoration retains it; template deletion preserves existing checklists |
| M5 Release verification | Implementation complete; container acceptance pending | Complete OpenAPI, containers, persistent volumes, initialization/backup/restore commands, end-to-end verification | Complete Web/API flows pass; desktop/mobile usable; container restart retains data; backups restore; record measured image size/resources |

## Verification priorities

- Database/API integration: reference checks/deletion remain transactionally consistent; historical snapshots do not block deletion, category cycles are prohibited, and failures leave no partial results.
- Templates/names: repeated saves retain old revisions; Item renaming affects only current views, while instantiating old revisions uses latest surviving names without changing history itself.
- Category operations: when egg belongs to both Ingredients/Experimental materials, Merge retains multiple sources and Keep both stays independent; membership updates do not overwrite quantity/notes/order/checked states, and exclusions are not automatically re-added.
- History operations: archives are read-only; history remains readable after Item deletion; restore/copy/convert to template all support linking/creating/temporary entries. Copy and restore have different checked-state semantics.
- End-to-end: create Item/Category → save Template → instantiate → check/additional entries → category update → archive → delete unreferenced Item → copy/restore → backup/restore.
- Usability: desktop keyboard operation, mobile touch selection/checking/sorting/conflict handling, save-failure retries, and stale-version notices.

## Review additions and pending implementation verification

The following five items are incorporated into design, development constraints, and implementation; automated coverage/verification results appear in implementation records below.

| Phase | Agreed handling | Specific scenarios requiring verification |
| --- | --- | --- |
| M4 | Missing Categories restore as static groups and can be relinked | After archiving and deleting a Category, restore/copy/convert to template/instantiate from history retains content with updates disabled; after linking, previewing updates does not directly change entries |
| M2 | Serialize checking per entry; structural edits do not write checked; last submission across devices wins | Rapid check/uncheck ends unchecked; old responses do not roll UI back; notes edited on another device do not overwrite checking; checking after archive is rejected |
| M3 | Preview application and Template saving compare complete recursive member sets | After previewing a parent category, modifying child membership or moving subtrees returns 409 if the set changes; no partial changes applied |
| M0–M4 | Finalize requestId contract and persistent deduplication; business writes/results share transactions | Retrying copy/convert to template/instantiate after lost responses creates once only; template saving produces no extra revision; retries after restart still deduplicate; old checking retries do not overwrite newer states; same ID with different content returns 409 |
| M3 | Exclusions by Item within groups, created only after deleting the last entry for the same Item | Two egg entries with Keep both in one group: deleting one does not exclude the remaining entry; after deleting the last, updates do not re-add; explicit restoration clears exclusion |

M0 must translate these rules into request/response contracts; add the above tests and evidence as corresponding features complete.

## Delivery record format

After each phase, record completion date, corresponding commit, and verification commands/results here. Mark unrun checks unverified; page existence alone does not establish completion.

M0 has AGENTS.md, design documents, roadmap/acceptance definitions, API usage contract, and runtime-schema-generated OpenAPI. Actual desktop/mobile Web pages and browser verification replace separate prototypes. M1–M5 progress appears below.

## After v1

CLI client, collaboration, offline synchronization, recurring checklist generation, and automatic category synchronization are deferred. Future extensions must retain existing historical snapshots and checklist independence. No performance/image-size promises; record measurements after M5.

## Implementation records

- M1 (2026-10-11, `00fea71`): basic Web/API, single-account initialization/login, CSRF, revocable tokens, multiple Item categories, category tree, effective-reference deletion checks, SQLite migration 1. `npm test` passed 2 API/persistence tests; `npm run build` passed. Desktop/mobile visual checks deferred to M5.

- M2 (2026-10-11, `1094e76`): shared editor, temporary-to-Item conversion, quantity/unit/note/order, revision queries, instantiation, independent checking, structural saves never overwrite checked, durable request deduplication. `npm test` passed 3 tests; build passed. Missing historical Items are handled in M4.

- M3 (2026-10-11, `8d71cd5`): category groups/entry sources, recursive member previews, Merge/Keep both, updates preserve checked, group exclusions and restore. `npm test` passed 4 tests; build passed. Added tests cover child-category membership conflicts, multi-source merging, and exclusion after deleting the last Keep both entry.

- M4 (2026-10-11, `4a3d88a`): read-only archives, released references, restore/copy/convert-to-template previews and atomic application, three missing-Item choices, static Category restore/relink, and template deletion preserves instances. `npm test` passed 6 tests; build passed. Tests verify resource deletion after archive, checked preservation on restore, checked reset on copy, replacement Item creation, and safe retries.

- M5 (2026-10-11, this milestone commit): OpenAPI request/response/authentication contract, non-root multistage image/persistent volume, initialization/online backup/safe restore commands, desktop/mobile E2E, production restart tests, login rate limiting, and native Modal focus behavior. `npm test` passed 10 tests; `npm run build` passed; `npm run test:e2e` passed 4 tests, including Item creation and retry after a lost checked response. `npm audit --omit=dev --audit-level=high` reported 0 vulnerabilities. Desktop/mobile screenshots inspected.

### M5 measurements and remaining acceptance

- Local Node 24.21.0 production-service startup samples are approximately 225–265 ms, with approximately 96–105 MiB RSS afterward; these measure single-user startup with empty/small databases, not promised load capacity.
- Web build JS is approximately 243 kB (approximately 76 kB gzip); this is not container image size.
- This machine has no Docker, Podman, or other container runtime. Container build, restart persistence, and image-size measurement have not run; M5 is not fully accepted.
- With Docker available, build/initialize/start per README, create data, then verify persistence with `docker compose restart` and record image size using `docker image inspect`. Backup/restore passed on actual SQLite WAL databases but still needs retesting within persistent volumes.

### pnpm migration verification (2026-10-11)

- Imported from the original npm lockfile, retaining all 15 direct dependency versions. Pin pnpm 12.4.1, remove package-lock.json, and synchronize scripts, Dockerfile, and README. Historical npm acceptance commands remain unchanged.
- `pnpm install --frozen-lockfile`, `pnpm test` (10 tests), `pnpm run build`, and `pnpm run test:e2e` (4 tests) passed.
- Frozen installation, tests, and build passed in an independent temporary directory; after `pnpm prune --prod`, compiled API startup and authenticated reads passed, confirming no dependency on tsx/TypeScript or residual old npm installations.
- Dockerfile is updated; actual container builds remain unverified because no runtime is available. Rollback restores package.json, package-lock.json, Dockerfile, and docs from the pre-migration Git commit, then uses `npm ci`. No SQLite data migration is involved.

### Calendar and use dates (2026-10-11)

- Add a desktop sidebar calendar and mobile collapsible calendar, Checklist use-date editing, date marks/filtering, and creation for the selected date. Synchronize API contract and migration 4; old data defaults to unscheduled.
- All 17 `pnpm test` tests, type checking, build, and 8 desktop/mobile end-to-end tests passed, covering invalid dates, date preservation for old clients, archive/restore, clearing copied dates, legacy database migration, and repeated startup.
- Excludes times, reminders, recurring schedules, and external calendar synchronization.

### Interface and calendar decisions since the previous commit (baseline `cea2332`, 2026-10-11)

This section consolidates final rules after the baseline commit without adding milestones; corresponding code/documents ship with this commit.

- Retain warm-gray/white/green colors; adjust fonts, weights, controls, and whitespace proportions using Memos screenshots at the same size. Revert the unrequested blue and pure-white theme adopted during the process.
- Center right-side content with a final maximum width of 960px; all four pages share AppLayout/Page for consistent sidebar, calendar, title, and New-button position. Catalog and Documents editors retain their business behavior.
- Add 1Password-ignore attributes to non-login fields, retaining login autofill; fix focus restoration after modal closure.
- Checklist use dates, calendar dots, filtering, and creation on the selected date are implemented. Archive/restore preserves dates; copy/instantiation clears them. Checklist navigation always returns to all checklists.
- Verification: 17 API/database tests passed; 10 desktop/mobile end-to-end tests passed after shared-component refactoring, including alignment of New buttons' top/right edges on four pages. Before final commit, reran `pnpm run build`, `pnpm test` (17 tests), and `pnpm run test:e2e` (10 tests); all passed, including Checklist navigation clearing date filters.
- Desktop/mobile screenshots checked. Actual 1Password extension not tested; reminders, times, recurring schedules, and external calendar synchronization not implemented. Remaining Docker acceptance unchanged.
