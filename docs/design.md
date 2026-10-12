# Loom Design Doc

Status: original v1 implemented; flat categories, merging all duplicates, and three-level sections implemented on 2026-10-12; container acceptance awaits a runtime environment. Evidence is in roadmap. This document records confirmed rules and selected implementation defaults; synchronize root AGENTS.md and roadmap when changing them.

## 1. Goals and architecture

Loom manages reusable Items, centrally maintained Categories, Templates with revision history, and independently used and archived Checklists. Web is the primary entry point; the API is a complete interface, and a future CLI uses the same business logic.

v1 uses full-stack TypeScript: React/Vite frontend, Fastify backend, SQLite database. One service provides static Web and REST/JSON `/api/v1`, maintaining an OpenAPI contract. Start with personal single-user use; do not implement collaboration, offline synchronization, recurring generation, or a CLI client.

SQLite stores relationships and mutable data; JSON with `schemaVersion` stores immutable historical snapshots. Global configuration uses loom.config.json, with LOOM_CONFIG specifying a file path; deployment settings such as database path and listening address continue using existing environment variables. JSON configuration and import/export are not the primary database. SQLite foreign keys must be enabled and writes use transactions. The database file resides on a persistent volume.

All resource IDs (Item, Category, Template, Checklist, entry, category group) are UUIDs and never reused. Snapshot IDs have no foreign-key constraints; reusing IDs would incorrectly link history to new resources.

## 2. Core concepts and data structures

| Concept | Responsibility | Main relationships |
| --- | --- | --- |
| Item | Editable shared entry identity, such as egg and water | May belong to multiple Categories and be referenced by current entries |
| Category | Centrally managed categories, such as ingredients and experimental materials | Flat categories, many-to-many Item membership |
| Template | Editable template and immutable revision history | Current entries, internal sections up to three levels, category-source groups, saved revisions |
| Checklist | Independently editable and checkable checklist instance | Entries, category groups, optional template/revision source, archive snapshot |

egg belonging to Ingredients and Experimental materials does not mean there are two Items. Source describes how an entry was added to a Template/Checklist, rather than Item identity or ownership.

### Item Group (catalog filtering)

Each Item may have one nullable `itemGroup` name, used only for Item catalog tab filtering, independently of many-to-many Categories, document sections, and category-source groups. Use a name field rather than a separate Group resource or management page. Names are at most 200 characters, trimmed, with blank/null meaning Ungrouped; identical case-sensitive names share a tab, and the edit dialog suggests existing names while allowing new ones. A tab disappears automatically when it has no Items.

The Item page retains All, Ungrouped, and individual group tabs; search intersects with the group filter, which survives card/list switching. Creating within a group defaults to it; clearing the field returns to Ungrouped. Group changes no Category relationship, Item identity, deletion reference, template/checklist content, or historical snapshot. Items created by historical operations default to Ungrouped.

Migration 7 only adds a nullable field without changing existing content; old PUT callers omitting it retain the value, and POST omission defaults to null. Prefer restoring the pre-upgrade backup for rollback; old servers may read pre-update data only and should not write design changes beyond the new field.

### Relationship storage

- `items`: stable ID, name, notes, creation/update timestamps, resource version.
- `categories`: stable ID, name, resource version; parent ID and category hierarchies are unsupported.
- `item_categories`: unique membership relationships between Item and Category.
- `templates`, `template_entries`: mutable current templates and entries.
- Internal document sections (Section): UUID, owning document, name, nullable parentSectionId, sibling ordering, and nullable afterEntryId; entries specify their display position with nullable sectionId. Entries and child sections under the same parent share one interleaved order: a section immediately follows the sibling entry referenced by afterEntryId, null places it first, and an absent value places it after sibling entries (compatible with old data, requiring no migration). New entries therefore appear at the end of their parent. Sections and Category source groups are stored separately.
- `template_revisions`: template ID, increasing revision, save timestamp, complete JSON snapshot; immutable after writing.
- `checklists`, `checklist_entries`: active checklists, status, entries, and optional template/revision source.
- Category groups and entry-source relationships: store their Template/Checklist, nullable effective Category ID, original Category ID and name snapshot, expanded member set, exclusions, and many-to-many relationships between entries and category groups.
- Archive snapshot: complete Checklist JSON snapshot and archive timestamp, including names, entries, sources, and checked states at that time.

