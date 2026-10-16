# Loom Design Doc

Status: v0.0.1 (d1220fe) is the pre-simplification baseline; on 2026-10-13 the user confirmed v0.0.2 implementation according to the [simplified design](design-simplification.md). This document describes current target rules; implementation/acceptance evidence is in roadmap, and unverified work must not be treated as complete.

## Goals and architecture

Loom is a single-user personal Web application centered on checklists. Its main flow is maintaining items, saving reusable templates, creating independent checklists, executing, and archiving. The API is a formal product interface, and a future CLI reuses server business logic. Do not yet implement collaboration, offline synchronization, recurring generation, or a CLI client.

Use TypeScript, React/Vite, Fastify, and SQLite, with one service providing Web and `/api/v1` JSON API. Pin the package manager to pnpm 12.4.1 and use a frozen lockfile for deployment. SQLite is the primary storage; configuration JSON and historical snapshot JSON do not replace the database.

## Four concepts

| Concept | Responsibility |
| ----------------- | --------------------------------------------------------- |
| Item | Reusable shared identity, name, and notes; may belong to multiple flat Categories |
| Category | Reusable batch-selection set of items, without hierarchy, maintaining its own member order |
| Template | One editable current content document for creating checklists |
| Checklist | One independent execution with its own content, date, and checkmarks; can be archived |

An Item's catalog group itemGroup is a nullable name field used only for catalog filtering and sorting, at most one per Item, without adding a Group resource. Category is a many-to-many selection set; Section is an internal document layout section. All three are independent and optional, and matching names never imply automatic merging.

All resource, entry, and section IDs are UUIDs and never reused. A document has at most one entry per non-null Item ID; adding an existing Item preserves position, quantity, unit, notes, and checked state without accumulating quantity. Temporary entries have null itemId, are never merged by name, and can stand alone.

2026-10-16: Template/Checklist entry creation starts with a name and matching catalog Items. Selecting an Item explicitly links it; the default action adds only to the current document as a temporary entry, even for identical names. An alternative creates a catalog Item through the existing form and adds it to the selected section. Inline add rows confirm temporary entries directly on Enter, clear the name, and retain focus without opening a dialog. Catalog search and creation stay in the header add dialog. Creation retains original requests for safe retries; successful additions clear input for continued entry. Category batch addition remains available. No API or schema changes are required.

## Editing and saving

Template/Checklist share the Documents editor, supporting Item selection, single-item or whole-category addition from Category, temporary entries, notes, ordering, and sections. Quantities/units remain in the API and data but are currently neither shown nor edited on the Web.

Template and Checklist autosave, saving current content and incrementing structural version in a transaction. Wait for saving to finish before leaving within the app or creating a checklist from a template; failures retain the draft and notify the user. Checklist creation copies the server's saved current template. New checklist entries/sections receive new IDs and reset checkmarks; subsequent template edits or deletion do not change its content structure.

Shared saving behavior: one-off operations save immediately, text after a 500ms pause; show save status, errors, and retry of the original request. Structural writes do not overwrite checkmarks; existing entries remain checkable while saving, and only new entries not yet persisted cannot be checked. Check operations serialize per entry without validating structural version; across devices, the last submission wins.

Adding Items supports catalog-group filtering intersected with name/pinyin search, including templates, checklists, category members, and single-item selection within categories. Filter only candidates; whole-category addition is not truncated and group/member data is unchanged.

Template/checklist addition switches to the catalog-item creation form inside the same dialog, reusing catalog fields (name, notes, catalog group, categories) and defaulting the current catalog group. Creation uses existing Item API/requestId; success adds by Item ID to the selected section and supports continuous creation. Same-name candidates require explicit selection, never automatic merging. Items immediately enter the catalog; template entries autosave with the document. Discarding unsaved changes does not delete already-created catalog Items.

Renaming an Item shows its latest name in active Templates/Checklists; archives use the name snapshot from saving. Temporary entries use their own names. Checklist independence does not remove shared Item identity.

## Batch category addition

Whole-category addition selects only current direct members and appends missing Items in Category member order; existing entries retain position, fields, and checked state. Added entries are ordinary independent entries, with no category sources or automatically created same-name sections.

Subsequent Category changes do not automatically modify documents. Adding the whole category again fills only missing Items and removes no existing entries. Manually deleting an entry records no exclusion; explicitly adding the whole category again re-adds it. Do not provide Update to latest, category-source unlinking/linking, source counts, or exclusion restoration.

