# Classes Phase 1 — application and SQL handover

Implementation is local only. No production SQL, live mutation tests, commits, pushes or deployments were performed. The supplied `Supabase Snippet Untitled query.csv` was read from Downloads; its record is the Classes/Master Timetable catalog export. The export itself is not copied into the repository.

## Architecture and operational protection

`class_profiles` remains shared configuration; `classes` remains weekly recurrence; `class_staffing_slots` remains staffing requirements; `scheduled_shifts` remains dated assignments. No second timetable or independent occurrence table is created. The new activity table contains class-editor action labels, not dated session entities.

Existing profiles receive Published/Internal metadata through constant column defaults, without UPDATE statements or profile propagation. Archived profiles retain their existing inactive flag. Existing dates remain unrestricted (`start_date`/`end_date` null). Existing slots receive `active=true`. Other new metadata is null. No names, capacity, ages, times, venues, default coaches or assignments are backfilled or normalised. Existing free-text programme labels remain intact; administrators can explicitly assign a managed programme later.

The migration takes short-timeout locks and records row counts/value fingerprints for profiles, recurring classes, slots, scheduled shifts, actual shifts, timesheets, invoices, exclusions and venues. Before commit it checks all counts and original values, stripping only newly added metadata for comparison. Scheduled shifts additionally have an exact bidirectional EXCEPT comparison against a temporary snapshot. Any failure rolls back the transaction. No generator or sync RPC is invoked.

Master Timetable markup and styles are unchanged. Its loaders hide Drafts and inactive slots. Reductions deactivate slots instead of deleting them; reactivation preserves IDs. Requirements-only changes skip legacy schedule sync/payment updates. Ordinary explicit time/default-coach changes remain in the existing Master Timetable path. New classes created through that legacy editor also default to Draft and direct the administrator to Classes for publication.

Classes saves never update or delete scheduled/actual shifts, timesheets or invoices. Published weekday/time/venue and start/end/duration controls are read-only, with server validation. Published classes whose existing duration projections disagree are rejected rather than silently retimed. Editing shared profile fields still uses the established profile projection trigger. Metadata-only changes do not invoke it.

Publication is an explicit confirmation and a transaction; it changes only publication metadata and records an activity label. Administrators must generate the staff schedule separately. The reviewed generator retains its original loop, permissions, insertion values, conflict handling and exclusions trigger, with only publication, date-range and active-slot predicates added. A before-insert gate also prevents legacy copy/direct insertion paths from inserting Draft or inactive-slot assignments. No clone/copy/confirmation/cancellation/sync function bodies are rewritten.

Only relevant existing class/schedule RPC execution ACLs are hardened: PUBLIC/anon access is removed, authenticated behaviour retained, and trigger-only functions removed from authenticated/service-role execution. Unrelated security hardening is not included.

## Files

- `supabase/v1_7_0_classes_phase_1.sql` — one forward migration.
- `supabase/verify_v1_7_0_classes_phase_1.sql` — one catalog-only JSON verification query.
- `lib/classes/model.ts` — date expansion, exclusions, filtering and coverage.
- `lib/classes/data.ts` — narrow read/save/publication RPC client.
- `components/classes/classes-view.tsx` — calendar, class editor and taxonomy management.
- `components/classes/class-console.tsx` — Schedule Control console structure and focus restoration.
- `components/classes/classes.css` — Classes-scoped styling.
- `app/dashboard/ui.tsx` — navigation rendering, Draft filtering and safe slot lifecycle integration.
- `lib/navigation.ts`, `types/navigation.ts` — enable Classes for administrators.
- `tests/classes-phase1.test.cjs`, `tests/navigation.test.cjs` — isolated tests and navigation expectations.
- `docs/classes-phase-1.md` — this guide.

The existing production-inspection SQL file is from the previous task. Pre-existing edits in `app/globals.css` are not part of this implementation and were left untouched.

## Manual SQL application steps — not performed

