AV GYMNASTICS SOLUTIONS v1.1 — FINAL LAUNCH FEATURES
=====================================================

THIS UPDATE ADDS
- Admin "Submit on behalf" for coach timesheets.
- Submission records who submitted the month.
- Audit/activity history hidden by default behind "View activity history".
- Kirklees / Greenhead each have their own legal invoice name, address, prefix and payment note.
- A monthly submission automatically creates one invoice per organisation represented in that month's shifts.
- Super Admin (all organisations), Organisation Admin (selected organisation only), Coach roles.
- Organisation admins only see/manage staff and shifts within their organisation scope (database RLS enforced).
- Regular shift templates: save normal weekly shifts once and "Fill month" in one tap.
- Existing Copy Previous Month remains available.
- Dashboard shows an organisation summary rather than a busy audit feed.

INSTALL ORDER
1. Run SUPABASE-V1.1-LAUNCH-UPGRADE.txt in Supabase SQL Editor. Expected: Success. No rows returned.
2. Copy/merge this update into your existing project. KEEP .env.local.
3. Restart locally: npm run dev
4. Test locally with admin + one coach.
5. Commit/push to GitHub; Vercel deploys automatically.

IMPORTANT ORGANISATION SETUP
After the migration, log in as Super Admin and go to Invoice settings.
Complete BOTH Kirklees and Greenhead:
- Legal / invoice name
- Invoice address
- Invoice prefix
- Payment note

GREENHEAD ADMIN
As Super Admin:
Staff > edit/invite the person > Account type = Organisation admin > select Greenhead > tick "Admin for this organisation" > Save.
That account will get admin pages but Supabase limits its data to Greenhead-related staff/shifts/invoices.

REGULAR SHIFTS ON MOBILE
Hours > Regular shifts > Add regular shift(s) once > Fill month.
Then the coach only edits exceptions, which is the fastest normal monthly workflow.