A Category can directly create a checklist, defaulting to the category name and offering an optional date. The server checks the category version and member set within a transaction and creates independent entries in saved member order; requestId guarantees safe retries.

## Sections and ordering

Template/Checklist sections have at most two levels, excluding the root container and Items. Sections serve only layout and have no Item identity, category source, or checked state. The server prohibits cycles, cross-document references, and subtree moves exceeding the depth limit.

Entries and sections under the same parent share one order: afterEntryId anchors a section to a sibling entry, null means first, and omitted/invalid anchors mean last. Dragging and arrow keys share ordering logic. Deleting nonempty sections promotes content to the parent while retaining relative order, without implicit deletion. Copying, archiving, restoring, and conversion to templates retain section structure and remap IDs.

Dropping on the upper half of an ordinary target row inserts before it; the lower half, including the midpoint, inserts after it. The lower half of a section title instead inserts first inside the section, without inferring direction from the drag origin. Gaps between entries in the same column count as before the next row; input areas and outer containers are not gap drop targets. Category member ordering uses the same before/after target parameters; movement changes only position, not identity or entry fields.

## Dates and history

Checklist has optional useDate (a real Gregorian YYYY-MM-DD date or null), without a timezone; Template has no date. Creation, copying, and creation-from-template confirmation dialogs offer a date, defaulting to the selected calendar day. The calendar includes active and archived records; Checklist navigation clears the date filter.

Archiving saves a complete schemaVersion:2 snapshot in a transaction and releases active entry/section references; archives are read-only. Restoring the original checklist preserves checkmarks and date; copying resets checkmarks and may reschedule the date; conversion to template omits checkmarks. Successful restoration deletes the original archive snapshot; copying retains the original record.

Missing historical Items default to temporary entries, retaining name, quantity/unit, notes, position, and checked state, without automatically creating Items or linking by name. The API still supports explicit linking or creation. If explicit linking creates duplicate identity with conflicting fields, require an explicit choice of values; never silently discard content. History itself is not rewritten.

Templates have no revision history, only current content; structural version serves only concurrency protection.

## Deletion

An Item can be deleted only with zero effective references: Category membership, current Template entries, and active Checklist entries count; archives do not. Check and delete in the same transaction; foreign keys prevent dangling references.

A Category can be deleted only when it has no members or legacy active-source references; new documents no longer create this source after startup conversion. Deleting category relationships does not delete Items or document entries.

Template deletion requires confirmation and preserves existing checklist content and source information. Active or archived Checklists may be permanently deleted after explicit confirmation, removing their entries, sections, and archive without affecting other resources; archiving does not replace deletion.

## Consistency and authentication

The server enforces all business constraints. Validate inputs at runtime and use transactions for writes. Structural writes submit version; stale versions return 409 instead of automatically overwriting with the latest version. Structural version protects editing conflicts and is unrelated to old revision history.

Creation, template saving, instantiation, copying, conversion, restoration, and checking use persistent requestId; digest, result, and business writes share a transaction. Same ID/content returns the original result; different content with the same ID conflicts; v1 does not automatically expire records. On explicit CSRF expiry, Web refreshes session and retries at most once with the frozen body/same requestId. Origin failures, version conflicts, and uncertain failures do not trigger automatic retry.

Default to secure sessions and revocable Bearer tokens. On first Web opening of an empty authenticated database, set up an account with a password of at least 10 characters and automatically log in; existing accounts continue login, and anonymous mode skips setup. Initialization/session writes share a transaction and cannot overwrite accounts; initialization writes validate Origin, CSRF, and rate limits, while CLI initialization remains optional. Startup reads data/loom.config.json with auth.enabled default true; explicit false allows anonymous network-reachable read/write without account initialization, while retaining CSRF and supplied-Origin checks. Invalid Bearer does not bypass authentication. Disabling/re-enabling authentication changes no database/history; configuration changes require restart.

## Storage and conversion boundaries

The schema remains version 1 in server/db.ts, recorded in PRAGMA user_version; new databases create tables and other versions refuse startup. Retain STRICT, CHECK, foreign-key indexes, and the Item unique index. Any schema/constraint/user_version change requires explicit advance notice to and consent from the user.

Tables: account, sessions, tokens, requests, items, categories, item_categories, documents, sections, entries. Category sources (groups, entry_sources, entries.direct) and template_revisions are removed without increasing user_version; old databases are incompatible, and development data is rebuilt directly.

