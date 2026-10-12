# Loom Roadmap & Milestones

Status: M1–M4 complete under original rules; 2026-10-12 design changes implemented. M5 implementation/local verification complete, container acceptance awaits a runtime. Proceed by acceptance results without preset completion dates. Product rules: [Design Doc](design.md) and [AGENTS.md](../AGENTS.md).

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

- Database/API integration: reference checks/deletion remain transactionally consistent; historical snapshots do not block deletion, category hierarchy is rejected, and failures leave no partial results.
- Templates/names: repeated saves retain old revisions; Item renaming affects only current views, while instantiating old revisions uses latest surviving names without changing history itself.
- Category operations: when egg belongs to both Ingredients/Experimental materials, automatically merge into one entry; as sources go 2→1→0, retain→retain→remove. Membership updates do not overwrite quantity/notes/order/checked states, and exclusions are not automatically re-added.
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

### Category member details (2026-10-12)

- Category gains an open action; details show recursive Items, child-category navigation, and specific membership relationships, deduplicated by Item ID. Supports adding existing Items, editing via the shared dialog, and removing a specified category relationship while preserving the Item and other relationships.
- Reuse AppLayout/Page and existing Item API without database migration; synchronize design and constraints.
- Build/type checking passed; existing 10 desktop/mobile end-to-end tests passed, plus 2 new Category desktop/mobile regressions covering recursive deduplication, editing, retention after removing relationships, addition, and child-category navigation.

### Shared collection views (2026-10-12)

- Four resource types and Category members share Collection/RecordCard and Page card/list switching; whole-card/row clicks and keyboard open, while internal delete/remove actions remain independent.
- Category member addition uses a header action and Modal. Lists become continuous white panels with row separators, without category checked state.
- Build, type checking, and 12 desktop/mobile end-to-end tests passed, covering four-page view switching, title-action alignment, recursive member operations, and keyboard opening; Category list screenshots checked on desktop/mobile.

### Shared top action area (2026-10-12)

- Page owns card/list SVG icons, the primary-action plus, button sizing, and spacing. Pages only pass primaryAction label/onClick, no custom button JSX. Category Add members shares the other pages' create position and component.
- Build and 12 desktop/mobile end-to-end tests passed, covering four-page button alignment, view switching, and Category-detail operations.

### Consistent list row content (2026-10-12)

- RecordCard gains shared record-main/record-actions: left-aligned stacked names/descriptions and compact right-side edit/delete icons. List rows and whitespace below titles are tightened while retaining touch targets.
- Build and 12 end-to-end tests passed; 2 added desktop/mobile assertions passed for Category-list name/description left alignment and edit icons not accidentally opening details, with actual list screenshots checked.

### Stable view-switch page shell fix (2026-10-12)

- Remove :has styles that changed Page background, border, and padding based on list content; white list panels apply only to Collection. View switching no longer moves titles or actions.
- Build and 4 desktop/mobile style regressions passed, comparing complete header/page-actions boundingBox before/after switching on each page and finding equality. Other business end-to-end tests not rerun this time.

### Single-line Category members and sorting (2026-10-12)

- Members display one row with handle, name, and right-side relationship entry, without direct-member/note second lines or check circles. Remove Back/member-count bar, retaining Add member. Move card editing/deletion to the upper right; Page header position remains.
- Add Category order API and migration 5; transactionally validate the complete recursive member set/version, persisting order and requestId retry results. Refresh catalog versions after ordering.
- Fix card internal-action layers obscuring mobile navigation. Build and 18 API/database tests passed; final 14 desktop/mobile end-to-end tests passed, including dragging, keyboard sorting, refresh persistence, and stable header dimensions. Mobile is browser simulation; real touch devices not tested.

### Shared creation forms (2026-10-12)

- Template/Checklist creation replaces native prompt with a shared Modal name form, Create/Cancel, validation, and retries of failed original requests; calendar default dates remain. Business inputs continue to ignore 1Password.
- Build and 14 end-to-end tests passed; 2 added desktop/mobile flows passed for new-modal focus/Escape focus return and freezing names/retrying after lost creation responses.

### Consolidate detail-page actions (2026-10-12)

- The shared Template/Checklist editor removes permanently visible multi-row actions; Page unifies Back, resource title, More, Add, and necessary save actions. Settings and history operations move into Modals, as does source selection; the body focuses on entries, retaining save/retry and archived read-only semantics.
- Build and 14 end-to-end tests passed; after the final shared Save-icon adjustment, rebuild and 2 desktop/mobile full-flow tests passed, with Template-detail screenshots checked.

