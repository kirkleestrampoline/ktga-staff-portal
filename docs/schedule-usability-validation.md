# Class and schedule usability fixes

Implemented locally. No SQL changes, database mutation tests, commits, pushes or deployments.

## Findings and changes

1. **Class Console sizing:** the native dialog also carried three legacy modal classes and only a maximum height, leaving its height dependent on section content. In Chrome at 1280 × 800, the committed CSS produced heights of **736 → 472 → 272px** as content shortened; returning to long content restored 736px. An irreversible cumulative width/height reduction was not reproduced with synthetic data. No recursively nested class wrappers or repeated viewport-subtraction calculation was found. The old effect independently saved/restored body overflow and did not handle keyboard viewport changes. The console now has one isolated, fixed-size grid shell, an internally scrolling body and persistent header/footer. It reuses the Members reference-counted dialog hook for native focus containment, focus return, page locking and visual-viewport updates. Overlay owners still restore the original trigger's scroll ancestors.
2. **Edit access:** the View footer exposed Edit only when `overlay` was true. All authorised active-class views now expose Edit immediately. Linked class actions in dated shift management, confirmation, actual-time correction, staffing recommendations and assignment use the same Classes editor/`classes_command` overlay. Originating consoles remain mounted; filters, date and scroll context are retained. The legacy Rota Escape listener now defers to native dialogs. One-offs/unresolved links and non-admins receive no class action. Archived classes retain their existing restore-before-edit rule. Published timing still uses Change from date; generated assignments and dated corrections retain their existing workflows.
3. **Mobile toolbar:** mobile hides the desktop Configuration bar and uses an embedded toolbar. Its existing three-column action row reserved only 54px for More, hid its text, and used 30–38px controls. Scoped CSS now provides distinct date/view/action rows, a full-width Add shift action, paired secondary actions, readable More, and 44–46px targets. Existing menu actions and desktop controls remain available.
4. **Actual times:** the previous multi-column confirmation rows always showed both small time inputs. Batch saving stopped on the first error without a per-shift outcome ledger. Each shift now has a staff/class card, scheduled summary, default As scheduled state, expandable actual controls, break input, duration/change summary, end-only reductions based on scheduled end, custom reduction, selected-choice styling and reset. Invalid values never fall back to scheduled times. Save results retain successful IDs, display individual failures, and select only failures for retry. A synchronous in-flight guard prevents double submission.

The existing `confirm_scheduled_actual` / `request_scheduled_overtime` RPCs support the required payloads. Their actor, club, submitted/paid and overtime checks remain authoritative and unchanged. Client validation uses their midnight rollover convention (an end clock before start means next day), rejects equal times and invalid breaks, and labels next-day ends. Quick reductions additionally reject crossing the explicitly edited start/break boundary. No SQL gap was found by inspecting the local RPC definitions; deployed RPC availability was not tested.

## Files

- `components/classes/class-console.tsx`, `classes-view.tsx`, `classes.css`: stable shell and shared View/Edit access.
- `components/actual-time-card.tsx`: selected-shift actual-time interaction.
- `lib/timesheet-actual.ts`: validation, reductions, reset and batch outcomes.
- `app/dashboard/ui.tsx`: linked-class actions, Escape handling and batch confirmation integration.
- `app/globals.css`: scoped schedule toolbar and actual-time card layouts.
- `tests/classes-editor.test.cjs`, `classes-master-overlay.test.cjs`: access/context expectations.
- `tests/schedule-usability.test.cjs`, `schedule-usability.browser.cjs`: calculation, payload, validation, retry, duplicate submission and layout regressions.

## Validation

- Node suite: **238 passed, 3 skipped, 0 failed** (241 tests). The skipped tests require explicitly enabled database integration; they were not run.
- Typecheck, production build and `git diff --check`: passed.
- Synthetic headless Chrome: **375 × 800, 390 × 800 and 1280 × 800**. Twelve open/close cycles per size, each switching short/long content; stable dimensions (375 × 800, 390 × 800, desktop 820 × 760), visible footer, no dialog overflow, native Tab containment, focus return and released body lock.
- Actual cards rendered in the daily-confirmation shell: readable time inputs at least 200px wide and 44px tall; no horizontal overflow. Mobile toolbar including expanded More menu: visible controls at least 44px tall and inside viewport bounds.
- Mobile viewport reduced to 420px height to exercise the shared viewport-resize hook. This is a simulation, **not a real software-keyboard test**.
- Layout fixtures use the real components/CSS with synthetic text and stubbed handlers; they do not constitute authenticated end-to-end or RPC integration tests.
- Two pre-existing duplicate generated `.next/types/* 2.ts` files caused a typecheck error after building; moved to `/tmp/av-generated-types-backup`, then reran checks. No tracked source was changed for this.

## Manual acceptance checklist

Use a local/test tenant with synthetic shifts only:

- Open Library and Classes calendar views, switch all sections, enter Edit, cancel/save and reopen repeatedly; confirm stable dimensions and original filters/date/scroll.
- Repeat from Master Timetable, shift management, staffing recommendations and assignment. Escape should close only the class editor and return focus to its opener.
- Verify non-admins and unlinked one-offs show no Edit class; published timing still requires Change from date, and template edits do not rewrite generated assignments.
- At 375px/390px, open More and exercise every configuration action. Check real iOS Safari and Android Chrome keyboard opening, rotation, internal scrolling and footer reachability.
- Confirm As scheduled; edit start, then choose 5/10/15/30/custom earlier repeatedly. End must always be based on scheduled end, with edited start retained. Reset must restore start/end/break.
- Try blank/equal times, excessive breaks and overnight work. Check summaries and errors before confirming.
- Simulate an RPC failure/locked month for one shift in a multi-shift batch. Verify exact actual payloads, successful/failed identities, failure-only retry and double-click protection.
