# Loom Design Doc

Status: v1 implemented; container acceptance awaits a runtime environment. Evidence is in roadmap. This document records confirmed rules and selected implementation defaults; synchronize root AGENTS.md and roadmap when changing them.

## 1. Goals and architecture

Loom manages reusable Items, centrally maintained Categories, Templates with revision history, and independently used and archived Checklists. Web is the primary entry point; the API is a complete interface, and a future CLI uses the same business logic.

v1 uses full-stack TypeScript: React/Vite frontend, Fastify backend, SQLite database. One service provides static Web and REST/JSON `/api/v1`, maintaining an OpenAPI contract. Start with personal single-user use; do not implement collaboration, offline synchronization, recurring generation, or a CLI client.

SQLite stores relationships and mutable data; JSON with `schemaVersion` stores immutable historical snapshots. Configuration uses environment variables; JSON is for import/export, not the primary database. SQLite foreign keys must be enabled and writes use transactions. The database file resides on a persistent volume.

All resource IDs (Item, Category, Template, Checklist, entry, category group) are UUIDs and never reused. Snapshot IDs have no foreign-key constraints; reusing IDs would incorrectly link history to new resources.

## 2. Core concepts and data structures

| Concept | Responsibility | Main relationships |
| --- | --- | --- |
| Item | Editable shared entry identity, such as egg and water | May belong to multiple Categories and be referenced by current entries |
| Category | Centrally managed categories, such as ingredients and experimental materials | Parent/child hierarchy, many-to-many Item membership |
| Template | Editable template and immutable revision history | Current entries, category groups, saved revisions |
| Checklist | Independently editable and checkable checklist instance | Entries, category groups, optional template/revision source, archive snapshot |

egg belonging to Ingredients and Experimental materials does not mean there are two Items. Source describes how an entry was added to a Template/Checklist, rather than Item identity or ownership.

### Relationship storage

- `items`: stable ID, name, notes, creation/update timestamps, resource version.
- `categories`: stable ID, name, optional parent ID, resource version; category cycles are prohibited.
- `item_categories`: unique membership relationships between Item and Category.
- `templates`, `template_entries`: mutable current templates and entries.
- `template_revisions`: template ID, increasing revision, save timestamp, complete JSON snapshot; immutable after writing.
- `checklists`, `checklist_entries`: active checklists, status, entries, and optional template/revision source.
- Category groups and entry-source relationships: store their Template/Checklist, nullable effective Category ID, original Category ID and name snapshot, expanded member set, exclusions, and many-to-many relationships between entries and category groups.
- Archive snapshot: complete Checklist JSON snapshot and archive timestamp, including names, entries, sources, and checked states at that time.

Each entry has an independent entry ID, nullable item ID, name snapshot, optional quantity/unit/notes, and ordering. Checklist entries also have checked state. `itemId = null` means a temporary entry, which must have a name. The same Item may have multiple entry IDs, so checklist item IDs have no uniqueness constraint.

Quantities, units, and notes belong to entries, not shared Item state. Category groups retain expansion-time information rather than treating current Category query results as checklist content. Entries can have a direct-add source and multiple category-group sources to avoid source loss after Merge.

### Names and snapshots

Current Template editing pages and active Checklists show latest names for surviving Items. Historical revisions and archives show saved snapshots. Template saving and Checklist archiving recapture names at that time. Renaming an Item creates no revision and rewrites no history.

Creating a checklist from an old revision preserves its quantities, units, notes, and ordering; surviving Items show their latest names without rename warnings. Temporary entries always show their own names.

## 3. Key behavior and lifecycle

### Editing, saving, and instantiation

Template/Checklist share an entry editor: select from all Items or Category, add a whole category, add temporary entries, delete, order, and edit quantities, units, and notes. Template saves explicitly: unsaved edits exist only in the client draft, with no server draft storage. Saving submits complete content and the expected version; in one transaction, the server replaces `template_entries` and category groups and generates an immutable revision. Therefore `template_entries` always equals the latest revision, and effective references come only from saved content. The client must warn about unsaved changes before leaving. Checklist autosaves and shows saving, success, failure, and retry states.

Creating a Checklist from a Template pins the source revision and copies content into independent entries, initially all unchecked. Subsequent template edits do not change existing checklists. A Checklist can also be created directly without a template.

### Whole-category addition and updates

Whole-category addition includes child categories, obtains the member set at that time, creates a category group, and retains Category sources. Subsequent Category changes do not automatically modify templates or checklists.

