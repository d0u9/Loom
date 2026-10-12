# API Usage Contract

Status: endpoints support flat Categories, Template/Checklist automatic merging, zero-source removal, and three section levels; runtime OpenAPI reflects actual request and response schemas.

The service prefix is `/api/v1`, with JSON requests and responses. Authenticated `GET /openapi.json` provides complete OpenAPI generated from runtime validation rules; the following records operation sequences and rules that schemas alone cannot express.

## Authentication and Catalog

Successful login responses include `csrf` and `username`; with authentication enabled, `/session` returns `csrf`, `authEnabled:true`, and the actual account `username` for the sidebar account area. Without login requirements, `/session` returns `authEnabled:false` and anonymous CSRF, without a username.


`POST /login {username,password}` sets an HttpOnly session and returns csrf; `GET /session` returns the current csrf and authEnabled; responses must not be cached. Session write requests submit `x-csrf-token`; `POST /logout {}` logs out. `POST /tokens {name}` creates a token shown only once; `GET /tokens` lists token IDs/names; `DELETE /tokens/:id` revokes a token. CLI uses `Authorization: Bearer TOKEN` without session CSRF.

`GET /items` and `/categories` return the catalog. Item POST submits `{name,note?,categoryIds,requestId}`; PUT `/:id` submits the same fields plus version. Category POST submits `{name}`; PUT adds version. parentId:null is still accepted; nonempty parentId returns 400, and responses omit parentId. Both DELETE `/:id` requests submit `{version}`; reference conflicts return the referring resource names, IDs, and kind. `GET /categories/:id/members` returns direct member `itemIds`.

## Template / Checklist

Content may include sections, with section fields `{id,name,parentSectionId,afterEntryId?}`. Entries and child sections under the same parent share an order: entries follow array order, and a section immediately follows the sibling entry referenced by afterEntryId; null places it before all sibling entries, while an absent value (legacy data) or a reference that no longer points to a sibling entry places it after the sibling entries. Multiple sections at the same position follow array order. New entries append to the array and therefore appear last under that parent. When duplicate entries merge, sections referencing a merged entry instead reference the preceding retained sibling entry. Copy/instantiate/restore remap afterEntryId; Entry.sectionId:null/omitted means the root position. At most three section levels, excluding the root and Item.

Shared `/documents`: GET lists summaries, POST `{kind,name,entries,groups,requestId}` creates, GET `/:id` retrieves details, and PUT `/:id` submits `{name,entries,groups,version,requestId}` to replace the structure. kind is template or checklist; Template PUT generates a revision each time.

Entry fields: `id,itemId,sectionId?,name,quantity,unit,note,direct,groupIds`; quantity is text and supports expressions such as `1/2`; unit/note may be empty. Temporary entries have itemId null; the server resolves Item names. Each new entry uses a new UUID. A separate endpoint manages checked; structural saves ignore its old value. Copy/instantiate/restore generate new entry/group IDs; normal structural edits retain existing IDs.

`PUT /checklists/:id/entries/:entryId/checked {checked,requestId}` sets the target state. The client waits for the previous request to complete before submitting the next; the UI temporarily disables checking that entry while saving, and failures can retry the original request. Checking does not change the structural version; the last submission across devices wins.

`GET /templates/:id/revisions` lists revisions; GET `/:revision` returns a historical snapshot. Creating an independent checklist from a template uses `POST /documents/:id/history-apply`, with action instantiate (see History Operations below). `DELETE /templates/:id {version,confirm:true}` deletes the template and revisions, retaining existing instance content and source snapshots. `DELETE /checklists/:id {version,confirm:true}` permanently deletes a checklist (active or archived), including entries, category groups, and archive snapshots; non-Checklist resources return 400, and stale versions return 409.

## Category Preview and Apply

`POST /documents/:id/category-preview {entries,groups,version,categoryId,groupId?}`: no groupId means a new group; an existing groupId means an update. Returns group, expected as the complete member set, excluded (excluded Items that are still members), added, removed, duplicates.

`POST /documents/:id/category-compose` submits the above content plus expected, `choices`, `removeIds`, and optional `restore` (Item IDs to add back; they must be excluded in that group and still be members, otherwise 400; the server clears their exclusions and adds the entries back). All duplicate Items merge automatically, retaining existing values and positions. Legacy callers' merge choices/removeIds fields remain compatible but no longer control merging or zero-source removal; keep is rejected. Returns new entries/groups/sections without writing yet; save through documents PUT, whose transaction checks the member set again. Template still maintains a client-side draft; Checklist autosaves.

Group fields: `id,categoryId,originalCategoryId,name,members,excluded,expected?`. expected is the confirmed expanded set and is not persisted as an ongoing synchronization constraint after saving. Exclusions are per group + Item and are created when an entry is manually deleted. Static groups have categoryId null and retain the original identifier and content; after changing categoryId, the user saves normally and then requests an update preview.

