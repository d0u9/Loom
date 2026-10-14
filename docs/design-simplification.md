# Loom Simplification Design Proposal

Status: implementation confirmed by the user on 2026-10-13; the version before simplification is tagged v0.0.1 (d1220fe). This document describes v0.0.2 behavior; see roadmap for implementation and acceptance progress. Retain old history without changing database structure.

## Goal

The main flow becomes: maintain items → select items for a template → save the template → create an independent checklist → check → archive.

A template is the current reusable recipe; a checklist is one execution. Users need not first understand revisions, sources, exclusions, or historical repair to complete this flow.

## Trade-offs

| Existing mechanism | Proposal | Cost and rationale |
| ---------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Every template save generates a revision, and checklist creation depends on a revision | Templates save only current content; checklist creation copies saved content | New saves no longer leave old templates to revisit; existing history remains. Independent checklist content already meets execution-record needs |
| Whole-category addition leaves category sources; updates handle additions, removals, exclusions, and source counts | Categories provide only one-time batch selection; additions become normal document entries | Category changes cannot synchronize into a template in one click; adding again fills missing items without deleting existing content |
| Item Group, Category, and Section all resemble "groups" | Clarify them as catalog groups, reusable category collections, and document sections; all are optional | Do not automatically merge existing data or add another label/collection resource system |
| Historical restoration puts three missing-item treatments in the main flow | Retain temporary entries by default; link or add to the catalog later when organizing | Restoration does not create catalog items for the user or establish identity by matching names |
| Every entry permanently displays technical metadata such as source counts | Prioritize names, checked states, and necessary notes; view catalog information as needed | Clearer document content; retain shared display components across pages |
| Templates and checklists both autosave | Save operations immediately and text after a pause; retain status and failure retries | Confirmed by the user on 2026-10-14; wait for the latest template save before creating a checklist |

## Templates: Maintain Only Current Content

- Creation, editing, and renaming all save to the current template, without automatically generating revisions or adding a "Save revision" button or switch.
- Templates autosave and retain "Create checklist" at the top; drain the save queue before creating, retaining edits and offering a retry after failure.
- Creating a checklist uses the current template saved on the server, copying entries, notes, positions, and sections, and resetting every checked state. Source information records at most the template ID and its name at that time, without requiring a revision binding.
- Later template edits or deletion do not change existing checklists. Current rules for latest active Item names and archived name snapshots still apply; independence means independent content, positions, and checked states, without removing shared Item identity.
- Converting a checklist to a template creates a normal template without needing an initial revision. Copying a checklist still resets checked states; restoring the original still retains them.
- No new template revision history. Existing revisions are neither overwritten nor deleted; APIs for querying old records and creating from old revisions remain during the transition, and normal template editing neither loads nor depends on them.

Example: replace milk with oat milk in "Weekly shopping"; edits autosave. Old shopping checklists retain milk; the next new checklist uses oat milk.

## Categories: Selection Only, Not Ongoing Document Management

Categories remain flat, many-to-many item collections, retaining member ordering, selecting individual category items, adding whole categories, and directly creating checklists.

- Adding a whole category adds normal entries in member order without creating new ongoing category sources; it does not automatically create a section with the same name. Users still create sections explicitly.
- Skip an already present Item ID, retaining its original position, note, quantity/unit, and checked state; temporary entries always remain independent and never merge by name.
- If a category later gains members, adding the whole category again adds only missing Items; existing entries are neither changed nor deleted. Removing category members does not delete document entries either.
- Deleting a document entry simply deletes that entry, without recording an exclusion. Explicitly adding the whole category again re-adds it as the result of that new explicit choice.
- No more Update to latest, unlink category sources, restore exclusions, or source counts; Category deletion restrictions need only consider membership relationships and old source references that remain during the transition.

Example: "Breakfast" contains bread and milk; adding it to a template produces two normal entries. If "Breakfast" later removes milk, the template retains milk and the user decides whether to delete it.

This is a substantive feature trade-off, not merely hiding buttons. If category batch synchronization becomes a frequent need, reevaluate using actual scenarios; this round does not design a switchable synchronization mode.