1. Review the forward migration with the production export. Do not replay any old scheduling migration. The generator and profile/exclusion function fingerprints must still match the supplied export; drift deliberately aborts the migration.
2. First apply to an isolated staging database with the same schema/functions and synthetic data. No test should use Kirklees operational data. Review the RLS/ACL scope and exercise the failure/rollback cases below.
3. Schedule a quiet production window. The migration uses a two-second lock timeout and a 60-second statement timeout. It may fail while Kirklees is actively writing; do not remove the safeguards to force it through. Its snapshots can need substantial temporary memory/storage on a large database.
4. Paste the entire migration into SQL Editor and execute as a single transaction only when approved operationally. A failure means rollback; investigate the failing preflight/assertion before retrying. Never manually run isolated fragments.
5. Run the read-only verification query. Require `catalog_passed=true`, inspect every returned check and retain the result. It verifies catalog configuration, not runtime behaviour or historic immutability of unrelated workflows.
6. Release the matching application only after SQL passes. The new editor and active-slot writes require this schema. SQL execution and release remain manual; neither was performed here.
7. Perform creation/publication acceptance only in Greenhead or a dedicated test club. Kirklees ID `f55b2e78-e461-4ad7-bd98-c969b77f1cf7` is strictly excluded from all mutation tests.

## Detailed manual acceptance — Greenhead or isolated test club only

1. **Baseline/rollback:** In staging, capture synthetic table counts and complete scheduled-shift rows. Apply the migration and compare them. Existing active profiles are Published/Internal; inactive flags and all operational values are unchanged. Alter a guarded function in a separate disposable fixture and confirm preflight aborts. Test lock contention and confirm timeout leaves no partial schema.
2. **Categories:** Create two arbitrary category names, colours and display orders. Rename and reorder them; archive and restore one. Confirm no hard-coded options and no visibility from a different club account.
3. **Programmes:** Create a programme with and without a category and description. Change its colour and archive/restore it. Cross-club category/programme IDs must be rejected by the RPC. Existing class relationships to archived taxonomy remain visible.
4. **Draft creation:** Create a Draft with capacity, ages, eligibility, description, visibility, start/end dates and two weekly sessions. Save. Confirm one shared profile with the two recurrence rows and numbered slots. No scheduled-shift counts change. It must appear in Classes/library but not Master Timetable.
5. **Draft exclusion:** On synthetic data only, call monthly generation while the class is Draft. No rows for that class should appear. Exercise legacy insertion/copy paths against the Draft in staging; the insert gate must exclude it without altering existing target rows through the Classes feature.
6. **Draft editing:** Change venue, weekday, start, duration and recurrence count; validate required fields, reversed ages/dates, duplicate recurrence and excessive coaches. Failed saves roll back completely. Retired recurrence IDs are not deleted. Repeated clicks while saving cannot submit twice.
7. **Calendar:** Exercise Week/Day/List, Today, previous/next, date picker, month/year and DST boundaries. Start/end dates are inclusive. A class is shown once per recurrence/date regardless of coach count. A week without generated staffing still displays classes with unknown coverage. Test at 375px width and keyboard-only; closing a console restores focus/scroll.
8. **Filters/colours:** Test category, programme, venue, Draft/Published/Archived, visibility and staffing filters individually and combined. Programme colour wins when selected, otherwise category, otherwise legacy class colour. Archived classes are hidden by default; library exposes classes outside the current week.
9. **Publication:** Save then choose Publish. Cancel confirmation first: nothing changes. Confirm: the class appears in Master Timetable, remains Internal unless explicitly labelled Public, and no staff shifts are generated or confirmed. Repeated publish is idempotent. Missing start date/venue/slots must fail validation.
10. **Published editing:** Weekday/time/venue/duration/date fields are read-only. Submit a crafted Classes save request containing published sessions or changed dates/duration in staging: it must fail. Change category, description, capacity and staffing; confirm scheduled/actual shifts remain byte-for-byte unchanged.
11. **Slot lifecycle:** Generate synthetic staffing, including confirmed and linked actual records, then reduce requirements through Classes. Extra slots become inactive and all IDs, defaults, exclusions and scheduled/actual values remain unchanged. New month generation ignores inactive slots. Increase requirements: matching slots reactivate with their original IDs/defaults. Direct deletion of a slot referenced by scheduled shifts or exclusions must fail. Repeat requirements-only reduction in Master Timetable.
12. **Coverage/exclusions:** Test a whole-class null-slot exclusion, individual slot exclusions, all current slots excluded, partial generation, cancelled rows and unassigned rows. Partial generation or dated time/venue mismatches show unknown coverage. Known complete rows show covered/understaffed/cancelled. Re-running generation does not duplicate a slot/date or reinsert an excluded slot/date.
13. **History:** Compare synthetic past, confirmed, submitted/paid-linked assignments and actual working times before/after Classes metadata saves, publication and requirement changes. None change. This does not certify unrelated legacy correction/unconfirmation workflows.
14. **Access:** Authenticated administrators retain legitimate class/schedule RPC behaviour. Anonymous/PUBLIC execution is absent; trigger-only functions cannot be called as API RPCs. Another club administrator and a coach cannot use the Classes RPCs to read/edit this club. Public visibility must not grant anonymous access.
15. **Missing schema/data errors:** With unavailable RPCs or a failed read, the UI shows an error and disables creation rather than reporting empty/covered staffing. Activity displays new Classes actions only, without inventing historical events.