### Item category tags and equal-height cards (2026-10-12)

- Categories become tags; notes use 12px and reserve two lines consistently, names stay on one line, and card actions remain at the upper right. Show two categories plus remaining count, retaining full data.
- Build and 2 desktop/mobile regressions passed, verifying equal card heights with long/no notes, 36px note areas, 12px text, and category tags; screenshots checked.

### Extract shared collections and resource dialogs (2026-10-12)

- Collection/RecordCard move into web/collection.tsx for all four resources and category members. Page still owns view choice; layout and colors retain their existing values.
- ResourceDialog unifies creation for four resources and catalog editing: form shell, name validation, errors, and actions. Callers retain business fields and original save/retry logic. While retry is pending, both Cancel and Escape refuse closure to preserve request identity.
- Build and 16 desktop/mobile browser end-to-end tests passed, covering focus, validation, password-manager attributes, and restored focus after closing all four resource-creation modals, plus stable header geometry during view switching, ordering, retries after lost save responses, and archive restoration. Mobile uses a simulated browser; real devices not tested.

### Show category relationships directly (2026-10-12)

- Remove member-row More menus and relationship modals; category names display inline as tags, whose × unlinks that specific relationship. Retain single-row main structure; narrow-screen multiple categories may wrap, with ordering/editing retained.
- Build and 8 relevant desktop/mobile end-to-end tests passed, covering multiple-category display, removing only the specified relationship, keyboard editing, persistent ordering, and stable header geometry. Mobile uses browser simulation; real devices not tested.

### Session initialization on refresh (2026-10-12)

- Login state initially awaits checking; show main page/login form only after /session, avoiding a login flash during refresh. Only 401 enters login; other session errors show errors/retry, and catalog failures retain authenticated state with errors.
- Build and 8 desktop/mobile regressions passed; new controlled delayed-session tests verify no password field while waiting and direct main-page display on success. 503 does not show login; after retry, actual unauthenticated responses show login. Mobile uses browser simulation; real devices not tested.

### URL routing and initial-screen flash fix (2026-10-12)

- Four catalogs and resource details use independent URLs; Checklist date filtering uses query parameters. Refresh/direct access restores location, History API forward/back synchronizes the interface and protects unsaved drafts. Catalog Item editing can be directly linked; editing within categories retains category context.
- Remove the login-like waiting interface; initial HTML retains the warm-gray background, showing the main interface only after catalog initialization without a login-form or visible checking transition. Actual page reloads still load data.
- Fastify falls back to index.html only for defined Web paths; unknown API routes remain JSON 404.
- Build, 18 API/database tests, and 22 desktop/mobile browser end-to-end tests passed, including detail refresh/direct access, forward/back, retained URL/content after refusing draft discard, date filtering, and no login shell during session delay. New routing tests use independent dates to avoid calendar-count interference. Mobile uses simulated browser; real devices not tested.

### Automatic development backend reload (2026-10-12)

- Diagnose old backend process not reloading, causing new pages to fail calls to the new ordering endpoint; pnpm dev backend now uses Node --watch, frontend remains Vite.
- Restarted local development service on original host/port; touching app.ts triggered an actual restart, with logs confirming backend listening again on 3000. Static detail routes return 200; 18 API/database tests passed (including ordering/development proxy). Did not probe the ordering API through the personal account or read its session/password.

### Remove sort handles (2026-10-12)

- Category members no longer show sorting handles; shared SortableRow supports directly dragging cards/list rows. Sorting starts only after the mouse threshold, clicks still open, and internal category-removal buttons do not start dragging. Mobile dragging starts after a 250ms long press, while ordinary swipes still scroll; arrow keys sort after focusing the Open button.
- Persistent ordering reuses existing Category API, retaining versions/request retries. Build and 22 desktop/mobile end-to-end tests passed, including whole-row mouse dragging, keyboard ordering, refresh retention, and CDP native-touch long-press dragging without opening entries. Real touch devices not tested.

### Flat Categories and merge-all (2026-10-12, design approved; implementation evidence below)

These new rules supersede earlier category-tree and Merge/Keep both designs; completed milestones/old acceptance records remain historical evidence and do not establish implementation of new rules.