## Boundaries between Groups, Categories, and Sections

- Catalog groups: used to browse, filter, and sort the item catalog, with at most one per item; existing dragging onto group labels remains.
- Categories: reusable collections of items; an item may belong to several.
- Sections: organize only the display of the current template or checklist, at most two levels, retaining the confirmed drag, collapse, and keyboard operations.

Forms clarify "Group" as "Catalog group", and category addition explains "Add items in bulk". All three are optional; users need not build a catalog before writing a checklist. Existing groups and categories may overlap, but must not automatically merge based solely on matching names or similar uses; no migration or management entry is added for now.

Temporary entries remain directly enterable. The previously discussed sidebar organization entry remains a separate, unimplemented feature; this simplification does not expand into automatic categorization: it only adds to the item catalog, leaving the original template, checklist, and history unchanged.

## History: Retained around Checklist Archives

- Active checklists allow editing and checking; after archiving they are read-only and retain the names, content, sections, date, and checked states at that time.
- Restore retains checked states; copy resets them; conversion to a template excludes them. Deletion still requires explicit confirmation.
- Items deleted from the catalog default to temporary entries in history, retaining names and document fields without losing entries, automatically creating new Items, or linking by identical names. Explicitly link or add them to the catalog when organizing is needed.
- Multiple identities requiring merging in existing historical data must still resolve conflicts in notes, quantities, positions, and other fields; "default handling" must not silently discard values.
- Archived name snapshots and existing revisions are not rewritten; restoration or adding items to the catalog does not alter history itself.

## Streamlining the Interface

Templates retain Back, name, More, Add, New section, and Create checklist; settings retain name, Reload, and Delete, removing everyday revision selection. Checklists retain the current reading/editing toggle, Hide completed, date, addition, and section operations; Copy, Archive, Restore, Convert to template, and Delete go under More.

Normal autosaving requires no user action; only failures offer a retry of the original request. The main flow does not expose internal structural versions, source numbers, or storage details. Continue using shared Page, Button, Modal, Documents, bilingual support, and lucide icons, retaining current colors and mobile dimensions.

## Safeguards That Must Remain

Retain all server input validation, transactions, database foreign keys, shared Item identity, deduplication by ID, deletion reference checks, structural version conflicts, persistent requestId, secure authentication, CSRF, edits retained after save failure, leave protection, and keyboard accessibility.

Structural version provides concurrency protection and differs from template revision history. Removing revision does not remove version or allow structural saves to overwrite checklist checked states. Backup/restore and deployment that moves data with the project remain.

## Implementation Order and Data Boundaries

1. First implement normal template saving and checklist creation from current content; update Web, API, tests, and formal design rules together. Existing tables can store independent current content, and the existing revision table may remain; schema changes are not expected. Verify that normal saves do not append revisions, version conflicts and uncertain-response retries are safe, created content is correct, and old checklists and history remain unchanged.
2. Then implement one-time category addition and simplified history restoration. Change server and client semantics together; do not merely hide source operations while old zero-source behavior still deletes entries. New content creates no category sources; at startup, existing active documents are transactionally converted to independent entries, retaining all fields and entry IDs and incrementing affected structural versions. The user has authorized this conversion; retain a SQLite backup before converting the production service, without rewriting history.
3. Finally remove obsolete terminology from everyday interfaces and documentation. Check callers of old revision/category-source APIs before deciding to retire them; do not break old clients or historical queries just to delete code immediately. Do not delete old tables, snapshots, or fields as part of the feature change.

Any change to database structure, constraints, or user_version still requires prior consent. During implementation, verify at least desktop, simulated mobile, keyboard, archive restoration, failure retries, and historical reads; real phones and Docker each still require separate acceptance.

Record implementation progress and actual verification separately in roadmap; design alone does not establish acceptance.

> 2026-10-13 follow-up: the user agreed to directly delete category-source and revision tables (schema remains version 1). The transitional arrangements above, including "retain existing revisions", "convert old sources at startup", and "retain old APIs during transition", no longer apply; AGENTS.md and design.md take precedence.
