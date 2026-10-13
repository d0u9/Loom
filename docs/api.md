# API Usage Contract

Status: endpoints support flat Categories, Template/Checklist automatic merging, zero-source removal, and two section levels; runtime OpenAPI reflects actual request and response schemas.

The service prefix is `/api/v1`, with JSON requests and responses. Authenticated `GET /openapi.json` provides complete OpenAPI generated from runtime validation rules; the following records operation sequences and rules that schemas alone cannot express.

## Authentication and Catalog

Successful login responses include `csrf` and `username`; with authentication enabled, `/session` returns `csrf`, `authEnabled:true`, and the actual account `username` for the sidebar account area. Without login requirements, `/session` returns `authEnabled:false` and anonymous CSRF, without a username.

`POST /login {username,password}` sets an HttpOnly session and returns csrf; `GET /session` returns the current csrf and authEnabled; responses must not be cached. Session write requests submit `x-csrf-token`; `POST /logout {}` logs out. `POST /tokens {name}` creates a token shown only once; `GET /tokens` lists token IDs/names; `DELETE /tokens/:id` revokes a token. CLI uses `Authorization: Bearer TOKEN` without session CSRF.

`GET /items` and `/categories` return the catalog. Item POST submits `{name,note?,categoryIds,requestId}`; PUT `/:id` submits the same fields plus version. Category POST submits `{name}`; PUT adds version. Category has no parentId. Both DELETE `/:id` requests submit `{version}`; reference conflicts return the referring resource names, IDs, and kind. `GET /categories/:id/members` returns direct member `itemIds`.

## Template / Checklist

Content may include sections, with section fields `{id,name,parentSectionId,afterEntryId?}`. Entries and child sections under the same parent share an order: entries follow array order, and a section immediately follows the sibling entry referenced by afterEntryId; null places it before all sibling entries, while an absent value or a reference that no longer points to a sibling entry places it after the sibling entries. Multiple sections at the same position follow array order. New entries append to the array and therefore appear last under that parent. When duplicate entries merge, sections referencing a merged entry instead reference the preceding retained sibling entry. Copy/instantiate/restore remap afterEntryId; Entry.sectionId:null/omitted means the root position. At most two section levels, excluding the root and Item.

Shared `/documents`: GET lists summaries, POST `{kind,name,entries,sections?,requestId}` creates, GET `/:id` retrieves details, and PUT `/:id` submits `{name,entries,sections?,version,requestId}` to replace the structure. kind is template or checklist; Template PUT updates only the current content.

Entry fields: `id,itemId,sectionId?,name,quantity,unit,note,checked?`; quantity is text and supports expressions such as `1/2`; unit/note may be empty. Temporary entries have itemId null; the server resolves Item names. Each new entry uses a new UUID. A separate endpoint manages checked; structural saves ignore its old value. Copy/instantiate/restore generate new entry/section IDs; normal structural edits retain existing IDs. Unknown fields (including legacy groups/direct/groupIds) return 400.

`PUT /checklists/:id/entries/:entryId/checked {checked,requestId}` sets the target state. The client waits for the previous request to complete before submitting the next; the UI temporarily disables checking that entry while saving, and failures can retry the original request. Checking does not change the structural version; the last submission across devices wins.

Creating an independent checklist from a template uses `POST /documents/:id/history-apply`, with action instantiate (see History Operations below), copying the saved current content. `DELETE /templates/:id {version,confirm:true}` deletes the template, retaining existing instance content and source information. `DELETE /checklists/:id {version,confirm:true}` permanently deletes a checklist (active or archived), including entries, sections, and archive snapshots; non-Checklist resources return 400, and stale versions return 409.

## One-time Category Addition

There is no dedicated endpoint: the client reads member order from `GET /categories/:id/order`, uses addItems in `shared/groups.ts` to add missing Items (skipping the same Item ID and retaining existing entry fields, positions, and checked states), then saves through documents PUT; the server validates versions, sections, and Item uniqueness as usual. Later category changes do not add or remove document entries; deletion records no exclusions, and no sources are created.

category-add/preview/compose and revisions endpoints have all been removed and return JSON 404.

## History Operations

`POST /checklists/:id/archive {version,requestId}` atomically saves a snapshot and releases active relationships.

`POST /documents/:id/history-preview {action,version}` returns missing items, names, and duplicates (each group contains itemId and candidate entries). action is restore, copy, template, or instantiate; instantiate uses the saved current template.

