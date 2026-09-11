Classes management handoff — 11 September 2026

Classes now opens to Class Library, with Timetable (Month/Week/Day/List) and Categories & Programmes as separate internal sections. The library searches and filters the same club-scoped profiles and recurrences, includes ended history, and exposes Edit/View, End, Archive/Repair archive, safe Restore and guarded Draft deletion. Master Timetable management links open Classes; the staff view and Load shifts remain separate.

Ghost class: what is established and what is not

The exact code-level escape is in the old overview hydration path: loadOverviewSchedule fetched only active class_profiles, while hydrateClassSessions returned the original active recurrence unchanged when its profile was absent from that response. An inactive profile with an active recurrence therefore disappeared from the default Classes calendar but survived the overview's filter(item => item.active). The ordinary schedule loader fetched all profiles, so the two loaders could disagree.

Two other discrepancies mattered: the old generator required a Published profile but never required profile.active; Master Timetable did not apply profile operating dates and could deliberately include archives through Show Archived Classes. The old Restore RPC reactivated every recurrence indiscriminately, including previously retired recurrences, and did not restore a captured slot state.

The actual “test” record was NOT queried. Its precise stored flags, selected-date/exclusion state and whether the archive toggle was involved cannot be established from local code alone. The prepared JSON diagnostic shows these stored flags and identifies the fallback/generator risk for the named class once a reviewer supplies Greenhead's verified club ID. No claim is made that a specific production row has been repaired.

The fix fails closed when a profile is absent, requires active + Published profile and active recurrence with valid dates, and requires an active venue and staffing position in the staff view. The server insertion trigger applies the same lifecycle bounds to every linked generation/copy INSERT and locks the profile against concurrent lifecycle changes. The generator's eligibility predicates now include profile activity and recurrence-version dates. Existing occurrence-exclusion triggers and idempotent slot/date insertion remain intact.

SQL prepared, not applied

- supabase/v1_7_2_classes_lifecycle.sql
- supabase/verify_v1_7_2_classes_lifecycle.sql

These are the only new migration/verification files for this task. v1_7_0 and v1_7_1 were compared byte-for-byte with the starting copies and were not edited.

The migration expects the reviewed v1_7_1 function bodies and fails closed on function, trigger, uniqueness-index or date-constraint drift. It uses 2-second lock and 60-second statement timeouts. Snapshots, DDL and rollback assertions live in one atomic server-side block, retaining fingerprints for ten existing tables. No generation, synchronization or existing-record DML runs during migration. It adds recurrence effective_from/effective_to/duration_minutes, a profile archive snapshot, a version-aware uniqueness index and an independent insert-only audit table. Legacy profiles may have an unbounded start with an inclusive end.

All management uses classes_command, with tenant/admin validation, aggregate locking and a request receipt for repeat submissions. It returns saved recurrence IDs/defaults in the same transaction, so another save does not depend on a follow-up read. Direct authenticated class/profile/slot mutations are revoked, along with direct access to the internal save/publish helpers. Deploying this migration requires the matching Classes UI; stale Master Timetable editors must not keep issuing partial direct writes. Existing dated staffing permissions are unchanged.

Lifecycle behaviour

- End takes an inclusive final date, retains the active profile as ended history and blocks new generation after that date. Existing generated records after the end are retained. Extension uses Change from date.
- Archive atomically deactivates the profile, recurrences and slots while preserving IDs and operational records. Repair archive handles a legacy inactive profile with active child rows after deployment. Restore uses only the captured active IDs; it refuses a legacy archive with no safe snapshot and never blindly revives retired versions. Existing end dates still apply after Restore.
- Permanent deletion is restricted to unused Drafts, requires exact class-name confirmation, and makes a fresh dependency check under locks. It scans conventional UUID references and foreign keys (including other schemas and future references) to the profile, recurrences, slots and activity. Any scheduled/linked worked/confirmed/payroll, exclusion, coaching, attendance or enrolment dependency blocks deletion. Linked worked shifts, timesheets and invoices are also protected by their surviving scheduled/aggregate references. It cannot reconstruct relationships already removed by earlier privileged data deletion. Draft activity and aggregate identifiers are copied to the independent audit before only the unused aggregate is deleted. No operational cascade is introduced.