`Update to latest` obtains current category members and compares them with the previous expansion snapshot, previewing additions, removed members, and duplicate Items. Apply selected changes after user confirmation. Existing quantities, units, notes, ordering, and checked states are not overwritten.

When members leave a category, remove the corresponding source first; entries with other category or direct sources remain. Entries with no other source become removal candidates for the user to decide, never silent deletion. Retained entries gain a direct-retention source. Exclusions are recorded by category-group ID + Item ID, meaning that group no longer introduces the Item. On manual entry deletion, check every source group: record an exclusion only when no other entry for the same Item remains in that group. Deleting one Keep both entry must not exclude the other retained entry. Exclusions do not automatically return in later updates; users may clear them explicitly, and explicitly adding that Item to the group clears the corresponding exclusion. Temporary entries have no Item ID and create no member exclusions.

Category membership is computed recursively: deduplicate members of the Category itself and all descendants to form the member set. Adding, moving, or deleting child categories appears in the next Update to latest preview.

Duplicate Items in previews offer batch defaults (Merge all or Keep both for all), with per-entry changes before applying.

### Duplicate entries

When a new entry shares an item ID with an existing entry, offer Merge / Keep both. Merge preserves the selected existing entry's data/checkmarks and adds sources without accumulating quantity. Keep both creates independent entries, separately editable and checkable. If several entries already share the Item, explicitly choose the Merge target. Temporary entries are not automatically merged by name.

### Deletion and effective references

Item deletion requires zero effective references, counting Category membership, current Template entries, and active Checklist entries. Historical Template revisions and archives store only snapshots and do not block deletion. Compute references by query rather than an error-prone manual counter; foreign-key restrictions and transaction checks jointly protect deletion.

Archiving saves a complete snapshot, changes state, and deletes the checklist's `checklist_entries` and category-group rows in the same transaction to release effective references. Archives are read-only, with content read only from the snapshot.

Restoring an archive rebuilds entries/category groups from the snapshot and preserves original checkmarks. Missing Items use the per-entry choices below; missing Categories become static groups as described below. On success, the checklist becomes active and its archive snapshot is deleted. Restore and copy differ: copy when the archive must remain. Historical snapshot Item IDs identify sources; Items need not still exist and no deletion-blocking foreign keys are created.

A Category can be deleted only if it has no child categories, members, or category-group references from current Templates/active Checklists. History retains category ID/name snapshots. Template deletion requires explicit confirmation and deletes its revision history; saved template names, revision identifiers, and instance content in Checklists remain, and the source association may become null without cascading deletion of checklists.

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
| Category operations | Whole-category addition, update preview and apply; submit explicit Merge/Keep both, target entry, and removal choices |
| History operations | Preview/apply missing Item/Category handling; link, create, or temporarily retain Items; Categories default to static retention and can be relinked |

Mutable resources carry `version`; writes submit the expected version. Stale versions return `409 Conflict`; clients retain unsaved content and let users reload/retry, without silent overwrites.

Checking is an exception: the endpoint submits target state `checked: true|false`, without validating or incrementing the Checklist's structural `version`; the last submission wins. Deleted entries return 404 and archived checklists return a state conflict. Structural edits do not write checked back; archiving reads the latest checked state in its transaction.

Checklist `version` protects entry addition/removal, ordering, quantities, units, notes, use dates, and category updates. The preview records the target Checklist/Template version and recursively expanded category set; the apply transaction checks that version and compares the expanded set again. Either mismatch returns 409, requiring a refreshed preview and renewed confirmation. Template category operations first affect the client draft; its confirmed expanded set accompanies explicit save and receives the same checks in the save transaction. Name snapshots use current values at apply/save time.

Item creation, Checklist creation/instantiation/copying, conversion to Template, explicit Template save, history restoration, and check requests all carry a UUID `requestId`. The server records request scope, content digest, and result in SQLite in the same transaction as business writes. Retrying the same ID/content returns the original result without execution; reusing the ID with different content returns 409. Concurrent duplicates execute only once, remain identifiable after process restart, and committed records do not automatically expire in v1. Creating replacement Items and the target checklist/template in history operations is one request, not separate advance commits. After timeout, the client retries with the original ID/content; if a newer operation exists, confirm the old request result before submitting a new ID. This prevents duplicate creation after lost responses and prevents retries of already-successful old check requests from overwriting newer state from another device.

The server validates types, resource existence, category cycles, reference restrictions, and state transitions. Invalid input returns clear validation errors; missing resources return 404; conflicts include user-understandable reasons. Multistep saving, archiving, restoration, and source updates must be atomic. Specific JSON fields/routes are finalized in the M0 contract draft and generate verifiable OpenAPI during implementation.