## Known boundaries / Classes Phase 2

- Effective-date changes to published recurrence and term dates, and safe historical versioning.
- Public-facing calendar/booking, enrolment, waiting lists, attendance and live capacity utilisation. Public/Internal is metadata only.
- Training-area subdivisions and resource conflict checking; Phase 1 uses existing venues.
- One-off class events and general exception editing; this calendar is recurring classes only.
- Full activity history for edits performed outside Classes and richer audit detail.
- Existing occurrence exclusions are slot-scoped unless `staffing_slot_id` is null. Adding an entirely new slot can create a previously nonexistent slot/date despite old slot-specific exclusions; this inherited behaviour is not redefined here. Review such dates when increasing staffing. Blanket class/date cancellation semantics need a separately reviewed workflow.
- Calendar events follow recurrence times; dated staff time/venue overrides cause unknown coverage and remain managed in Staff Rota.
- This feature leaves existing copy/clone/sync/confirmation bodies alone. It does not claim global historical immutability for every legacy staff-management operation.

## Automated validation

Targeted Classes/navigation tests use only in-memory fixtures and mocked RPC clients. SQL checks are static/source checks; no SQL, including staging SQL, was executed during implementation. TypeScript and the final production build passed locally. A build was repeated after the final slot-reactivation correction. The build overrides Supabase URL/keys with local dummy values to avoid the configured live service.

Validation results: **29/29 targeted tests passed** (16 Classes tests and 13 navigation tests); `npm run typecheck` passed; final `npm run build` passed, generating all 17 pages. Build-only Supabase environment overrides pointed to `http://127.0.0.1:9` with dummy keys. No browser-based or database runtime acceptance tests were run.

## Temporary-baseline correction and disposable validation

The corrected complete migration keeps creation, snapshot capture, DDL and final assertions inside one server-side `DO $classes_phase1_migration$` block, still enclosed by the original BEGIN/COMMIT. Both temporary tables are explicitly qualified with `pg_temp` and retain `ON COMMIT DROP`. Creation and pre-comparison assertions check their existence; verification also requires all nine fingerprint entries and a scheduled snapshot count matching the captured count. It never recreates a missing baseline at verification time. Both directions of EXCEPT and all original value/count/default assertions remain.

The original file already created both tables unconditionally before use and had no intermediate COMMIT. Empty CTAS creates a table normally. Therefore the reported error cannot be attributed to zero rows or original ordering; it establishes that the assertion ran without the corresponding temporary relation. Standalone/autocommitted execution of ON COMMIT DROP creation reproduces that error. The supplied error alone does not establish whether the editor ran a fragment, split requests or changed sessions.

Subsequent validation supersedes the initial static-only SQL validation above: the entire corrected migration was executed in an isolated PGlite PostgreSQL-compatible runtime under `/private/tmp/classes-migration-validation`, using synthetic rows and catalog-derived column/function definitions, never the configured Supabase connection. Twelve scenarios passed: empty data; populated data; atomic block under autocommit; each baseline missing; fingerprint baseline emptied; scheduled row deletion; scheduled row addition; scheduled value change; actual-shift fingerprint change; invoice row-count change; and reproduction of early ON COMMIT DROP. Every injected failure rolled back schema changes and retained original synthetic scheduled rows. Temporary tables disappeared only after successful commit. Eighteen Classes tests also passed, including two new baseline regression checks.

This validates the complete SQL and baseline lifecycle against a compatibility fixture, not the entire hosted Supabase environment or production concurrency. No production SQL was executed. Run the full corrected file from BEGIN through COMMIT in one SQL Editor execution; never run a selected verification fragment. No application, feature, generation/sync body or operational-data safeguard was changed by this correction.