Safe metadata edits after the reviewed upgrade

Name, category, programme, class colour, description, capacity, ages, eligibility, visibility, lead/assistant requirements, coaching bounds, warning settings, recommended qualifications and recurrence notes. Imported published classes are no longer rejected merely because their recurrence durations differ from the shared default. Metadata propagation preserves recurrence start/finish times; no generated, actual, timesheet or invoice rows are written. The shared default duration is distinct from each version's actual start/finish time.

Changes that use effective-date versioning

Weekday, start time, duration, break, venue and operating dates. Change from date ends the old valid period on the previous day and creates future rows within the existing classes table, with new staffing IDs and copied defaults. The old recurrence's timing, venue and identifiers remain. No shifts are loaded. Moving an as-yet-unused future start earlier is permitted only to a future date, under the same fresh history checks.

The server rejects dates on/before today, changes overlapping generated records or exclusions (including cancelled work), and dates colliding with an existing planned version. Unknown attendance/enrolment/other operational references fail closed for separate review rather than being rewritten. Date changes after a class has been Ended preserve the old end boundary before allowing the new future period.

Validation

- Classes, Members, navigation and login/Members regressions: 102 tests; 99 passed, 3 database integration tests skipped, 0 failed.
- Typecheck passed after removing duplicate generated .next/types declaration copies; these were backed up under /tmp. next-env.d.ts was restored to its starting content after the build.
- Production build and git diff --check passed.
- Tests cover default Library presentation, archive visibility, eligibility/date boundaries, recurrence versions, command transport, duplicate-submit latches and the SQL's dependency, permission, preservation, drift and receipt safeguards.
- No SQL was executed, including local database tests. SQL checks are static/source checks; database permissions, constraint/trigger execution, concurrent requests and migration runtime remain unverified until separately authorised acceptance. The build is not proof that a database migration will execute successfully.

Exact task file inventory

- app/dashboard/ui.tsx
- components/classes/classes-view.tsx
- components/classes/classes.css
- components/classes/class-library.tsx (new)
- components/classes/class-lifecycle.tsx (new)
- lib/classes/model.ts
- lib/classes/data.ts
- lib/classes/draft.ts
- lib/classes/lifecycle.ts (new)
- supabase/v1_7_2_classes_lifecycle.sql (new)
- supabase/verify_v1_7_2_classes_lifecycle.sql (new)
- tests/classes-lifecycle.test.cjs (new)
- docs/classes-authority.md (new)

Earlier uncommitted dashboard, navigation, Members and Classes work was retained. No Supabase records were changed. Kirklees f55b2e78-e461-4ad7-bd98-c969b77f1cf7 was not used for mutation testing. No commit, push or deployment was performed.

Greenhead-only acceptance after separate review/application

1. Verify the active club is Greenhead. Supply its verified ID in the read-only JSON diagnostic; inspect the named “test” profile/recurrence flags and catalogue checks. Do not change a Kirklees record. If the target is a Greenhead archive with active children, use Archived → Repair archive and confirm the children are inactive.
2. Create and save a synthetic Draft twice, checking stable profile/recurrence IDs. Publish explicitly, confirm it appears in the selected-date Master Timetable, and confirm publication created no shifts. Edit imported-class metadata and notes; compare existing dated/actual/payroll records.
3. End on an inclusive date, Archive, and Restore a test class with a captured snapshot. Confirm ended-date filtering and that retired slots/versions stay retired. Do not treat a legacy archive without a snapshot as safely restorable.
4. Delete an unused Draft with its exact name. Test deletion refusal for dependent test records and verify the independent audit. Verify coach, anonymous and cross-club attempts are denied on authorised test accounts.
5. Choose Change from date after all generated work/exclusions. Check old/new boundaries, retained historic IDs/defaults, rejection at conflicting dates and repeated-request behaviour. Only with separate Greenhead test authorisation, use Load shifts twice and verify no duplicate staffing. Compare protected records before/after.
