AV GYMNASTICS SOLUTIONS — V1 LAUNCH UI
======================================

This update is designed to go over the AV Gymnastics Solutions V1 version after the venue/Supabase V1 upgrade has already been run.

NO NEW SUPABASE SQL IS REQUIRED FOR THIS UPDATE.
NO NEW NPM PACKAGE IS REQUIRED.
DO NOT REPLACE .env.local.

WHAT CHANGED
- Mobile navigation no longer relies on the hamburger/sidebar.
- Phone bottom navigation is always visible: Home / Hours / Invoices / Profile / More.
- Admin More sheet contains Staff / Reports / Settings / Profile / Sign out.
- Mobile timesheet is now a simple shift list rather than a squeezed 7-column calendar.
- Large Add Shift action on phone.
- Copy Previous Month and Repeat Weekly remain available.
- Existing shift cards are tap-to-edit.
- Submit / Unsubmit / Paid controls remain at the bottom of the timesheet.
- Desktop sidebar and desktop month calendar remain unchanged.
- Phone modals remain full-width bottom sheets with 44px+ controls and 16px inputs.

INSTALL
1. Make sure the current AV version works locally.
2. Copy the contents of this update into your existing project folder.
3. Keep your current .env.local.
4. Stop the local server with Control+C.
5. Run: npm run dev
6. Test phone + desktop.
7. When happy: git add . && git commit -m "AV launch mobile UI" && git push

LOCAL CHECKS PERFORMED BEFORE PACKAGING
- TypeScript parser: 0 syntax diagnostics across .ts/.tsx source files.
- CSS parser: 0 stylesheet parse errors.
- Confirmed mobile nav and mobile shift-list selectors are present in final source.
- Confirmed desktop sidebar/calendar remain present.
- Final ZIP integrity check performed after packaging.

NOTE
A full live Supabase/Vercel end-to-end login can only be verified against your deployed environment, so do one admin + one coach smoke test before sending the link to all coaches.
