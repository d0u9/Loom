# Loom UI Design

Status: confirmed interface specifications. Updated: 2026-10-12.

This file defines Loom visual/interaction specifications. Business rules are in [Design Doc](design.md), acceptance records in [Roadmap](roadmap.md), and development constraints in [AGENTS.md](../AGENTS.md). Read before changing shared styles; synchronize those three entry points when specifications change.

## 1. Style and references

All UI icons use lucide-react, preferably through shared Icon. Handwritten SVG/path and CSS SVG icons are prohibited; library-generated SVG is allowed. Branding uses existing PNG, and icon dimensions/strokes follow shared styles.

Use Memos' compact proportions, regular weights, thin-line icons, and light borders as reference. Loom serves computers/phones and starts with a light theme. Retain warm-gray background, white cards, and green accents; changing fonts, spacing, or layout must not also change colors.

On 2026-10-12, actual styles were read through developer tools from the user's already-open [Memos](https://memo.d0u9.cc). Reference values and Loom's final specifications are recorded separately:

| Element | Memos measured | Loom adopted |
| --- | --- | --- |
| Desktop sidebar navigation | 13px / 18px, 400, row height 28px, horizontal padding 8px | Same; real links with icons |
| Light button text | 13px / 18px, 400 | Shared button default 13px / 18px, 400 |
| Save button | 14px / 20px, 500, height 28px, radius 6px | Primary button 13px / 18px, 500, height 28px, radius 6px |
| Icons | Mostly 16px, stroke roughly 1.8px | 16px, stroke 1.8px |
| Body text | 16px / 24px, 400 | Retain Loom 14px, roughly 1.45 line height |
| Markdown level-one heading | 30px / 36px, 700 | Not applied to app titles; Loom page titles 18px, 500 |
| Accent color | Blue-gray | Retain Loom green |

Button text must not inherit body/input font sizes. The user explicitly requested shrinking shared buttons to **13px / 18px**; the reference page's 14px Save button does not justify reverting this.

## 2. Fonts and dimensions

Use system sans-serif fonts: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`. Load no extra fonts.

| Purpose | Font size / line height | Font weight |
| --- | --- | --- |
| Body text, ordinary fields | 14px / roughly 20px | 400 |
| Page/dialog titles | 18px; page title line height 28px, dialog roughly 1.3 line height | 500 |
| Card names | 14px / 20px | 500 |
| Shared action buttons | 13px / 18px | Ordinary 400, primary 500 |
| Desktop navigation links | 13px / 18px | 400, including selected state |
| Tags, notes | 12px / 18px | 400 |

Standard desktop controls are 28px high; touch interaction targets are at least 44px. Buttons, single-line inputs, and view switches align on one row. Calendars retain compact grids; compact inline inputs may use 26px heights while preserving adequate touch targets.

Font sizes use only 12 / 13 / 14 / 18. Spacing uses 4 / 8 / 12 / 16 / 24px; navigation-item gap is 2px, icon/text gap 4px, button icon/text gap 6px. Controls/tags have 6px radius, cards 8px, panels/dialogs 10px.

## 3. Colors

All colors come from `:root` in `web/style.css`; business pages must not introduce their own themes.

| Purpose | Token | Value |
| --- | --- | --- |
| Page background | `--bg` | `#f7f7f5` |
| Sidebar background | `--nav-bg` | `#f0f1ec` |
| Card, dialog, control background | `--surface` | `#ffffff` |
| Body text | `--text` | `#292b2e` |
| Ordinary actions, secondary text | `--text-2` | `#54594f` |
| Supporting text | `--muted` | `#858780` |
| Faint text | `--faint` | `#c5c8be` |
| Separators, card borders | `--line` | `#e8e9e4` |
| Input border | `--line-strong` | `#dedfd9` |
| Hover background | `--hover` | `#f1f3ee` |
| Primary action | `--accent` | `#38634a` |
| Primary action hover | `--accent-hover` | `#2c513b` |
| Selected background | `--accent-soft` | `#e2e8db` |
| Category tag background / text | `--tag-bg` / `--tag-text` | `#edf1e8` / `#64725b` |
| Focus | `--focus` | `#739980` |
| Dangerous actions | `--danger` | `#aa4740` |