For rollback, stop the service, save a separate copy of the upgraded database, then restore the pre-conversion backup and v0.0.1 code. Code rollback alone cannot restore category sources, and the backup excludes edits made after upgrading. Old tables and history query endpoints are not deleted in this round.

## Web and delivery

Retain AGENTS.md and UI Design's shared AppLayout/Page, Documents, Button/Modal/Select/SortableRow, lucide icons, bilingual interface, and existing colors/dimensions. Navigation keeps real href and leave protection; router manages paths, and unknown API routes return JSON 404. Template settings show no revision, entries no source counts, and checklist creation uses only saved content.

Local database and global configuration live in data/, excluded from Git and images. Docker Compose retains the database in the loom-data volume and mounts configuration from the host config/ directory read-only, explicitly selected by LOOM_CONFIG. Restart after changes; preserve both that directory and the database volume when moving. After stopping the service, copying all of data migrates to a project of the same version; custom paths need separate copying. Actually verify backup/restore and provide desktop, simulated phone, keyboard, failure-retry, and history-reading regressions. Record real-device, Docker, and resource measurements separately, without promises in advance.


2026-10-14: Template and Checklist share autosave. One-off operations submit immediately; text submits after a 500ms pause. Further edits during saving submit serially; failures retain the draft and original requestId for explicit retry. Remove the routine save button; finishing editing only switches to reading mode. Drain the save queue before leaving within the app or creating a checklist from a template, and report failures; browser close/refresh still protects unsaved content. This overrides the earlier explicit template save requirement, without adding revisions or database changes.

2026-10-14: Active Checklist and Template detail headers share icon actions in the order New section, Add entries, Done editing. Reading mode removes section/add actions and offers the pencil Edit mode action. Checklist retains its completion filter and default editing mode; Template retains Create checklist in reading mode. Archives remain read-only.

2026-10-14: Checklist details always open in reading mode, including newly created checklists. Enter structural editing explicitly with Edit mode; checking remains available while reading. The completion toggle uses a fixed CircleCheck icon for completed entries; highlighted/pressed means visible and muted/unpressed means hidden. Retain Hide completed / Show completed tooltips and accessible names. Newly created Templates retain editing mode.

2026-10-14: Active Checklists can also be archived directly from their collection row/card. This uses the existing archive API and preserves snapshot content, date, and checked states. Failures remain visible and retry the original request.

2026-10-14: Archived Checklist collection rows/cards offer Activate in the same action slot, restoring the original checklist through history-apply with its name, date, checked states, and sections preserved. Missing Items remain temporary entries by default. Both transitions retry with the original requestId and version.


2026-10-16: Inline entry input also offers live Item candidates through shared Select. Explicit candidate selection adds that Item by ID. Enter without selecting a candidate adds temporary content by default; an unchecked-by-default Save to item catalog checkbox instead creates an Item and adds it, entirely inline. Retain name, frozen requestId, and inline retry after failure; prevent leaving while catalog creation is unresolved. Same-name catalog creation shows a warning without implicit merging. Root and section inputs share this behavior; no database changes.


2026-10-16: With explicit user consent, Category collection organization adds one level of independent display sections and manual ordering. Categories remain peers; sections do not change memberships, document sections, or history. Store sections and category positions in SQLite with foreign keys and a singleton layout version. The category-layout API replaces the complete layout transactionally with version/requestId protection. Section deletion promotes categories to Ungrouped. Reuse SortableRow for category/section dragging and keyboard ordering; retain card/list views and shared Page actions. Add the tables directly to the version-1 schema and upgrade the current database once after a verified backup; do not retain startup migrations or compatibility code.


2026-10-16: Category collection Ungrouped is an ordered built-in heading rather than a fixed first group. category_layout.rootPosition records its slot among section headings; all group moves continue through SortableRow and the shared CategorySections move handler. Section deletion adjusts this slot. This extends the directly upgraded version-1 layout storage under the user's existing approval, with no retained migration code.

2026-10-16: Template collections use the same CollectionSections and collection-layout service as Categories, with flat organization sections, a sortable/collapsible Ungrouped section, drag feedback, keyboard ordering, and version/requestId saves. Template organization is independent of document content and internal sections. Version-1 template_sections/template_positions/template_layout tables store layout; document insert/delete triggers append new Templates ungrouped and invalidate stale layouts, including copy/conversion paths. Under existing direct-upgrade authorization, back up and update the current database without retained migration code. Checklist collections remain unchanged.
