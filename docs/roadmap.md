# Loom Roadmap & Milestones

Status: implementation underway; M1 complete, later phases progress through records below. Proceed by acceptance results without preset completion dates. Product rules: [Design Doc](design.md) and [AGENTS.md](../AGENTS.md).

## Milestones

| Phase | Status | Deliverables | Acceptance criteria |
| --- | --- | --- | --- |
| M0 Design and contracts | In progress | Product constraints, Design Doc, Roadmap, draft API contract, desktop/mobile page prototypes | Consistent four concepts and history/deletion/category-source rules; demonstrable main pages/conflict choices; finalized API request/response/error contracts |
| M1 Foundation and catalog | Complete | TS/Fastify/React/Vite skeleton, SQLite migrations, single-account login, Item/Category API and management pages | Editable Items with multiple categories; category trees reject cycles; active references prevent deletion; restart retains data |
| M2 Templates and checklists | Complete | Shared editor, temporary entries, quantity/unit/notes/order, Template revisions, instantiation, Checklist checking/saving | Immutable historical revisions; current names synchronize without changing history; independent instances/templates; each checklist checks independently; failed saves retain edits |
| M3 Category sources and updates | Complete | Whole-category expansion, source recording, Merge/Keep both, Update to latest preview/application, within-group exclusions | Updates retain data/checking; multiple sources do not incorrectly delete entries; explicit duplicate choices; manual removal does not automatically re-add; version conflicts prevent stale application |
| M4 History lifecycle | Not started | Archive, restore, copy, convert to template, missing Item handling, Template deletion | Archives read-only and release active references; deleted Item snapshots queryable; users can link/create/retain temporary entries; copying resets checking, restoration retains it; template deletion preserves existing checklists |
| M5 Release verification | Not started | Complete OpenAPI, containers, persistent volumes, initialization/backup/restore commands, end-to-end verification | Complete Web/API flows pass; desktop/mobile usable; container restart retains data; backups restore; record measured image size/resources |

## Verification priorities

- Database/API integration: reference checks/deletion remain transactionally consistent; historical snapshots do not block deletion, category cycles are prohibited, and failures leave no partial results.
- Templates/names: repeated saves retain old revisions; Item renaming affects only current views, while instantiating old revisions uses latest surviving names without changing history itself.
- Category operations: when egg belongs to both Ingredients/Experimental materials, Merge retains multiple sources and Keep both stays independent; membership updates do not overwrite quantity/notes/order/checked states, and exclusions are not automatically re-added.
- History operations: archives are read-only; history remains readable after Item deletion; restore/copy/convert to template all support linking/creating/temporary entries. Copy and restore have different checked-state semantics.
- End-to-end: create Item/Category → save Template → instantiate → check/additional entries → category update → archive → delete unreferenced Item → copy/restore → backup/restore.
- Usability: desktop keyboard operation, mobile touch selection/checking/sorting/conflict handling, save-failure retries, and stale-version notices.

## Review additions and pending implementation verification

The following five items are incorporated into design/development constraints but not yet implemented and cannot be marked verified.

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

M0 has AGENTS.md, design documents, and roadmap/acceptance definitions. Pending: draft API contract and page prototypes. Other phases not implemented yet.

## After v1

CLI client, collaboration, offline synchronization, recurring checklist generation, and automatic category synchronization are deferred. Future extensions must retain existing historical snapshots and checklist independence. No performance/image-size promises; record measurements after M5.

## Implementation records

- M1 (2026-10-11, this milestone commit): basic Web/API, single-account initialization/login, CSRF, revocable tokens, multiple Item categories, category tree, effective-reference deletion checks, SQLite migration 1. `npm test` passed 2 API/persistence tests; `npm run build` passed. Desktop/mobile visual checks deferred to M5.

- M2 (2026-10-11, this milestone commit): shared editor, temporary-to-Item conversion, quantity/unit/note/order, revision queries, instantiation, independent checking, structural saves never overwrite checked, durable request deduplication. `npm test` passed 3 tests; build passed. Missing historical Items are handled in M4.

- M3 (2026-10-11, this milestone commit): category groups/entry sources, recursive member previews, Merge/Keep both, updates preserve checked, group exclusions and restore. `npm test` passed 4 tests; build passed. Added tests cover child-category membership conflicts, multi-source merging, and exclusion after deleting the last Keep both entry.