1. Data/contracts: flat Category, remove parentId/recursive membership; retain Category IDs, direct membership, category order, and all historical snapshots. After backup, preview effects of removing old hierarchy, clearly explaining parents no longer include child-category members, without automatically copying relationships. API documents synchronize target contracts and distinguish currently available endpoints.
2. Sources/merging: all Template/Checklist Item additions merge automatically by ID; Items, Category groups, and source relationships are unique within documents. Backend computes source counts from category-source relationships and direct; zero-source cleanup and structural writes share transactions, retaining version/requestId safe retries. Direct sources retain entries; temporary entries do not merge by name.
3. Compatibility/history: normalize old duplicate entries/category groups after previews; differing quantities/units/notes/checked states require selecting retained values without silent overwrites. Old revisions/archives are not rewritten; restore/copy/instantiate/convert to template resolve conflicts before producing valid content.
4. Web/verification: shared editor removes Keep both, category editing removes parent/child-category entries; update previews show source counts/final removal. Cover egg in two categories, direct sources, repeated additions/request retries, manual-delete exclusions, group removal, updating last sources, stale versions, failed-migration rollback, and historical conflicts; run API/database and desktop/mobile regressions.

This section records design-stage plans; implementation/verification appears in delivery records below. Direct addition counts as one source, retained separately from category sources; global Item-deletion reference restrictions remain independently enforced.

### Three-level internal Template sections (2026-10-12, design approved; implementation evidence below)

- Add document Section structure and entry display positions independently of Category/source groups; three levels count only sections, excluding Item/root. Instantiated Checklists copy structure independently with the same three-level limit.
- The same Item remains unique across sections; repeated addition retains its existing position, and moving does not change source counts. Deleting a nonempty section defaults to promoting content to the parent, retaining entries, sources, and relative order.
- Implementation must synchronize relationship storage, versioned historical snapshots, API schemas, and shared Documents editor; legacy entries default to root, and old history is not rewritten. Handle compatibility together with the flat-category/automatic-merge changes above.
- Acceptance covers usable third/rejected fourth level, cycle/cross-document rejection, subtree-movement depth, cross-section merging, moving/source cleanup, content retention deleting nonempty sections, and revision/instantiation/archive-restoration structure/order. Verified by tests in delivery records below.

### New design implementation and acceptance (2026-10-12)

- Migration 6: Categories become flat; old parent relationships remain in legacy_category_parents. Direct members, resource IDs, old duplicate rows, revisions, and archive originals are preserved. Adds section JSON and entry.sectionId; database triggers reject new hierarchies and duplicate Items per document. Conflicting old duplicate values require explicit choice during editing/history operations, merging all sources.
- All Template/Checklist additions merge automatically; repeated whole-category addition does not duplicate counts, and GET documents returns sourceCount. Removing a source group or removing the last source through category updates cleans up entries, retaining other sources, direct sources, checked states, and global Items. Structural writes and cleanup run transactionally, retaining versions and persistent requestId.
- Shared Documents/ResourceDialog/Modal support three section levels, renaming, parent changes, moving up among siblings, moving entries, and promoting content when deleting nonempty sections. New historical schemaVersion 2 remains compatible with reading 1; instantiation/restoration remap section IDs. Sections have no sources or checked state; mobile entries use two lines, with movement through a shared modal.
- `pnpm run build`, final `pnpm run check`, and `git diff --check` passed. All 24 `pnpm test` tests passed, covering sources 2→1→0, direct sources, category membership updates, repeated additions/safe retries/database uniqueness, three-level and cycle constraints, atomic failures, revision/instantiation/archive restoration, legacy data migration, historical conflicts, and restoring the old schema from a pre-upgrade backup.
- All 26 desktop/mobile `pnpm test:e2e` tests passed, including section creation/excessive-depth rejection/renaming/deletion with promotion/entry movement/refresh persistence, two-category merging and source cleanup, and existing routing, search, calendar, layout, ordering, and full history flows. Desktop/mobile three-level section screenshots were checked; mobile uses a simulated browser, real touch devices were not tested, and container acceptance still awaits a runtime.
- README documents upgrade/rollback: back up before starting migration; rollback restores the pre-upgrade database to a new path and runs old code, never writing upgraded schema with old code. Rollback backup excludes writes after backup. Git not yet committed.

### Global configuration and anonymous access (2026-10-12)