`POST /documents/:id/history-apply {action,version,name,requestId,resolutions?,mergeTargets?,useDate?}` applies atomically. resolutions may be omitted; missing Items default to temporary entries. Explicit resolutions specify `{mode:'temporary'}`, `{mode:'existing',itemId}`, or `{mode:'new',name}` by missing Item ID. mergeTargets specifies the entry ID whose data to retain by duplicate Item ID; if linking existing creates duplicates with unresolved field conflicts, returns 409 with candidate entries and rolls back the entire operation. restore retains checked and replaces the archive; copy/instantiate reset checked; template creates only a normal current template.

## Conflicts and Safe Retries

Resource writes include the expected version; stale versions return 409. 404 means the resource does not exist, 400 invalid input, 401/403 authentication/CSRF failure, and 429 excessive login attempts. Error body: `{message,details?}`. Do not automatically replace the version with the latest after 409 and resend: this would overwrite edits from other devices.

Writes requiring deduplication include a UUID requestId. After a timeout, retry with the same ID and identical content; the server persists results, so restarting does not repeat execution. The same ID with different content returns 409. Confirm the old request result before sending modified content with a new ID. Previously committed results may represent an older resource state; GET details again after retrying if needed.

## Use Date

POST `/documents` and PUT `/documents/:id` may include `useDate: "2026-10-11" | null`. Only Checklist permits a nonempty date; invalid Gregorian dates return 400. GET list/detail responses return useDate; lists also return `total`/`done` (entry and checked counts, taken from snapshots for archives). Omission on PUT preserves the previous value; null clears it. Writes follow version and idempotency constraints. Archive/restore retain the date; copy and template instantiation may specify history-apply `useDate`, defaulting to null when omitted.

## Category Member Order

GET `/categories/:id/order` returns `{itemIds,version}`, containing the display order of all current direct members. PUT to the same path submits `{itemIds,version,requestId}`; itemIds must be unique and equal the current direct member set. Version or set changes return 409. Success increments the Category version and uses persistent request deduplication. This affects only that category's display, without changing category relationships.

## Merging and Sections

Nonempty Item IDs are unique within a document; adding the same Item again retains only the existing entry. Temporary entries do not merge by name.

Sections do not participate in identity or checking; moving changes only sectionId. Deleting a nonempty section promotes its content to the parent, then submits the complete structure. The server validates absence of cycles, ownership by the same document, and at most two levels; invalid structures roll back the entire operation. Old revisions/archives use schemaVersion:2; copy/restore/instantiate/convert to template reassign IDs and remap section positions.

## Disabling Authentication through Configuration

data/loom.config.json with auth.enabled:false, followed by a restart, makes anonymous GET /session return `{csrf,authEnabled:false}`; reading catalog/documents requires no login. Anonymous writes still submit x-csrf-token, and any supplied Origin must match the service; Bearer tokens are still validated. POST /login returns 409 in this mode; OpenAPI global security is []. The default auth.enabled:true continues to require authentication and does not automatically create accounts. Anonymous csrf changes after process restart; clients must fetch /session again before writing.

Structural saves reject nonempty category sources with 409 and roll back the entire save. When Web receives an explicit Invalid CSRF token / 403, it fetches session again and retries at most once with the original request content and requestId; other errors are not automatically retried.

## Item Group

Item GET/POST/PUT responses add `itemGroup: string | null`. POST/PUT may submit itemGroup (at most 200 characters); the server trims surrounding whitespace, and blank/null means ungrouped. Omission defaults to null on POST and preserves the previous group on PUT, still following the version/requestId contract. Group is independent of categoryIds and does not affect document sources/history or reference counts.

GET `/items` returns all items; `?itemGroup=Food` filters by the trimmed group name using an exact, case-sensitive match; `?itemGroup=` returns ungrouped items. No matches return an empty array. Group names come from deduplicating nonempty itemGroup values across all Items; no separate Group API is added.

### Creating a Checklist from a Category

`POST /api/v1/categories/:id/checklists`: `{name, useDate?: YYYY-MM-DD|null, version, memberIds: UUID[], requestId}`. Returns the complete document. Within a transaction, checks the Category version and current direct member set and creates unchecked independent entries in current member order, without creating a category source group; an empty category can create an empty checklist. Version or membership changes return 409 without creating a checklist; retrying the same requestId with the same request returns the original result, while different content returns 409. Later category edits do not update existing checklists.
