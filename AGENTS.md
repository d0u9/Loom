# Loom Development Constraints

Loom is a personal Web application centered on Checklist. The API is a formal product interface, and the future CLI will use the same API. Before implementation, read the [design document](docs/design.md) and [roadmap and milestones](docs/roadmap.md). Documents describe the target design, not completed functionality.

## Technology and Scope

- Use TypeScript, Fastify, React/Vite, and SQLite; one service provides Web static assets and the `/api/v1` API.
- v1 targets a single user and must work on desktop and mobile. Start with a light theme, visually referencing the simple Memos layout.
- SQLite is the primary store; historical snapshots may use versioned JSON inside the database. JSON/YAML files are not the primary database.
- The server must enforce all business constraints; Web and the future CLI must not bypass them. Validate input at runtime, and keep database migrations traceable.
- Keep implementation simple, prioritizing existing code and dependencies. Do not prematurely implement collaboration, offline synchronization, scheduled generation, or a CLI client.

## Product Invariants

- Core concepts are Item, Category, Template, and Checklist. Item is a shared identity. Category is centrally managed and may have hierarchy; an Item can belong to multiple Categories.
- Template and Checklist share entry editing behavior: Select from the Item list or Category, add entire categories, use temporary entries, quantities, units, notes, and sorting.
- Temporary entries have no Item reference, can be used independently, and can be converted into Items. Do not automatically merge solely by matching names.
- Checklist is an independent instance of a Template and can also be copied from a Checklist. Checked states belong only to the current Checklist and are not written to Item, Category, or Template.
- Every explicit Template save creates an immutable revision. Renaming an Item does not create a Template revision.
- Current Template editing pages and active Checklists show the latest Item names; historical revisions and archives show name snapshots at save time. Instantiating from old revisions uses the latest names of surviving Items, without name-change warnings.
- Adding an entire category saves the member snapshot and Category source at that time, without ongoing automatic synchronization. `Update to latest` must preview changes before the user applies them.
- Category updates retain existing entry quantity, unit, notes, order, and checked state; users must choose removal candidates. Losing one source cannot delete an entry that still has other sources.
- Identify duplicate Items by ID and offer Merge / Keep both. Merge retains existing entry data and checked state without automatically summing quantity, and preserves multiple sources. Keep both creates independent entries.
- Items are editable and can be deleted only when the effective reference count is zero. Category memberships, current Template entries, and active Checklist entries count as references; historical revisions and archive snapshots do not. The deletion check and deletion must share a transaction, with database constraints preventing dangling references.
- Snapshots must remain queryable after historical Items are deleted. On restore, copy, conversion to template, or instantiation from an old revision, offer linking missing Items to existing Items, creating new Items, or retaining them as temporary entries, without requiring identities to be filled in.
- An archived Checklist is read-only and can be queried, restored, copied, or converted to a Template. Copying resets checked states; conversion to a template omits checked states. Restoring the original checklist retains its checked states.
- Require explicit confirmation before deleting a Template, and delete its revisions. Source information and snapshots of existing Checklists remain queryable.

## Implementation Defaults

The following defaults were chosen to implement the design. To adjust them, update the design documents first, then change the implementation.

- Adding an entire category includes child categories; category trees prohibit cycles.
- Record exclusions by category group + Item. After deleting an entry, establish an exclusion only if that group has no other entry for the same Item, avoiding exclusion of remaining Keep both entries. Updates do not automatically re-add exclusions; explicitly restoring or adding back to that group clears the exclusion.
- Mutable resources use version numbers for optimistic concurrency control. Stale edits return conflicts rather than silently overwriting. Checking does not validate structural version, and the last submission wins; structural editing does not write back checked.
- Resource IDs use UUIDs and are never reused.
- Template saves explicitly, with drafts only on the client; saving replaces current content and creates a revision in one transaction. Checklist autosaves, showing save status and failure retries.
- Archiving deletes active entry rows to release references. Restoration rebuilds from the snapshot and deletes the archive snapshot.
- Calculate category membership by recursive expansion. In preview-apply or Template-save transactions, compare the expanded collection and target version. Duplicates support bulk Merge/Keep both.
- Missing Categories in historical operations restore by default as static groups preserving names and content, with updates disabled. They may be linked to existing Categories and then updated through normal preview; history remains unchanged.
- Creation, instantiation, copying, conversion to template, template saving, historical restore, and checking use persistent requestId deduplication. Request results and business writes share a transaction; retries return the original result, the same ID with different content returns a conflict, and v1 does not automatically expire records.
- Initialize the single account through the initialization command. Web uses secure sessions; external API access uses revocable tokens.
- Delete a Category only when it has no child categories, members, or active category-group references; historical snapshots do not block deletion.

## Verification and Delivery

- Provide meaningful tests for nontrivial business logic such as deletion constraints, revision immutability, category updates/merges, and archive restore.
- Run the relevant checks after changes; do not pad tests by repeating implementation details. At minimum verify major desktop/mobile operations and keyboard accessibility.
- Update API documentation, migrations, and related callers. Errors must not cause loss of entries, checked states, or historical data.
- Put the database in a persistent volume and actually verify backup and restore. Report measured container size and resource usage rather than promising them in advance.
- Record each milestone status and acceptance evidence in the roadmap. Clearly mark anything incomplete or unverified.
