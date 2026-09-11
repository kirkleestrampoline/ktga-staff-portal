# Class Library Edit defect

Local implementation completed; no SQL executed, records mutated, commits, pushes or deployment.

## Trace before the fix

`ClassLibrary` sent both View and Edit through `onOpen(p)`. `ClassesView` used the same `open(profile)` handler for Library actions, calendar occurrences and the Master Timetable profile link. It had no explicit editor mode. The whole form used `disabled={busy||!draft.active}`: profile activity was being used as a read-only switch. Published coach and payment selectors additionally used `disabled={published}`. `ClassConsole` always showed only Back to Classes in its footer; Save class lived inside the scrolling form, with no Cancel.

These are confirmed local source defects. The affected Kirklees row and deployed bundle were not queried, so this report does not claim that its stored `active` value was false. The local code did not contain an individual-record `creation_version` check.

## Result

Library View and timetable links explicitly open `view`; Library Edit and Create Draft open `edit` using the same form. Imported records need no creation-version field. Archived records remain read-only, with restoration handled through their lifecycle action. Edit exposes persistent Save changes and Cancel. Busy state temporarily disables edits.

Published safe profile fields, recurrence notes and existing staffing defaults are editable. Published timing, venue, break and operating dates remain protected and the Schedule tab links directly to Change from date. New staffing positions can receive defaults after saving their creation. Unavailable saved coaches remain visible and can be retained or replaced. Existing assignments remain a Staff Rota concern; the saved-payment/Load shifts warning remains visible.

Profile payloads explicitly select editable values instead of echoing database rows. Saves call `classes_command` with `sessions=null` for Published records. The existing lifecycle-version capability comes from the calendar RPC envelope; record version/origin does not determine editability. Club Owner navigation and `is_club_admin(current_club_id())` checks are retained, including tenant-scoped profile, recurrence, coach, category, programme and qualification validation.

## Prepared server change

`supabase/v1_7_3_classes_editor.sql` replaces only the internal save helper and read calendar RPC after verifying the v1_7_2 function fingerprints. Earlier migrations are unchanged. The calendar envelope advertises `editing_version=1`; on older deployments ordinary safe edits remain available, but changed Published staffing defaults produce an explicit upgrade error before any save instead of being silently discarded.

Published `session_defaults` accepts only recurrence ID and staffing entries containing position number, coach ID and payment preference. Published session notes accept only ID and notes. Protected recurrence payload keys are rejected, as are non-null Published session replacements and changed profile duration/operating dates. Existing positions are resolved within the current club's locked class aggregate. Inactive saved coaches can remain; new assignments require an active same-club coach. No scheduled shifts, actual shifts, timesheets, invoices or exclusions are written, and no Load shifts/generation RPC is called.

The migration changes function definitions and ACLs only; it does not repair or backfill records. Its companion `verify_v1_7_3_classes_editor.sql` is read-only and has not been run. SQL regression checks are static contract checks, not database execution or proof of the deployed database state.

## Validation

The full local test suite passed: 223 passed, three skipped. An additional metadata propagation regression was then added and the focused editor suite rerun. Tests exercise actual Library callbacks and form submissions with mocked React state/Supabase transport, including imported Published Edit, View, occurrence routing, protected inputs, coach/payment/notes submission, and old-server capability handling. SQL contract checks cover payload rejection, tenant checks, dated-table write exclusions, metadata propagation, ACLs and matching migration/verifier fingerprints.

Typecheck, production build and `git diff --check` passed. No browser or production database validation was performed.
