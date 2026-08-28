KTGA STAFF PORTAL v0.3 — WORKING MONTH-ONE RELEASE
=================================================

THIS IS A REAL SOURCE UPDATE, NOT A PLACEHOLDER.

WHAT IS INCLUDED
----------------
Coach:
- Real Supabase login / logout / password reset.
- Invitation password setup page.
- Own profile: contact, address, bank details, UTR, emergency contact.
- DBS, First Aid, Safeguarding and qualifications fields.
- Monthly calendar.
- Add, edit and DELETE shifts.
- Repeat a weekly shift across the month.
- Copy previous month's weekday pattern.
- Monthly hours and estimated invoice value.
- Submit month.
- Automatic secure invoice generation.
- Unsubmit and correct until the invoice is paid.
- Paid months locked.
- Invoice archive.
- Download invoice as PDF.

Admin:
- Dashboard totals.
- Staff directory and search.
- Edit staff details.
- Set hourly rate (coach cannot change their own rate).
- Active / inactive status.
- Open any coach's timesheet.
- Add/edit/delete a coach's draft shifts.
- Reopen submitted month for correction.
- Mark submitted month paid.
- Invoice archive and PDF download.
- Business name/address/payment note/cut-off settings.
- Monthly cost report.
- Audit trail.

DATABASE SECURITY
-----------------
- Coaches can only read/edit their own shifts/profile.
- Coaches cannot change their own hourly rate, role or active status.
- Coaches cannot directly manufacture invoices or mark themselves paid.
- Submitted months are database-locked for coaches.
- Invoice hours/rate/total are calculated in Supabase when the coach submits.
- Paid invoices cannot be self-unsubmitted.

INSTALL IN THIS ORDER
---------------------

1) BACK UP / COMMIT YOUR CURRENT WORKING VERSION TO GITHUB.

2) RUN THE DATABASE UPGRADE.
Open this ordinary text file:
  SUPABASE-UPGRADE-COPY-PASTE.txt

Select all, copy it, then:
Supabase > SQL Editor > New query > Paste > Run.

Expected result:
  Success. No rows returned.

3) COPY THE APP UPDATE.
Copy the CONTENTS of this folder into your existing coach-hours-v1 folder.
Choose Merge if Finder offers it.
If it asks to replace individual matching files, choose Replace.

IMPORTANT:
DO NOT DELETE OR REPLACE YOUR EXISTING .env.local.

4) YOU DO NOT NEED A NEW NPM PACKAGE.
This build deliberately has no new package dependency.

5) RESTART THE APP.
In VS Code Terminal:
  Control + C
then:
  npm run dev

6) TEST LOGIN.
Open:
  http://localhost:3000

7) TO ENABLE REAL INVITE EMAILS:
Supabase > Settings > API Keys > Secret keys.
Copy the server secret beginning sb_secret_...

In .env.local add:
  SUPABASE_SECRET_KEY=sb_secret_YOUR_REAL_KEY

NEVER paste that secret into ChatGPT, GitHub or any NEXT_PUBLIC variable.
Restart npm run dev after adding it.

8) SUPABASE AUTH URL SETTING FOR LOCAL INVITES.
In Supabase Authentication URL configuration, make sure localhost is allowed as a redirect URL:
  http://localhost:3000/**

When we put the portal live, we will add the final HTTPS staff portal URL as well.

TEST BEFORE INVITING ALL STAFF
-------------------------------
Use one test coach account.

Coach test:
- Type normally in all fields.
- Save profile; refresh; details remain.
- Add a shift.
- Edit it.
- Delete it.
- Repeat weekly.
- Copy previous month.
- Submit month.
- Invoice appears.
- Download PDF.
- Unsubmit.
- Correct shift.
- Resubmit.

Admin test:
- Edit the test coach's hourly rate.
- Open coach timesheet.
- Add/edit/delete draft shift.
- Reopen submitted month.
- Confirm coach can then edit it.
- Resubmit as coach.
- Mark paid as admin.
- Confirm coach cannot unsubmit paid month.
- Open invoice archive and download PDF.
- Check Reports & audit.

Only after those tests pass should you invite the whole coaching team.