- Add loom.config.json and server/config.ts, default auth.enabled:true; LOOM_CONFIG specifies another path. Runtime validation at startup rejects invalid configuration/missing custom paths; a missing default file retains authentication. Changes require restart. Docker image includes default configuration.
- User explicitly confirmed: auth.enabled:false allows every device that can reach the service (including LAN phones) to anonymously use Web/API. No account initialization; anonymous writes still validate process-level CSRF and supplied Origin, and invalid Bearer tokens cannot bypass validation. /session returns authEnabled/csrf with no caching; no fake accounts/sessions created.
- Web resolves the root route after receiving the server mode: without login requirements, enter /checklists and hide Logout; default login mode remains /items, retaining direct paths. Re-enabling authentication protects the original database, retaining data and existing accounts.
- pnpm run build and git diff --check passed; all 26 pnpm test tests passed, covering configuration booleans/invalid types/unknown fields/missing files, account-free anonymous reads/writes, CSRF/Origin rejection, safe retries, and protection after re-enabling authentication. All 28 desktop/mobile pnpm test:e2e tests passed, adding actual production-process file configuration, login-free homepage, creation/refresh, direct links, and authentication-enabled restart flows. Personal account data was neither read nor changed; default configuration remains true, Git not committed. Containers and real touch devices not tested.

### Loom site icon (2026-10-12)

- Add a green/warm-white kitten checklist SVG shared by browser favicon and AppLayout branding; generate a 32px PNG fallback and 180px Apple touch icon. Retain brand dimensions and current colors, without dependencies. Render locally in a browser and inspect previews.
- pnpm run build and git diff --check passed; business regressions not rerun, iOS home-screen bookmarking not tested.

### Uncommitted change review fixes (2026-10-12)

- Fix unknown sources silently being filtered and deleting entries: structural saving first validates source ownership by submitted groups or original groups of the current document; unknown/other-document sources return 400. Normal removal of original category groups still releases sources and cleans up zero-source entries. Regressions confirm failure does not change entries, checked, name, version, or Template revision.
- Fix stale CSRF blocking saves after anonymous process restart: shared API client fetches session again on explicit Invalid CSRF token / 403 and retries once only. The body is serialized in advance, keeping requestId and content unchanged. Origin/version conflicts are not retried; refresh failure or a second failure reports normally.
- pnpm run build, pnpm run check, and git diff --check passed; 29 pnpm test tests and 28 desktop/mobile pnpm test:e2e tests passed. Anonymous tests retained the original page, restarted the actual production backend, then edited an entry and verified saving without refresh or login. Containers and real touch devices not tested; Git not committed.

## Improve editor add operations (2026-10-12)

- Template/Checklist share a New section action directly in the Page header; the addition modal supports searching then clicking an Item to add, side-by-side category actions, and cancellation, remaining open on failure.
- Acceptance: build/type checking and 4 desktop/mobile section/full-checklist-flow regressions passed; modal/header screenshots checked at both screen sizes. Real phones not yet verified; Git not committed.

## Shared button component and styles (2026-10-12)

- Migrate all Web buttons to Button with primary, normal, dangerous, light, and icon variants; remove duplicate button skins in cards, entries, and document menus. Reload shows a normal button border; Delete template uses the dangerous variant, retaining form submission, disabled conditions, and handlers.
- Acceptance: build/type checking and all 30 desktop/mobile regressions passed; add button-border/dangerous-style/keyboard-activation/all-buttons-use-shared-component checks, and inspect desktop/mobile action-modal screenshots. Real phones not verified; Git not committed.

## Navigation links compared with Memos styles (2026-10-12)

- Read fonts, line heights, icons, buttons, and theme variables from developer tools on the user's already open memo.d0u9.cc; measured values recorded in design, retaining Loom's green theme.
- Four navigation entries share NavigationLink, real links, and aria-current; normal clicks use leave protection, while modifiers retain new-tab behavior. Desktop navigation uses 13px/18px, normal weight, 28px rows, and four shared line icons. Buttons/single-line inputs use 28px, icon stroke 1.8px, mobile touch targets at least 44px.
- Acceptance: build/type checking and 30 desktop/mobile regressions passed, including real links, selected states, navigation proportions, new tabs, date filtering, and unsaved leave protection; desktop/mobile screenshots checked. One restart-test process shutdown timed out; complete rerun passed. Real phones not tested; Git not committed.

## Smaller button text (2026-10-12)

