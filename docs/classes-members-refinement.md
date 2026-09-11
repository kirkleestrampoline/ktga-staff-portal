Local Classes and Members refinement — 11 September 2026

Month now renders complete Monday–Sunday weeks around the selected month, within the existing 43-day RPC limit. Week uses one row per shared profile, ordered by its earliest displayed start time and then name; same-day events stack chronologically and empty cells stay empty. Day/List remain chronological. Existing calendar expansion, publication filters, colour precedence and exclusions are retained.

The Classes form includes colour, break, derived finish, recurrence notes, coaching bounds, lead/assistant requirements, recommended qualifications, staffing warning settings and numbered defaults per recurrence. All tabs are validated before a transactional save. Draft save and explicit publication remain separate; neither generates staffing. Saved recurrence IDs are refreshed before another save, avoiding duplicate active recurrences on repeat edits. Published recurrence edits remain disabled and rejected by the RPC.

Schema gap and unapplied SQL

The original Classes RPC did not accept all existing shared profile settings, recurrence notes or staffing defaults. Its read RPC did not expose selectable coaches/qualifications. The proposed v1_7_1 migration replaces those two RPCs, checks their reviewed Phase 1 body hashes, and adds one slot column: default_payment_type. The UI checks creation_version=2 before saving, so an older database cannot silently discard newly entered fields. The original v1_7_0 migration and generator were not edited in this task.

Master Timetable's payment control updates existing scheduled_shifts; it does not persist a staffing-slot payment default. The proposed column stores the requested preference, but Load shifts deliberately retains its current payment behaviour. Applying that preference automatically to generated staffing is an outstanding integration gap requiring a separately reviewed change. The form states this limitation. No payroll calculation was changed.

The new verification file is read-only and checks the column, RPC body hashes, search paths, security-definer flags and authenticated/anonymous execution. SQL was prepared, not executed or runtime validated. Run Phase 1 verification before the creation upgrade; its old RPC hashes will naturally differ after the upgrade, so use the v1_7_1 verification for those two replacement functions thereafter.

Safety and evidence

No SQL was executed, no Supabase records were mutated, and Kirklees (f55b2e78-e461-4ad7-bd98-c969b77f1cf7) was not used for mutation testing. No commit, push or deployment was performed. Browser fixtures contain synthetic records only and use no application authentication or database connection.

Code inspection and static regression tests confirm Draft exclusion from generation, inclusive published dates, active-slot eligibility, inactive-slot exclusion, the existing slot/date ON CONFLICT guard, and the existing occurrence-exclusion trigger preflight. Save and publish contain no scheduled-shift generation calls or writes to scheduled shifts, actual shifts, timesheets or invoices. These are code-level findings; database runtime and deployed trigger behaviour remain unverified because SQL execution was prohibited.

Validation

- Classes, Members, navigation and login/Members regressions: 82 tests, 79 passed, 3 database integration tests skipped, 0 failures.
- Typecheck and production build passed.
- git diff --check passed.
- Native headless Chrome, using the actual CSS and rendered Members dialog markup plus the shared dialog lifecycle hook: family, creation and deletion consoles passed at 375px, 390px and 1280px viewport widths. Long family/contact/athlete content and deletion lists scroll to the end; header/footer remain visible, no horizontal overflow, background is locked, keyboard Tab stays modal and close restores focus. Desktop retains centred bounded dialogs.
- Hook tests simulate Safari-style changing chrome heights, keyboard contraction and restoration, and nested-dialog scroll locks. Actual iPhone Safari, hardware keyboard and device safe-area behaviour still need manual acceptance. Chrome emulation is not a Safari runtime test.

Exact task file inventory (relative to repository root)

- app/globals.css
- components/classes/class-calendar.tsx
- components/classes/classes-view.tsx
- components/classes/classes.css
- lib/classes/model.ts
- lib/classes/draft.ts (new)
- components/members/member-console.tsx
- components/members/member-editor.tsx
- components/members/member-delete.tsx
- components/members/use-member-dialog.ts (new)
- supabase/v1_7_1_classes_creation.sql (new, unapplied)
- supabase/verify_v1_7_1_classes_creation.sql (new, unapplied)
- tests/classes-phase1.test.cjs
- tests/classes-presentation.test.cjs
- tests/members-console.test.cjs
- tests/members-experience.test.cjs
- tests/member-dialog-dom.cjs (new)
- tests/members-layout.browser.cjs (new; requires local headless Chrome on port 9333)
- docs/classes-members-refinement.md (this report)

The workspace already contained uncommitted Classes, navigation and dashboard changes. Those were retained. next-env.d.ts was regenerated by the build and its development type-import paths restored afterward.

Greenhead-only manual acceptance (after separate migration review/application)

1. Verify the active club is Greenhead. Create one synthetic Draft with multiple weekly recurrences, including two on one day, different venues, notes, coach positions and payment preferences. Save, reopen and confirm all fields/defaults persist. Confirm the payment preference limitation described above.
2. Check Month/Week/Day/List, time ordering, profile grouping, empty weekdays, filter counts, badges, colour precedence and horizontal scrolling. Open a class from each view.
3. Publish explicitly. Confirm Master Timetable shows the same profile/recurrences and that publishing created no staffing. Confirm published dates, duration and recurrence controls remain protected.
4. Only when separately authorised for Greenhead test data, use Load shifts twice and check inclusive dates, active slots, exclusions and no duplicate slot/date assignments; compare pre-existing operational records before/after.
5. On an actual iPhone at 375/390px equivalents, open long family details, edit and deletion confirmation. Scroll with browser chrome expanded/collapsed, open the keyboard, reach the last field/action, cancel safely and confirm focus/scroll restoration. Repeat keyboard-only and desktop checks. Do not test mutations in Kirklees.