Each entry has an independent entry ID, nullable item ID, name snapshot, optional quantity/unit/notes, and ordering. Checklist entries also have checked state. `itemId = null` means a temporary entry, which must have a name. Each Template/Checklist document has only one entry per non-null Item ID, validated by the server and protected by a database unique constraint; temporary entries are outside that constraint.

Quantities, units, and notes belong to entries, not shared Item state. Category groups retain expansion-time information rather than treating current Category query results as checklist content. Entries can have a direct-add source and multiple category-group sources to avoid source loss after Merge.

### Names and snapshots

Current Template editing pages and active Checklists show latest names for surviving Items. Historical revisions and archives show saved snapshots. Template saving and Checklist archiving recapture names at that time. Renaming an Item creates no revision and rewrites no history.

Creating a checklist from an old revision preserves its quantities, units, notes, and ordering; surviving Items show their latest names without rename warnings. Temporary entries always show their own names.

## 3. Key behavior and lifecycle

### Editing, saving, and instantiation

Template/Checklist share an entry editor: select from all Items or Category, add a whole category, add temporary entries, delete, order, and edit quantities, units, and notes. Template saves explicitly: unsaved edits exist only in the client draft, with no server draft storage. Saving submits complete content and the expected version; in one transaction, the server replaces `template_entries` and category groups and generates an immutable revision. Therefore `template_entries` always equals the latest revision, and effective references come only from saved content. The client must warn about unsaved changes before leaving. Checklist autosaves and shows saving, success, failure, and retry states.

Creating a Checklist from a Template pins the source revision and copies content into independent entries, initially all unchecked. Subsequent template edits do not change existing checklists. A Checklist can also be created directly without a template.

### Template internal hierarchy (up to three levels)

A Template may have its own content sections (Section), such as Supplement and Cooking in the image. Sections contain Items or temporary entries and may have child sections. They belong to the current template, rather than global Categories or parent/child relationships between templates.

The shared Template/Checklist editor provides New section directly in its header, without first opening Add entries. The add-entry dialog supports searching and clicking an Item to add it directly, places single-item and whole-category addition side by side after Category selection, and offers a separate temporary-entry action. On failure, retain the dialog for retry; support Cancel and Escape.

All pages/dialogs use the shared Button with five variants: primary, ordinary, danger, light, and icon. Ordinary business actions retain borders/backgrounds; deletion and other dangerous operations explicitly use danger styling. Light styling serves navigation, calendars, and clickable choices. Pages own only layout; hover, disabled, and focus styles are centralized.

Three levels means section depth: level-one section → level-two section → level-three section. Items are section content and do not count toward section depth. The root container does not count; ungrouped entries may remain there. The server prohibits section cycles, cross-document parent/child relationships, and structures exceeding three levels, checking every descendant's final depth when moving a subtree. Sibling sections and entries within sections are ordered separately.

Display sections and category sources are independent: sections determine only display position, add no Item sources, and do not change flat Category constraints. Each entry has at most one display position; adding the same Item across sections still merges into the existing entry, preserving position/data and adding category sources without duplicate display. Users can explicitly move entries without changing sources, checkmarks, or effective references. Removing Category sources still cleans entries when sources reach zero, regardless of their section.

Section names, parent/child relationships, ordering, and entry positions enter the revision when Template is explicitly saved. Instantiated Checklists copy the structure and edit independently, retaining the three-level limit; copying, archiving, restoring, and conversion preserve structure without synchronizing with the original template. Sections are not checkable Items; Checklist checkmarks belong only to entries.

Deleting a nonempty section preserves content by default and promotes it to its parent (root sections promote to the root container), without implicitly deleting entries, sources, or child sections; retain relative order during promotion. Bulk content deletion requires a separate explicit operation. Old documents without sections leave all entries in the root container; old revisions and archives are not rewritten.

### Whole-category addition and updates

All Categories are flat. Whole-category addition obtains only that category's direct members at that time, creates a category group, and retains a source snapshot. Later Category changes do not automatically modify templates or checklists. A document has at most one effective category group per Category; adding again does not increase source counts.

