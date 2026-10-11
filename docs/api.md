# API Usage Contract

The service prefix is `/api/v1`, with JSON requests and responses. Authenticated `GET /openapi.json` provides complete OpenAPI generated from runtime validation rules; the following records operation sequences and rules that schemas alone cannot express.

## Authentication and Catalog

`POST /login {username,password}` sets an HttpOnly session and returns csrf; `GET /session` can retrieve the current csrf. Session write requests submit `x-csrf-token`; `POST /logout {}` logs out. `POST /tokens {name}` creates a token shown only once; `GET /tokens` lists token IDs/names; `DELETE /tokens/:id` revokes a token. CLI uses `Authorization: Bearer TOKEN` without session CSRF.

`GET /items` and `/categories` return the catalog. Item POST submits `{name,note?,categoryIds,requestId}`; PUT `/:id` submits the same fields plus version. Category POST submits `{name,parentId}`; PUT adds version. Both DELETE `/:id` requests submit `{version}`; reference conflicts return the referring resource names, IDs, and kind. `GET /categories/:id/members` returns deduplicated recursive `itemIds`.

## Template / Checklist

Shared `/documents`: GET lists summaries, POST `{kind,name,entries,groups,requestId}` creates, GET `/:id` retrieves details, and PUT `/:id` submits `{name,entries,groups,version,requestId}` to replace the structure. kind is template or checklist; Template PUT generates a revision each time.

Entry fields: `id,itemId,name,quantity,unit,note,direct,groupIds`; quantity is text and supports expressions such as `1/2`; unit/note may be empty. Temporary entries have itemId null; the server resolves Item names. Each new entry uses a new UUID. A separate endpoint manages checked; structural saves ignore its old value. Copy/instantiate/restore generate new entry/group IDs; normal structural edits retain existing IDs.

`PUT /checklists/:id/entries/:entryId/checked {checked,requestId}` sets the target state. The client waits for the previous request to complete before submitting the next; the UI temporarily disables checking that entry while saving, and failures can retry the original request. Checking does not change the structural version; the last submission across devices wins.

`GET /templates/:id/revisions` lists revisions; GET `/:revision` returns a historical snapshot. Creating an independent checklist from a template uses `POST /documents/:id/history-apply`, with action instantiate (see History Operations below). `DELETE /templates/:id {version,confirm:true}` deletes the template and revisions, retaining existing instance content and source snapshots.

## Category Preview and Apply

`POST /documents/:id/category-preview {entries,groups,version,categoryId,groupId?}`: no groupId means a new group; an existing groupId means an update. Returns group, expected as the complete member set, added, removed, duplicates.

`POST /documents/:id/category-compose` submits the above content plus expected, `choices`, and `removeIds`. choices specifies `{mode:'merge',targetId}` or `{mode:'keep'}` by Item ID; removeIds contains confirmed entry IDs to remove. Returns new entries/groups without writing yet; save through documents PUT, whose transaction checks the member set again. Template still maintains a client-side draft; Checklist autosaves.

Group fields: `id,categoryId,originalCategoryId,name,members,excluded,expected?`. expected is the confirmed expanded set and is not persisted as an ongoing synchronization constraint after saving. Exclusions are per group + Item and are created only when the last entry for that Item in the group is deleted. Static groups have categoryId null and retain the original identifier and content; after changing categoryId, the user saves normally and then requests an update preview.

## History Operations

`POST /checklists/:id/archive {version,requestId}` atomically saves a snapshot and releases active relationships.

`POST /documents/:id/history-preview {action,version,revision?}` returns missing items/categories and names. action is restore, copy, template, or instantiate; instantiate requires revision.

`POST /documents/:id/history-apply {action,version,revision?,name,requestId,resolutions}` applies atomically. resolutions specifies `{mode:'temporary'}`, `{mode:'existing',itemId}`, or `{mode:'new',name}` by missing Item ID. Missing Categories automatically become static groups. restore retains checked and replaces the archive; copy/instantiate reset checked; template creates revision 1.

## Conflicts and Safe Retries

Resource writes include the expected version; stale versions return 409. 404 means the resource does not exist, 400 invalid input, 401/403 authentication/CSRF failure, and 429 excessive login attempts. Error body: `{message,details?}`. Do not automatically replace the version with the latest after 409 and resend: this would overwrite edits from other devices.

Writes requiring deduplication include a UUID requestId. After a timeout, retry with the same ID and identical content; the server persists results, so restarting does not repeat execution. The same ID with different content returns 409. Confirm the old request result before sending modified content with a new ID. Previously committed results may represent an older resource state; GET details again after retrying if needed.
