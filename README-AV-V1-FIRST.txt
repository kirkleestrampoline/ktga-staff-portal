AV GYMNASTICS SOLUTIONS — V1 ROLLOUT UPDATE

This update is designed to be merged into the existing live portal. Do NOT delete .env.local.

WHAT CHANGES
- Portal renamed to AV Gymnastics Solutions.
- Purple + green branding.
- Mobile slide-out menu fixed and tested at 390px viewport.
- Mobile inputs/buttons enlarged for reliable phone entry.
- Kirklees, Greenhead and Other/Event venues added.
- Staff can be assigned to one or multiple venues.
- Coaches can select their own venues from My Profile.
- Every new shift can be assigned to a venue.
- Staff page shows where each coach works.
- Reports show hours, cost and number of staff by venue.
- Invitation/password setup flow no longer trusts an already logged-in browser session.
- Admin can generate a secure setup/reset link for an existing staff account.
- Admin can permanently delete a test/staff account (with confirmation).

INSTALL — NO REINSTALL REQUIRED
1. Supabase > SQL Editor > New Query.
2. Open SUPABASE-AV-V1-UPGRADE.txt, copy all, paste, Run.
3. Expected: Success. No rows returned.
4. Copy/merge this update into the existing coach-hours-v1 project. Keep your existing .env.local.
5. In VS Code: npm run dev and test locally. No npm install is required.
6. When happy: git add . && git commit -m "AV Gymnastics Solutions v1" && git push
7. Vercel will redeploy automatically from main.

SUPABASE URL CONFIGURATION
Keep your live Vercel Site URL. Redirect URLs should include:
https://ktga-staff-portal.vercel.app/**
http://localhost:3000/**

SAFE ROLLOUT TEST
- Use one coach/test email in a PRIVATE/INCOGNITO window for the first invitation test.
- Invitation should open Create Password and land in that coach account, never admin.
- Add a Kirklees shift and a Greenhead shift.
- Submit August, download invoice, unsubmit, amend, resubmit.
- Admin should see venue badges and venue report totals.
- On a phone, hamburger menu should slide in and all forms should be reachable.
