AV GYMNASTICS SOLUTIONS V1.1.1 — FINAL LAUNCH POLISH

WHAT THIS FIXES
1. Super/organisation admins can reopen a PAID month, correct it and resubmit it.
   Coaches themselves still cannot alter a paid month.
2. Inviting an Organisation Admin now preserves the org_admin role instead of
   the database trigger silently changing it back to coach.
3. Organisation Admin dashboards/reports/filters show only organisations they administer.
4. Mobile admin screens no longer rely on wide desktop tables:
   - Dashboard Monthly Status
   - Timesheets overview
   - Invoices
   - Staff
   - Cost by coach
   now use stacked phone cards.
5. Organisation summary is stacked on narrow screens.

INSTALL
1. Supabase > SQL Editor > New Query.
2. Run SUPABASE-V1.1.1-FINAL-FIXES.txt.
3. Merge app/ and the updated source files into your existing project.
4. Keep .env.local unchanged.
5. npm run dev and test locally.
6. git add .
   git commit -m "AV Gymnastics final launch fixes"
   git push origin main

NO npm install is required.