## History Operations

`POST /checklists/:id/archive {version,requestId}` atomically saves a snapshot and releases active relationships.

`POST /documents/:id/history-preview {action,version,revision?}` returns missing items/categories, names, and duplicates (each group contains itemId and candidate entries). action is restore, copy, template, or instantiate; instantiate requires revision.

`POST /documents/:id/history-apply {action,version,revision?,name,requestId,resolutions,mergeTargets?,useDate?}` applies atomically. resolutions specifies `{mode:'temporary'}`, `{mode:'existing',itemId}`, or `{mode:'new',name}` by missing Item ID. mergeTargets specifies the entry ID whose data to retain by duplicate Item ID, taking the union of sources; unresolved conflicts between different field values return 409 with candidate entries and roll back the entire operation. Missing Categories automatically become static groups. restore retains checked and replaces the archive; copy/instantiate reset checked; template creates revision 1.

## Conflicts and Safe Retries

Resource writes include the expected version; stale versions return 409. 404 means the resource does not exist, 400 invalid input, 401/403 authentication/CSRF failure, and 429 excessive login attempts. Error body: `{message,details?}`. Do not automatically replace the version with the latest after 409 and resend: this would overwrite edits from other devices.

Writes requiring deduplication include a UUID requestId. After a timeout, retry with the same ID and identical content; the server persists results, so restarting does not repeat execution. The same ID with different content returns 409. Confirm the old request result before sending modified content with a new ID. Previously committed results may represent an older resource state; GET details again after retrying if needed.

## Use Date

POST `/documents` and PUT `/documents/:id` may include `useDate: "2026-10-11" | null`. Only Checklist permits a nonempty date; invalid Gregorian dates return 400. GET list/detail responses return useDate; lists also return `total`/`done` (entry and checked counts, taken from snapshots for archives). Omission on PUT preserves the previous value; null clears it. Writes follow version and idempotency constraints. Archive/restore retain the date; copy and template instantiation may specify history-apply `useDate`, defaulting to null when omitted.

## Category Member Order

GET `/categories/:id/order` returns `{itemIds,version}`, containing the display order of all current direct members. PUT to the same path submits `{itemIds,version,requestId}`; itemIds must be unique and equal the current direct member set. Version or set changes return 409. Success increments the Category version and uses persistent request deduplication. This affects only that category's display, without changing category relationships.

## Merging, Sources, and Sections

Nonempty Item IDs are unique within a document; the same Category has at most one active source group, and repeated additions do not increase the source count. GET documents returns entry.sourceCount = groupIds.length + Number(direct). A category group can be removed by deleting it through structural PUT; the server releases its sources and removes zero-source entries, without deleting global Item/Category records. Category preview/compose may include sections to retain the section structure; the preview shows source changes for removed entries, and saving is still required after applying. Temporary entries do not merge by name.

Sections do not participate in source counts or checking; moving an entry changes only sectionId. When deleting a nonempty section, the client promotes child sections and entries to the parent, then submits the complete structure. The server validates absence of cycles, ownership by the same document, at most three levels, and valid references; invalid structures roll back the entire operation. New revisions/archives use schemaVersion:2; legacy schemaVersion:1 remains readable, and absent sections means the root position. Copy/restore/instantiate/convert to template assign new section IDs and remap parent-child relationships and entry positions.

## Disabling Authentication through Configuration

loom.config.json with auth.enabled:false, followed by a restart, makes anonymous GET /session return `{csrf,authEnabled:false}`; reading catalog/documents requires no login. Anonymous writes still submit x-csrf-token, and any supplied Origin must match the service; Bearer tokens are still validated. POST /login returns 409 in this mode; OpenAPI global security is []. The default auth.enabled:true continues to require authentication and does not automatically create accounts. Anonymous csrf changes after process restart; clients must fetch /session again before writing.

During structural saves, source IDs must belong to submitted category groups or category groups in that document before saving; unknown sources or sources from other documents return 400 and roll back the entire save. Only sources of explicitly removed original category groups are released. When Web receives an explicit Invalid CSRF token / 403, it fetches session again and retries at most once with the original request content and requestId; other errors are not automatically retried.

## Item Group

Item GET/POST/PUT responses add `itemGroup: string | null`. POST/PUT may submit itemGroup (at most 200 characters); the server trims surrounding whitespace, and blank/null means ungrouped. Omission defaults to null on POST and preserves the previous group on PUT, still following the version/requestId contract. Group is independent of categoryIds and does not affect document sources/history or reference counts.

GET `/items` returns all items; `?itemGroup=Food` filters by the trimmed group name using an exact, case-sensitive match; `?itemGroup=` returns ungrouped items. No matches return an empty array. Group names come from deduplicating nonempty itemGroup values across all Items; no separate Group API is added.