Dangerous operations use red to communicate meaning; ordinary actions do not borrow danger colors. Retain clear keyboard focus and never communicate selection, disabled, or error state through color alone.

## 4. Buttons and navigation

All action buttons use [Button](../web/button.tsx), with base styles centralized in [style.css](../web/style.css). Business pages pass events, disabled conditions, and layout information without independently overriding the base skin.

| variant | Purpose | Appearance |
| --- | --- | --- |
| `primary` | Main new/create/save actions | Green background, white text |
| `secondary` (default) | Cancel, reload, ordinary actions | White background, visible thin border |
| `danger` | Dangerous actions such as deleting templates | Red text/border, pale-red hover feedback |
| `ghost` | Lightweight calendar/selection interaction | Transparent background, hover feedback |
| `icon` | Compact edit/delete/back/more actions | 16px icon, consistent target size |

Ordinary actions must not become borderless text merely because they appear in settings dialogs or entry rows. Reload must look like an ordinary button and Delete template like a danger button. Dangerous icon actions remain icons with danger coloring. Disabled buttons reduce opacity, execute no action, and show no actionable hover feedback.

Button defaults to `type="button"`; form submission explicitly sets `type="submit"`. Icon buttons provide `aria-label` and necessary `title`, never unnamed icons alone.

Checklist, Template, Item, Category are **navigation links**, sharing AppLayout's NavigationLink rather than Button. Each provides a real `href`, 16px line icon, and text; the current page uses `aria-current="page"` and pale-green selection without changing font size/weight. Ordinary clicks respect unsaved-change protection/client routing; modifier clicks, middle clicks, and copying addresses retain native browser link behavior.

Checklist navigation opens all checklists and clears date filters; only clicking a calendar day filters that date. Creating a Checklist with a selected date defaults to it.

The sidebar bottom uses the shared account bar: thin top separator, user icon/actual account name on the left, vertical More icon on the right. Authenticated account menus offer logout, with Escape closing/restoring focus; names come from the server rather than hardcoding doug from the reference. Anonymous mode shows an unlocked icon and No login required, without username, account menu, or logout. Phones retain an account-menu entry at the bottom-navigation end when authenticated; anonymous mode shows only four navigation entries.

## 5. Pages and collections

All four pages share [AppLayout and Page](../web/layout.tsx). Desktop sidebar width is 248px; right content is centered outside it, with 960px maximum width. Page centrally renders title, back, more, view switching, secondary/primary actions; pages pass only action configuration rather than assembling headers.

Creation buttons on all four list pages align at top/right edges. Card/list switching changes only collections, not header position, container width, background, or padding. Details use the resource name as title.

Collections share [Collection / RecordCard](../web/collection.tsx):

- Phone cards use two equal-width columns with truncated long names; list view remains single-column.
- Phone upper-right card buttons occupy only the title row; notes/tags use full content width. Tags stay on one line, ellipsizing long Group names; a single category shows its name and multiple categories show N categories, with full names in the edit dialog. Desktop retains specific category names.
- Phone card-corner icon buttons are 28px wide and 44px high for touch, without gaps, as the user's local exception to touch-width rules.
- Each Page card/list switch button is 28px wide with a 28px-high outer frame, the same on desktop/phone; add-dialog source switching retains a 44px touch target.
- Clicking a card/list row opens it directly with keyboard support; provide no separate Open button.
- Card edit/delete stay at the upper right; list information/actions share one line and actions do not trigger opening.
- Lists use the same white panel and thin separators, aligning name, information, and action columns.
- Item categories appear as tags; card notes use 12px / 18px and reserve 36px for two lines even when absent. Long notes are truncated only visually, without losing content; lists show no persistent notes.
- Category members show name, smaller Item notes, and removal on one line, without repeating the current category name, check circles, or a second Direct member line. Removing a relationship does not delete the Item.
- The Category add-member dialog offers a collapsible New Item action below, expanding shared ResourceForm/ItemFields inside the same dialog and defaulting to the current category; after saving, the Item appears in the current member list.
- Sort by dragging cards/rows directly, without handles; retain keyboard ordering. Internal actions do not start dragging, and finishing a drag does not open records.
- Template/Checklist entries and sections share mixed ordering: dragging any row before/after another makes them siblings (entries/child sections may interleave, and sections can change depth this way). Dropping on a section title's lower half inserts first inside it (subject to two levels; ignore drops into its own subtree or beyond depth). Arrow keys move entries row by row in visible order, entering/leaving sections, while sections move among siblings.