All Template and Checklist additions automatically merge only by Item ID, including direct addition, picking from a category, and whole-category addition; provide no Merge / Keep both choice. Each Item appears only once, preserving existing quantity, unit, notes, ordering, and checked state without accumulating quantity. Temporary entries have no shared identity and are not merged by name.

### Source relationships and counts

Entries retain `direct` (direct source, 0 or 1) and unique category-group source relationships. Document source count = category-group source count + direct, computed from relationships on the server without a separate manual counter. Each entry/group relationship is unique; duplicate requests, repeated category addition, or direct addition of the same Item do not count twice. This count differs from the global Item deletion-reference count.

For example, Ingredients and Experimental materials both contain egg. Adding both whole categories leaves one egg with two sources. Removing Ingredients from the template reduces the count to one and retains egg; removing Experimental materials then reduces it to zero and removes the egg entry. If egg was also added directly, direct is 1 and it remains after both category sources are removed. Deleting a document's category group does not delete the Category, membership relationships, or global Item, and does not change other documents or history.

`Update to latest` first previews added/removed members and source changes, then lets the user apply them. New members merge automatically; removed members lose only the corresponding category source. Remove an entry when its last source disappears, explicitly listing these removals in the preview. Per-entry Merge/Keep both is no longer required. Users wishing to retain an entry can first establish a direct source. Category-group removal and cleanup of entries with zero sources occur in the same structural-save transaction; Template still saves explicitly and Checklist still autosaves.

Manually deleting an entry removes all its sources and records exclusions by category group + Item to prevent reintroduction on the next update. Update to latest previews excluded Items still belonging to the category, continuing to ignore them by default. Users may check them individually or choose Add all back; apply re-adds entries and clears corresponding exclusions. Unchecked exclusions remain selectable next time; exclusions for Items no longer in the category stay stored but hidden. Removing an entire category group creates no exclusions for other groups. Temporary entries create no member exclusions.

### Deletion and effective references

Item deletion requires zero effective references, counting Category membership, current Template entries, and active Checklist entries. Historical Template revisions and archives store only snapshots and do not block deletion. Compute references by query rather than an error-prone manual counter; foreign-key restrictions and transaction checks jointly protect deletion.

Archiving saves a complete snapshot, changes state, and deletes the checklist's `checklist_entries` and category-group rows in the same transaction to release effective references. Archives are read-only, with content read only from the snapshot.

Restoring an archive rebuilds entries/category groups from the snapshot and preserves original checkmarks. Missing Items use the per-entry choices below; missing Categories become static groups as described below. On success, the checklist becomes active and its archive snapshot is deleted. Restore and copy differ: copy when the archive must remain. Historical snapshot Item IDs identify sources; Items need not still exist and no deletion-blocking foreign keys are created.

A Category can be deleted only if it has no members or category-group references from current Templates/active Checklists. History retains category ID/name snapshots. Template deletion requires explicit confirmation and deletes its revision history; saved template names, revision identifiers, and instance content in Checklists remain, and the source association may become null without cascading deletion of checklists. A Checklist, active or archived, can be permanently deleted after explicit confirmation, deleting entries, category groups, and archive snapshots and releasing Item references; this changes neither the source template nor other checklists copied from it. Archive preserves records; delete removes unwanted checklists.

### Archiving, copying, conversion to templates, and missing Items

- Copy checklist: copy all entries, quantities, units, notes, ordering, and sources; reset every checkmark.
- Convert checklist to template: copy content to revision 1 of a new Template, without checkmarks.
- If restoring/copying/converting/instantiating history encounters a deleted Item, choose per entry to link an existing Item, create a new Item, or retain it as a temporary entry. Never silently discard it or force the user to supply an Item.

History operations prepare a preview first; final apply validates target Items, Categories, and resource versions within a transaction, producing no partial result on failure. Linking or creating Items does not rewrite original historical records.

If restoring, copying, converting, or instantiating history encounters a deleted Category, retain the category-group name, entries, sources, and exclusions by default and restore it as a static group: effective `categoryId` is null, the original ID is only a historical identifier, and Update to latest is disabled without blocking history operations. The user may link it to an existing Category; linking changes only the effective source, without immediately changing entries, then normal update preview handles member differences. Linking and subsequent updates are structural edits; the original historical snapshot remains unchanged.