- Shared action buttons change from 14px/20px to 13px/18px, retaining existing heights, colors, navigation, input, and body settings.
- Acceptance: build, type checking, and 6 desktop/mobile style regressions passed; Git not committed, real phones not tested.

## UI Design specification cleanup (2026-10-12)

- Add docs/ui-design.md to centralize final visual parameters, boundaries between shared buttons/navigation, page/collection/editor/modal rules, and mobile/acceptance requirements. Record Memos reference values separately from Loom's adopted values.
- design and AGENTS add the entry point and correct the old "borderless settings actions" constraint. Documentation changes only; relative links and diff checked, business tests not rerun, Git not committed.

## Sidebar account footer (2026-10-12)

- AppLayout adds a Memos-style account footer: thin separator, user icon, actual server account name, and vertical more menu. Sign out moves into the menu; Escape closes it and restores focus. Login/session responses add optional username; response schemas and API docs are updated.
- Login-free mode shows an unlock icon and "No login required", without username, account menu, or Logout; mobile login-free mode retains only four navigation entries, while logged-in mode provides a bottom account menu.
- Acceptance: build passed; 6 API/configuration tests, 6 desktop/mobile style checks, and 2 login-free checks passed. Username refresh/menu keyboard closure verified with screenshots; restart test once timed out closing a process and passed separately. Real phones not tested; Git not committed.

## Item Group catalog filtering (2026-10-12)

- Each Item has one nullable itemGroup name, independently of Category, sections, and source groups. Shared Item modal selects existing names or accepts new ones; All/Ungrouped/group Tabs intersect with search, shared by cards/lists, and creation within a group defaults to that group.
- Incremental migration 7 sets legacy Items to null; PUT omission preserves the old group, null clears it, retaining versions and creation deduplication. GET /items supports group-name filtering; synchronize OpenAPI/response contracts. Historical creation of new Items defaults to ungrouped; pre-upgrade backup enables rollback.
- Acceptance: build/type checking, 30 server tests, and 6 desktop/mobile browser checks passed. Cover legacy migration/repeated startup, old callers retaining group names, exact filtering/clearing/invalid fields/stale versions/deduplication, within-group creation/editing, intersected search, cards/lists, and Tab keyboard operation. Original search/card-height regressions passed; group-page screenshots checked. Not committed; real phones/containers not tested.

## Align Item dialog fields (2026-10-12)

- Shared ResourceDialog fields use consistent 13px/18px labels and 16px spacing, with a more compact notes area. Item categories remove the legend border, aligning the title left with other fields; category options are wrapping tag blocks with centered native checkboxes/names, retaining selection/disabled/keyboard and mobile click targets.
- Build and 4 desktop/mobile browser checks passed, verifying tag positions/font sizes, Space selection, category retention after saving, Escape, and original Group flow; screenshots at both sizes checked. Not committed; real phones not tested.

## Group tags and drag-to-group (2026-10-12)

- Group tabs become wrapping rounded tags with green selection. Item cards/lists reuse SortableRow; dropping on a group replaces the sole group, while Ungrouped clears it. Mouse threshold, mobile long press, target highlighting, and suppressed post-drag opening share one implementation. Keyboard Group editing remains. All is not a drop target; saving blocks repeated dragging, without optimistic local overwrite.
- Build, type checking, and 6 desktop/mobile checks passed: card/list drops, touch long press, refresh after saving, category/note retention, retention after 409, group keyboard filtering, and original category-order regression. Screenshots at both sizes checked. Initial combined run exposed offscreen mobile group labels and old tests relying on group-name sorting; wrapping labels and correcting final Tab assertions made all pass. Not committed; real touch devices not tested.

## Visible drag feedback (2026-10-12)

- SortableRow shares a floating name preview, lift animation, white background, and shadow; the original row remains faded. The pointer-following preview does not intercept drop hit testing. Mobile shows it after a 250ms hold; ordinary swipes still scroll. Release, cancel, Escape, disable, and unmount clear previews/highlights; reduced motion disables lift animation.
- Build/type checking passed; 4 desktop/mobile group-drop/original-category-order checks passed, including long-press preview, no group writes after cancellation, card/list drops, and failure retention. Generated dragging screenshots at both screen sizes. Not committed; real phones not tested.

## Display Item group information (2026-10-12)

- Shared card/list metadata adds Group · group-name tags, showing Ungrouped when unset; retain full-name hints, refresh tags after successful dragging, and retain them on failure.
- Build and 4 desktop/mobile regressions passed, confirming group-name updates after dragging cards/lists, retention after cancellation/failure, and equal card heights with/without notes. Not committed; real phones not tested.