## 6. Editor and dialogs

Template / Checklist share the [Documents](../web/documents.tsx) editor; Item / Category reuse catalog editing structure. Shared layout does not require different businesses to use identical fields.

New section sits directly in the Page header with actions such as Add entries, not hidden inside the add dialog. Sections have at most two levels, are not Categories, and have no checked state.

Add-entry dialogs offer target section, Item search/click addition, Category selection with adjacent Pick one from category / Add entire category, temporary entries, and Cancel. Retain dialogs after failure for retry.

Creation/name/field forms share [ResourceDialog](../web/resource-dialog.tsx); all dialogs share [Modal](../web/modal.tsx), without browser prompt / confirm / alert. Deletion, discard, and leave-protection confirmations use `ask()` from the same file; dangerous confirmation buttons name the action and use danger styling. Settings fields sit above and actions below a separator; use shared Button with clear borders/danger styles.

Dialogs focus the first control on opening; Escape closes and restores trigger focus; close native dialog before DOM removal. Business input / textarea use `data-1p-ignore="true"` and `autoComplete="off"`; login retains username / current-password autofill.

## 7. Phones and acceptance

Use only the `max-width: 650px` narrow-screen breakpoint with 16px horizontal margins. Phones share navigation links and Calendar: bottom navigation stacks icons/text and the calendar collapses. Titles truncate on one line; with secondary actions, primary buttons may show icons only while retaining accessible names. Entry names, sources, and actions share one line, with notes beneath; quantities/units are currently hidden but retained in data.

Mobile dimensions take effect directly on narrow screens or coarse pointers without waiting separately for touch detection, avoiding size jumps on refresh. Retain previously confirmed card-corner/Page-view-switch exceptions.

Acceptance checks desktop/phone plus keyboard focus, Escape, form submission, disabled states, navigation leave protection, opening new tabs, and direct URLs. Four-page headers align in equal-size windows; card/list switching does not move the shell, and phones have no horizontal overflow.

The latest full Web regression passed 30 checks; after shrinking button fonts, build and 6 desktop/phone style regressions passed. Account-bar changes passed build, 6 API/configuration tests, and 8 desktop/phone checks (anonymous restart once timed out, then passed separately). These are browser simulations; real phones are unverified.

## 8. Item Group Tab

The Item page shows All, Ungrouped, and group tabs beneath the shared Page title, sharing filtering across cards/lists. Use public Button and existing green selection; Group entries are rounded tags that wrap on narrow screens without widening the page. Drag Item cards/list rows onto highlighted group tags; All is not a drop target and Ungrouped clears the group. Arrows/Home/End switch groups. Editing/creation share ResourceDialog; Group accepts existing/new names. Retain Category tags and card note height.

Item/Category shared ResourceDialog fields use 16px vertical spacing, labels at 13px/18px, and 14px inputs. Item categories use a borderless fieldset with legend aligned left with name, Group, and notes. Category options wrap horizontally as tag blocks with native checkboxes, using green selection. Vertically center checkbox/name; phone tags offer at least 44px targets, retaining keyboard checking and disabled semantics.

Every shared SortableRow drag provides a pointer-following floating preview with name, white background, thin green border, and shadow; the original entry fades while retaining its placeholder. Mouse drag starts beyond 6px; phone long-press shows it after 250ms while ordinary swipes scroll. Release, cancel, Escape, or unmount clears preview/target highlights; reduced-motion preferences disable lift animation.

Item cards/list rows show a Group icon and group-name tag in metadata; no group shows the icon and Ungrouped. Desktop/phone consistently use shared Icon's tag icon, retaining Group accessible names and full-name hints. Share styles/row layout with Category tags; update after drag saves without changing reserved note height.