Create the single account with an initialization command. Web uses secure sessions with CSRF protection for state changes. CLI/external callers use revocable tokens; never write tokens to logs or frontend build artifacts. Use HTTPS when deployed across networks.

## 5. Web interface and delivery

Use [Memos](https://github.com/usememos/memos) as a reference for fonts, sizes, proportions, and information hierarchy, starting with a light theme. Retain warm-gray background, white cards, gray text, and green accents; proportion changes requested by the user do not authorize color changes. Use regular font weights, light borders, restrained radii/shadows, smaller headings/buttons, and no unnecessary explanatory text.

### Unified page framework

AppLayout in `web/layout.tsx` alone owns left navigation, calendar, mobile navigation, and the right content container; Page alone owns the page title, creation action, and content area. Checklist, Template, Item, and Category list pages use the same framework, with title and creation button on one line and creation buttons aligned at the top and right edge. Edit details may hide the creation action. Pages must not each copy their own sidebar or title layout.

Right content is centered outside the sidebar, with a 960px maximum width and narrow-screen adaptation. The current baseline is 14px body text, 20px page titles, regular weight, roughly 34px desktop buttons/inputs, and at least roughly 40px phone targets. Visual acceptance compares equal-size windows; repeatedly shrinking fonts is not an optimization strategy.

Item/Category reuse catalog editing structure; Template/Checklist reuse the Documents editor, while business fields and save semantics remain independent. Template shows save and revision, Checklist shows checkmarks and use date, and category groups show sources and Update to latest.

### Calendar, forms, and accessibility

Desktop left navigation shares a calendar and Checklist, Template, Item, Category links; phones use bottom navigation and a collapsible calendar. Both calendars use the same Calendar component. Checklist navigation clears date filters and shows all checklists; clicking a day shows that day's checklists. View changes must respect unsaved-change protection.

All business inputs and note fields explicitly use `data-1p-ignore="true"` and `autoComplete="off"` to reduce 1Password suggestions on ordinary name fields and similar inputs. Login retains username/current-password for password managers. Ignore attributes follow [1Password official documentation](https://www.1password.dev/web/compatible-website-design); verify actual extension behavior separately, rather than substituting DOM-attribute tests for extension testing.

Selection, Merge/Keep both, and update previews share Modal. Phone dialogs fit the screen without requiring full-screen presentation. Native dialog focuses the first control on opening, calls close before DOM removal, and restores trigger focus. Support Escape, keyboard operation, and clear focus without relying on hover.

Version-control database migrations. Provide consistent backup/restore commands; do not copy database files during writes while ignoring WAL. Before delivery, verify persistence across container restarts, backup/restore, and complete user flows. Report container size, startup time, and resource usage from actual build measurements.

## 6. Details to refine during implementation

Follow the confirmed product semantics in this document. API wire schemas are generated from server runtime validation and response schemas; usage order is in api.md. SQLite uses the built-in Node driver; sessions are stored in SQLite, cookies use a Fastify plugin, and UI uses native controls and modal without a component library. Deployment uses a multi-stage Node 24 slim image, awaiting container-environment acceptance.

## Implementation decisions

- M2: Template/Checklist share the `documents` and `entries` relational tables, distinguished by kind. This reuses the same editing structure without changing effective-reference or history rules. Template revisions are stored separately and UPDATE is prohibited. SQLite uses the built-in Node 24 driver.

- M5: Request digests use sorted JSON keys, so field ordering does not affect safe retries. Rate-limit login and configure reverse-proxy trust explicitly. The UI waits for a response before allowing the next toggle of the same entry; failures can retry with the original requestId.

- Standardize package management on pnpm 12.4.1, pinned by packageManager; maintain only pnpm-lock.yaml. Only esbuild installation scripts are allowed; deployments use the frozen lockfile.

### Checklist use date and calendar

Checklist adds nullable `useDate`, a real Gregorian YYYY-MM-DD date without time or timezone. Templates have no scheduled date. SQLite migration 4 adds the column, defaulting old checklists to null; old API PUT requests that omit it retain the current value, while explicit null clears it. Date edits are protected by structural version and requestId. Archive snapshots retain the date and restoration preserves it; copying/instantiation defaults to unscheduled. The desktop sidebar calendar marks dates with checklists, including archives, and filters on click; Checklist navigation clears the date filter and shows all checklists; phones offer a collapsible calendar. Creating a Checklist for the selected date defaults to that date. The column can remain when rolling back to the old application, without deleting data; the old version cannot edit dates during rollback.
