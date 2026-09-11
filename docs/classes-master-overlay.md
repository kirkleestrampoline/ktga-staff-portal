# Master Timetable shared Class Console integration

Implemented locally. SQL, database records and existing migrations are unchanged. No commit, push or deployment.

## Exact cause

`app/dashboard/ui.tsx` previously implemented `openEditClass(c)` by setting `classesRequestedId`, closing Master Timetable and calling `setTab("classes")`. That navigation changed the dashboard/query destination and removed the timetable context. `ClassesView` consumed the requested ID using `open(p,'view')`, with no Edit class action. It fetched the full profile, so the original fault was not an incomplete profile or a second editor implementation; it was navigation plus unconditional View mode without an edit transition.

## Changes

- `app/dashboard/ui.tsx`: recurring-class clicks set `masterClassConsole` with the profile ID and return context. The existing schedule and Master panel remain mounted. Class refresh replaces only hydrated templates and active staffing slots, using the read RPC result; it leaves scheduled assignments and date/filter/expansion state alone. Existing active/Published, venue, effective-date and active-position predicates remain unchanged. Only the optional Open in Classes action navigates from the overlay. Club Owner/administrator access is passed from the existing `isAdmin` check.
- `components/classes/master-class-overlay.tsx`: a small host for the shared ClassesView overlay. It restores the captured context after child dialog cleanup. It contains no editor or mutation implementation.
- `components/classes/classes-view.tsx`: overlay presentation hides page navigation, loads the full club-scoped class, starts in View and offers Edit class when authorised. It uses the same form and `classes_command` save as Class Library. Permission checks also guard submission. Refreshes do not reopen the initial profile or reset the selected editor tab. Success feedback expires after 4.5 seconds; a read-refresh failure offers retry without repeating the save. Change from date stays in the shared lifecycle flow.
- `components/classes/class-console.tsx`: permits the overlay host to own focus/scroll restoration while retaining Library behaviour.
- `lib/classes/console-context.ts`: captures the actual clicked element, window position and ancestor scroll positions, then restores them without focus-induced scrolling. Timetable rows and action buttons retain stable DOM identity across class refresh.
- `components/classes/classes.css`: contains overscroll, keeps body scrolling internal and footer actions wrapping within the existing dynamic-viewport dialog sizing, with safe-area padding.
- `tests/classes-master-overlay.test.cjs`: covers route/state isolation, profile selection, authorised Edit, read-only submission rejection, command/read refresh sequence, stable editor tab, temporary feedback, close/focus/scroll restoration, class-only refresh and existing visibility predicates.

Published weekday, time, duration, break, venue and operating dates remain protected. Staffing defaults retain the existing v1_7_3 capability check and Load shifts warning; this change neither modifies SQL nor bypasses that capability. All safe saves continue through the v1_7_2 `classes_command` API. No legacy direct class writes, generation calls, or scheduled/actual/timesheet/invoice writes were introduced.

## Validation

Full local suite: 230 passed, three skipped (including Classes, navigation and scheduling/actual-time coverage). Focused overlay/editor tests, TypeScript checking, production build and `git diff --check` passed. Tests use mocked transport and DOM context; no production data or browser session was accessed. Mobile sizing is covered by the shared CSS contract, not a real-device verification.