Cards/list rows show no mouse-selection outline; hover fades background over 180ms. Keyboard focus uses a thin inward dashed outline to avoid container clipping. Opening/closing the Item edit dialog preserves search bar, query, and Group filter without moving background list/title; reset queries only on switching business pages or Category details.

Group input uses shared web/combobox.tsx, never native datalist. Dropdown matches input width with white background, thin border, and light shadow; options reuse public Button and green current/keyboard-focus styling. Support filtering, existing groups, new names, Ungrouped, and arrows/Enter. Escape closes the dropdown before the dialog; leaving the field closes it; disable browser autofill.

The group bar sticks to the top while long Item lists scroll, with maximum height min(35dvh, 240px) and internal overflow scrolling so it does not cover all phone content. Combobox arrow navigation scrolls only the options panel to reveal the active option; initial ArrowUp selects the last option and ArrowDown the first. On mouse down, capture the original target pointer to prevent losing drag when initial fast movement leaves the entry.

## Shared Item presentation

Active Item entries in Item catalog, Category members, Template, and Checklist share ItemSummary from `web/item-summary.tsx`, showing name, Item notes, Group, and category tags. Lists share name/notes/tags columns; cards share vertical layout and reserved note space. Category omits its current category tag to avoid repetition. Template/Checklist entry notes, sources, and checkmarks are not Item information and stay outside shared presentation. Historical revisions/archives continue using snapshots without reading latest Item metadata.

ItemSummary lists explicitly fix name/notes/tags as columns 1/2/3; empty notes retain space and tags never shift left. List notes are at most 240px wide, fading over the last 24px when long on one line; cards reserve 36px/two lines and fade downward on the second line on overflow. Apply masks only on actual overflow; full notes remain in data/title without storage truncation.

Inline/card-corner actions prefer Button variant="icon" and shared Icon without persistent text, providing aria-label/title. Larger primary actions (new/add/save) use icon/text; ordinary form confirm/cancel may retain text. Category member removal uses close, removing membership only.

## Mobile height baseline (2026-10-12)

At the user's latest request, mobile controls use a unified 32px height baseline, overriding earlier mobile 44px constraints and local exceptions: buttons, single-line inputs, search, and collapsed calendar entry are all 32px. Multiline content expands in multiples of that baseline; expanded calendar cells retain a compact grid. Desktop touch rules remain unchanged. Narrow screens use these dimensions from the first frame.

The four mobile bottom-navigation entries show icons only, hiding text. NavigationLink retains aria-label/title, real href, and aria-current, with touch targets at least 44px. Desktop retains icon/text navigation.

Mobile navigation icons are 24px, links stay 44×44px, and selected background matches the target instead of stretching across the entire column. Distribute entries evenly and retain the bottom safe area.

Creation buttons on all four mobile list pages show only the plus icon at fixed 32×32px, retaining accessible name/title through shared Page styles. Desktop retains icon/text; detail-page actions retain existing behavior.

Mobile calendar entry vertically centers the shared Icon arrow with text and points downward when expanded. Expanded calendar removes extra section spacing, with 8px padding, 28px date rows, and no extra grid gaps. Desktop calendar stays unchanged.

Checklist collection completion metadata uses the shared check icon plus "completed count/total", without persistent "Completed" text; retain aria-label/title, date, and archive information.

Checklist card metadata aligns the date left and completion icon/progress right, without a separator dot; retain the archive marker separately. List-view ordering stays unchanged.

Mobile Item/Category member cards reserve only one description line (18px), overriding the old two-line rule. Long descriptions fade over the final 24px only when actual horizontal overflow occurs; empty descriptions still reserve one line. Desktop retains two lines, full content, and title.

Account menus close on outside click without mistakenly closing on internal clicks. Outside targets receive normal focus; Escape still closes and returns focus to the menu trigger.

Shared mobile Collection list rows use 4px vertical padding and a normal 32px content line height, retaining 16px horizontal whitespace, consistently for all four resources and Category members.

Mobile entry/card/document-section actions share ActionTools, collapsed to More by default. Expanding translates the entire content left over 180ms by actual button width to expose right actions without covering tags; collapse restores position. Escape collapses/restores focus, and summary starts neither dragging nor section collapse. Desktop displays existing actions directly; reduced motion disables animation.