## Stable row hover and editing backgrounds (2026-10-12)

- Shared card/list-row hover uses a 180ms background transition; keyboard focus becomes a thin inward dashed line to avoid side clipping, without a mouse-selected state.
- Item editing route.id no longer hides search or resets the query. Background Group and filtered list remain; business-page changes still reset search.
- Build and 4 desktop/mobile regressions passed, checking unchanged search coordinates before/after modal opening, retained queries, and four-page search. Not committed; real phones not tested.

## Group dropdown styling (2026-10-12)

- Replace native datalist with shared Combobox: an input-width white panel, themed border, and light shadow; options reuse Button. Retain existing group selection, new group names, clearing, filtering, arrow keys/Enter, layered Escape, and closing on leaving the field, following disabled/1Password constraints.
- Build and 4 desktop/mobile checks passed, covering mouse selection, new group-name input, keyboard selection, reopening, and Escape retaining parent modal, plus saving/form-alignment regressions. Dropdown screenshots checked. Not committed; real phones not tested.

## Pre-commit review fixes (2026-10-12)

- Fix long-list group labels leaving the screen: Group bar sticks to the top, limited to min(35dvh, 240px), with extra labels scrolling internally. Fix initial rapid movement off a card losing mouse dragging: capture the original target pointer on press, retaining normal clicks.
- Fix invisible active Combobox keyboard options and initial ArrowUp skipping the last option: scroll only the options container; initial Up/Down selects last/first respectively.
- Build and 8 desktop/mobile regressions passed, adding 25-group dropdown visibility, first/last switching, and dragging from long-list bottom to top labels; original group editing/drop/cancellation/failure and category sorting passed. Not committed; real phones/containers not tested.

## Create members directly in Category (2026-10-12)

- Add member modal adds "New Item", reusing catalog ResourceDialog and defaulting to the current category; creation/category relationships use Item POST in one transaction with requestId retries. Cancel writes nothing; success refreshes the current member list.
- Build and two desktop/simulated-mobile Category regressions passed, covering existing-member addition, creation, cancellation, category defaults, saved notes, and persistence after refresh. Not committed; real phones not tested.
- Pending investigation: simulated mobile clicking bottom Category navigation with long Item content reports content/html interception in Playwright; increasing navigation z-index alone did not help and was reverted. This regression directly opened /categories to verify member operations, without counting mobile navigation as passed.

## Inline creation in Category (2026-10-12)

- Move "New Item" below existing-member selection following feedback, expanding within the current Modal. Extract shared ResourceForm and ItemFields so catalog modals/category inline creation share fields. Cancel collapses; default current category; creation failures retain form/requestId.
- Build and two desktop/simulated-mobile Category regressions passed, verifying expand/cancel, creation with category membership, refresh persistence, and same-request retries without duplication after successful server writes with failed responses. Desktop catalog-form regression passed; combined mobile catalog-form run timed out but passed separately. Not committed; real phones not tested.

## Simplified Category member information (2026-10-12)

- Member rows do not repeat the current category name; right side directly shows "Remove". Small Item notes appear beside names on one line, truncating long notes with full hints. Cards/lists reuse identical content.
- Build and desktop/simulated-mobile Category regressions passed, covering updated note display, no repeated category names, and removal unlinking only the current relationship. Not committed; real phones not tested.

## Shared Item display across four pages (2026-10-12)

- Add ItemSummary: Item catalog/Category members/current Template/active Checklist share names, Item notes, Group, category tags, and card/list styles. Categories do not repeat the current category. Retain document quantities, units, entry notes, sources, checked states, and historical snapshots.
- Build and 6 existing desktop/simulated-mobile regressions passed; 2 new four-page content-consistency regressions passed, verifying independent Item/entry notes, retained group tags/quantities, and no mobile horizontal overflow. Not committed; real devices not tested.

## Fixed Item positions and note fade-out (2026-10-12)

- Shared ItemSummary explicitly fixes each element's grid position, reserving empty-note space. List notes have a maximum 240px width with end fading; cards reserve two lines and fade downward. ResizeObserver enables masks only for actual overflow; full content is retained.
- Build and 4 desktop/simulated-mobile regressions passed, verifying tags share columns with/without notes, note-width limits, overflow masks, and shared four-page content. Not committed; real devices not tested.