## 4. API and consistency

The API uses `/api/v1`, REST/JSON, and OpenAPI. The frontend may manipulate data only through the API; business rules live on the server. Operate on entries by entry ID; the check endpoint updates only the target entry in the current Checklist.

| API capability | Contract direction |
| --- | --- |
| Item, Category | Query, create, edit, delete; maintain Category members; deletion failures identify specific references (Category, Template, Checklist names and IDs) |
| Template | Edit current content, explicitly save, list/detail revisions, instantiate from a specified revision |
| Checklist | Create, edit content, check, archive, restore, copy, convert to Template |
| Category operations | Whole-category addition, category-group removal, update preview and apply; server automatically merges and returns source changes and removal of entries with zero sources |
| History operations | Preview/apply missing Item/Category handling; link, create, or temporarily retain Items; Categories default to static retention and can be relinked |

Mutable resources carry `version`; writes submit the expected version. Stale versions return `409 Conflict`; clients retain unsaved content and let users reload/retry, without silent overwrites.

Checking is an exception: the endpoint submits target state `checked: true|false`, without validating or incrementing the Checklist's structural `version`; the last submission wins. Deleted entries return 404 and archived checklists return a state conflict. Structural edits do not write checked back; archiving reads the latest checked state in its transaction.

Checklist `version` protects entry addition/removal, ordering, quantities, units, notes, use dates, and category updates. The preview records the target Checklist/Template version and category's direct-member set; the apply transaction checks that version and compares the expanded set again. Either mismatch returns 409, requiring a refreshed preview and renewed confirmation. Template category operations first affect the client draft; its confirmed expanded set accompanies explicit save and receives the same checks in the save transaction. Name snapshots use current values at apply/save time.

Item creation, Checklist creation/instantiation/copying, conversion to Template, explicit Template save, history restoration, and check requests all carry a UUID `requestId`. The server records request scope, content digest, and result in SQLite in the same transaction as business writes. Retrying the same ID/content returns the original result without execution; reusing the ID with different content returns 409. Concurrent duplicates execute only once, remain identifiable after process restart, and committed records do not automatically expire in v1. Creating replacement Items and the target checklist/template in history operations is one request, not separate advance commits. After timeout, the client retries with the original ID/content; if a newer operation exists, confirm the old request result before submitting a new ID. This prevents duplicate creation after lost responses and prevents retries of already-successful old check requests from overwriting newer state from another device.

The server validates types, resource existence, flat-category constraints, document Item uniqueness, reference restrictions, and state transitions. Invalid input returns clear validation errors; missing resources return 404; conflicts include user-understandable reasons. Multistep saving, archiving, restoration, and source updates must be atomic. Specific JSON fields/routes are finalized in the M0 contract draft and generate verifiable OpenAPI during implementation.

In default authenticated mode, create the single account with an initialization command. Web uses secure sessions with CSRF protection for state changes. CLI/external callers use revocable tokens; never write tokens to logs or frontend build artifacts. Use HTTPS when deployed across networks.

## 5. Web interface and delivery

Interface specifications are centralized in [UI Design](ui-design.md), including final fonts, dimensions, colors, button variants, navigation semantics, component boundaries, and acceptance requirements. Measured Memos styles are references and cannot override subsequently confirmed Loom specifications.