Mobile pages consistently prohibit zoom: entry viewport fixes initial/maximum scale at 1 with user-scalable=no; narrow-screen touch-action retains horizontal/vertical scrolling but disables pinch/double-tap zoom. Browser/system forced accessibility zoom may still override page limits.

When mobile ActionTools is expanded, clicking anywhere outside closes it without blocking that area's own action. Clicking another entry's tools closes the original, while internal action buttons remain usable; clicking More again or Escape also closes it.

All delete/remove actions consistently use shared Icon's trash icon on desktop/phone, including category members, document entries, category sources, sections, Item/Category, and template/checklist deletion. Larger delete buttons may retain text with trash. Closing/clearing search is not deletion and retains close. Icon changes do not alter removal/deletion semantics.

Checklist check circles stay at the same far-left baseline on desktop and phone without indentation at root or any section depth; hierarchy indentation belongs in content spacing after the circle.

Section layout Demo becomes two-level: independent level-one blocks, pale backgrounds and content indentation for level-two titles/content, and left-aligned check circles. The production interface/two-level limit are now implemented; old structures adjust through previews.


Latest confirmation and implementation (2026-10-12): Template/Checklist have at most two Section levels; Items have no parent/child relationships. New-section parent choices allow only root or level-one sections, and drag/server validation rejects a third level.

### Confirmed desktop section styling (2026-10-13)

Use confirmed section hierarchy styling: independent level-one blocks with 18px/700 pale warm-gray titles, level-two 15px/650 pale titles/content, and 14px regular-weight Items. Level-two circles/content indent together by 16px, replacing the old all-circles-left-aligned desktop rule. Collapse adds only a slight shadow without delaying its change. Apply first on desktop (>=651px); phone styling retains current behavior pending separate adjustment.

### Temporary-entry quick input (2026-10-13)

Shared Documents provides a pale empty-input row at the end of active documents; header Add temporary entry focuses it directly, and source-add dialogs no longer offer that action. Blank input or input not confirmed with Enter creates no entry. Enter confirms a root temporary entry, clears input, and retains focus for continuous entry. Enter for Chinese IME composition does not submit; Escape clears unconfirmed input. Checklist immediately uses autosave/requestId retries; Enter on an existing temporary name saves immediately and ends editing. Template Enter confirms only the client draft, still requiring explicit revision saving. Remove the inline Save as Item button.

Section quick input: expanded level-one/level-two sections each end with a pale temporary-entry input labeled by target section. Enter adds there and retains focus for continuous entry. Root input remains independent; collapsed sections hide their inputs. Checklist autosaves; Template retains explicit revision saving.

After confirmation, temporary entries display ordinary names without input appearance. Clicking the name or keyboard activation resumes editing; Enter confirms and exits, blur exits. Quick-add empty rows retain pale hints.

Checklist completion state: the 18px circle retains size/position and becomes solid green with a centered white check. Names use soft gray without strikethrough. Colors transition over 160ms, disabled under reduced-motion preferences. Toggling completion changes neither row height nor indentation.

Completed Checklist entries use an extremely pale green gradient across the whole row, slightly darker on hover. Retain section indentation without changing row height or hiding notes, tags, or tools.

Completion-state addition: strengthen the green gradient slightly and add a 3px green inset-shadow marker at the row's left. Notes/tags drop to 65% opacity. Inset shadow occupies no layout space; names/actions stay clear and usable.

Completed Checklist entries display after incomplete entries and child sections within their own section, including root, retaining relative order. This changes only presentation, without writing order or section membership. Remove Add temporary entry from the header and toggle visibility with Hide completed / Show completed; retain quick-input rows. Template removes that redundant button and offers no completion filter.

- Checklist header reading/editing mode uses checklist/pencil icons (checklist while editing, pencil while reading); hiding completed uses a fixed ListFilter icon. Both express active state with aria-pressed: pale-green background/green icon when active, pale-gray background/body-text icon when inactive; hover retains active highlighting.

- Checklist list metadata uses separate date, completion progress, and archive-status columns. Retain the date column even without an execution date; align progress icons/numbers across rows and use no separator dots. Cards retain left-aligned dates and right-aligned progress.