Use [Memos](https://github.com/usememos/memos) as a reference for fonts, sizes, proportions, and information hierarchy, starting with a light theme. Retain warm-gray background, white cards, gray text, and green accents; proportion changes requested by the user do not authorize color changes. Use regular font weights, light borders, restrained radii/shadows, smaller headings/buttons, and no unnecessary explanatory text.

On 2026-10-12, computed styles were read from the user's already-open `memo.d0u9.cc`: navigation and secondary text use system sans-serif fonts at 13px/18px, weight 400; navigation rows are 28px high with 8px horizontal padding; body text is 16px/24px and Markdown level-one headings are 30px/36px; common buttons use 14px/20px text, 28px height, and 6px radius; most icons are 16px with roughly 1.8px strokes. Memos' blue-gray accent is only a comparison; Loom retains its established green theme. Loom navigation and icons adopt these compact parameters, button font size follows the final UI Design specification, page titles and business information retain their hierarchy, and touch controls are at least 44px.

The four primary navigation entries are real links rendered by shared NavigationLink with href and aria-current. Ordinary clicks use leave protection and client routing; modifier/middle clicks preserve native browser new-tab behavior. Link appearance is independent of action Button.

Button font size is managed separately: following user feedback that button text was too large, Loom's shared Button uses 13px/18px, with desktop height remaining 28px and touch targets at least 44px. Body, input, navigation fonts, and colors are unchanged.

### Unified page framework

AppLayout in `web/layout.tsx` alone owns left navigation, calendar, mobile navigation, and the right content container; Page alone owns the page title, view-switch icons, primary action, and content area. The primary action consistently accepts `primaryAction: {label,onClick}`; Page renders the same icon, button, and spacing and does not accept business-page action JSX with custom layout. Checklist, Template, Item, and Category list pages use the same framework, with title and creation button on one line and creation buttons aligned at the top and right edge. Edit details may hide the creation action. Pages must not each copy their own sidebar or title layout.

Right content is centered outside the sidebar, with a 960px maximum width and narrow-screen adaptation. The current baseline is 14px body text, 18px page titles, regular weight, 28px desktop buttons/inputs, and at least 44px phone targets. Visual acceptance compares equal-size windows; repeatedly shrinking fonts is not an optimization strategy.

Item/Category reuse catalog editing structure; Template/Checklist reuse the Documents editor, while business fields and save semantics remain independent. Template shows save and revision, Checklist shows checkmarks and use date. Category-group rows (source, link Category, Update to latest, remove category source) appear only in Template; Checklist hides them but still stores category groups and entry-source relationships, preserving them in archiving, restoration, copying, and conversion to templates.

### Calendar, forms, and accessibility

Desktop left navigation shares a calendar and Checklist, Template, Item, Category links; phones use bottom navigation and a collapsible calendar. Both calendars use the same Calendar component. Checklist navigation clears date filters and shows all checklists; clicking a day shows that day's checklists. View changes must respect unsaved-change protection.

All business inputs and note fields explicitly use `data-1p-ignore="true"` and `autoComplete="off"` to reduce 1Password suggestions on ordinary name fields and similar inputs. Login retains username/current-password for password managers. Ignore attributes follow [1Password official documentation](https://www.1password.dev/web/compatible-website-design); verify actual extension behavior separately, rather than substituting DOM-attribute tests for extension testing.

Selection and update previews share Modal. Phone dialogs fit the screen without requiring full-screen presentation. Native dialog focuses the first control on opening, calls close before DOM removal, and restores trigger focus. Support Escape, keyboard operation, and clear focus without relying on hover.

Version-control database migrations. Provide consistent backup/restore commands; do not copy database files during writes while ignoring WAL. Before delivery, verify persistence across container restarts, backup/restore, and complete user flows. Report container size, startup time, and resource usage from actual build measurements.

## 6. Details to refine during implementation

Follow the confirmed product semantics in this document. API wire schemas are generated from server runtime validation and response schemas; usage order is in api.md. SQLite uses the built-in Node driver; sessions are stored in SQLite, cookies use a Fastify plugin, and UI uses native controls and modal without a component library. Deployment uses a multi-stage Node 24 slim image, awaiting container-environment acceptance.

## Implementation decisions

- M2: Template/Checklist share the `documents` and `entries` relational tables, distinguished by kind. This reuses the same editing structure without changing effective-reference or history rules. Template revisions are stored separately and UPDATE is prohibited. SQLite uses the built-in Node 24 driver.

- M5: Request digests use sorted JSON keys, so field ordering does not affect safe retries. Rate-limit login and configure reverse-proxy trust explicitly. The UI waits for a response before allowing the next toggle of the same entry; failures can retry with the original requestId.

- Standardize package management on pnpm 12.4.1, pinned by packageManager; maintain only pnpm-lock.yaml. Only esbuild installation scripts are allowed; deployments use the frozen lockfile.

### Checklist use date and calendar

Checklist adds nullable `useDate`, a real Gregorian YYYY-MM-DD date without time or timezone. Templates have no scheduled date. SQLite migration 4 adds the column, defaulting old checklists to null; old API PUT requests that omit it retain the current value, while explicit null clears it. Date edits are protected by structural version and requestId. Archive snapshots retain the date and restoration preserves it; copying/instantiation can specify an execution date at confirmation, with blank meaning unscheduled. The desktop sidebar calendar marks dates with checklists, including archives, and filters on click; Checklist navigation clears the date filter and shows all checklists; phones offer a collapsible calendar. Creating a Checklist for the selected date defaults to that date. The column can remain when rolling back to the old application, without deleting data; the old version cannot edit dates during rollback.

### Category member details

Add members supports existing Item selection or direct creation. Creation sits below existing-member selection and expands/collapses the shared Item form within the current dialog, defaulting the current Category. Item creation/category relationships save in the same Item POST transaction. Cancel creates nothing; failure retains the form and retries with requestId.

Category cards open their own member list, deduplicated by Item ID. Details reuse Page/AppLayout, with no parent/child category links. Adding an existing Item creates a relationship with the current category; removal removes only the current category relationship, retaining other category relationships and the Item itself. Item editing reuses the catalog dialog and versioned Item API, without a separate data source or database migration.

### Collection views and opening records

All four resource collections and Category members share Collection/RecordCard, with card/list switching provided by Page. Whole cards and list rows open on click: Item opens the existing edit dialog, Category member details, and Template/Checklist the shared editor. A native focusable button covers the opening area; internal action buttons are independent and do not trigger opening. Lists follow the user's continuous white-panel layout with thin row separators. Add Category members from the title action area through Modal selection, without a permanently expanded form. Do not add checked state or completion progress to Category.

Card/list switching changes only Collection content layout; Page and the top action area retain the same width, position, background, and spacing. The white list panel wraps only the collection, not the title; do not alter the page shell with :has(.records-list).

### Single-line Category members and ordering

Member entries use one line for name, smaller notes, and right-side removal, without repeating the current category name, showing second-line category relationships, or checked state. Removal appears directly inline, not hidden in More. Retain header Add members and remove the back/member-count toolbar. Card edit/delete stay at the upper right. Page header background, position, and width retain existing rules rather than changing with the reference panel style.

Category order is stored as categoryId/itemId/position in migration 5's category_order. Order affects only that category's member details, not Item identity or existing templates/checklists. Direct members are deduplicated by ID, ordered members appear first, and new members append. Ignore invalid relationships; resource deletion cascades to ordering rows, which do not count as effective references. GET/PUT order manages this through the API; PUT validates the version and full direct-member set in a transaction, preserves existing order on failure, and retries with the original requestId. The migration adds a table that can remain when rolling back the application.

Documents handles Template/Checklist creation with the same Modal form for name input and validation, without browser prompt. Disable duplicate submission while processing; if a response is lost, freeze the original name/requestId and offer Retry creation to prevent duplicate resources.

### Template/Checklist detail layout

Detail titles use resource names; Page shares back, more, add, and necessary save actions. Main content focuses on entries/category groups rather than persistently expanded name fields, revision operations, or every source selector. Put name, date, revision, instantiation, archive/restore, copy, conversion, deletion, and reload in settings Modal; Item/Category/temporary-entry addition goes in add Modal, closing after selection before opening corresponding preview/conflict dialogs. Explicit Template saving, Checklist autosave, and failure-retry semantics remain; history/archives stay read-only.

### Item card information hierarchy

Item categories appear as muted green tags, showing at most two and a remaining count; full category names remain in title and the edit form. Card names use one line; notes use 12px/18px and reserve 36px for two lines even when absent. Long notes are truncated only visually; full content remains. Tags do not shift with note presence, and edit/delete stay at the upper right.

### Collection and resource form modules

web/collection.tsx provides Collection, RecordCard, and view context; Page manages view selection. All four resources and category members share collection presentation, without changing the page shell by view. web/resource-dialog.tsx provides ResourceDialog to unify title, name validation, errors, field area, and submit/cancel for creation of the four resources and catalog editing. Pages supply additional business fields and save callbacks; callers continue managing original requestId and failure retries, while Modal supplies dialog lifecycle.

### Web URLs and initial rendering

The four resource catalogs use /items, /categories, /templates, /checklists; details append /:id. Item details remain the shared edit dialog, Category details the member collection, and Template/Checklist details the shared editor. In-place Item editing within Category retains category context. Replace the root with /items in authenticated mode and /checklists in anonymous mode. Checklist date filters use ?date=YYYY-MM-DD; Checklist navigation removes date and detail. Retain the originally requested path after login.

web/router.ts centrally manages History API and popstate. Navigation and history forward/back respect leave protection; canceling departure restores the original URL and retains the draft. Production serves index.html for the above Web paths; API and missing static resources retain 404 responses, avoiding HTML masquerading as API output.

Initial HTML uses the existing warm-gray background. While waiting for session, render no login-style waiting page and provide an assistive-technology-only status. After session/catalog initialization, show original-path content; only /session 401 shows login, other failures show errors/retry, and cached identity never bypasses server verification. Refresh still loads the page/data; no offline or load-free behavior is promised.

- Category member ordering has no handle: drag cards/list rows directly. Mouse movement must exceed a threshold before dragging starts; on phones, long-press then drag, while normal swipes still scroll. Retain arrow-key ordering; dragging must not open records, and internal actions must not start dragging. Ordering remains persisted through the existing version and requestId API.

### Implementation boundaries for the 2026-10-12 design changes

Flat categories, automatic merging of all duplicates, zero-source cleanup, and three-level sections are implemented by migration 6 and the shared editor. Migration must retain all Category IDs/direct memberships, historical revisions, and archive snapshots. Recursive display of old parent categories becomes direct-members-only; do not arbitrarily copy memberships. Old document duplicate Items with differing quantities, units, notes, or checkmarks require preview and value selection before merging, without silent loss. Original history remains queryable; copying, restoring, instantiating, or converting must normalize to new rules and resolve conflicts before writing. API, database, shared editor, and tests are synchronized; evidence is in roadmap.

Migration 6 saves old parentId values to legacy_category_parents and removes the hierarchy in a transaction, preserving original IDs and members. Section arrays are stored as JSON in documents.sections and entry positions in entries.sectionId; the server validates document ownership, depth, and cycles on writes. New history uses schemaVersion 2 and can read version 1. Database triggers prohibit new hierarchies or duplicate document Items; existing duplicate rows remain until the user resolves conflicts and saves, avoiding value loss during migration. Rollback restores the old schema from a consistent pre-upgrade backup; old code must not write directly to a migration 6 database. Old-data migration, history preservation, and backup rollback all have automated verification.

### Global configuration and optional authentication

At startup, read auth.enabled from loom.config.json, defaulting to true. Explicit false permits anonymous Web and API use, including LAN devices, without account initialization. /session returns csrf and authEnabled; the frontend waits for it before deciding what to render. The anonymous root opens /checklists, authenticated mode still defaults to /items, and direct paths remain. Anonymous mode hides logout; login endpoints return 409 without fabricating sessions or creating accounts.

Anonymous non-Bearer writes must use process-level csrf returned by /session and validate Origin when supplied. Valid tokens still work; invalid tokens cannot bypass validation. Default mode retains secure sessions and revocable tokens. Re-enabling authentication changes neither accounts, database content, nor history; if no account exists in anonymous mode, initialize one before enabling authentication. Configuration changes require restart; a missing default file retains authentication, while a missing explicit path or invalid configuration fails startup. Disabling authentication means anyone who can reach the service over the network can read and modify data.

Item Group tags accept direct Item drops: cards/lists use the shared drag component, with mouse drag or phone long-press drag to a target group replacing the unique itemGroup. Ungrouped clears it; All is only a filter. Preserve other fields and Category relationships, using the existing Item PUT and version; refresh on success, show an error and retain original data on failure. Group tags wrap and drop targets highlight; keyboard users change Group through the shared edit dialog.

### Shared Item presentation

Active Item presentation in Item, Category, Template, and Checklist consistently reuses ItemSummary (name, Item notes, Group, categories); Category omits the current category tag. Document-entry notes and Item notes are independent data: the former stay editable and the latter are read-only. Historical content retains existing snapshot semantics without adding current Item metadata.
