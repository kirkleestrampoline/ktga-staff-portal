AV GYMNASTICS SOLUTIONS v1.2 — SCHEDULE & STAFFING
====================================================

WHAT THIS ADDS
--------------
A new Schedule & Staffing workspace for Kirklees, Greenhead and future organisations.

ADMIN / ORGANISATION ADMIN
- Create every regular class once: organisation, day, start/finish, break, coaches required.
- Assign default coaches to each staffing slot (or deliberately leave a slot unassigned).
- Generate any month from the regular weekly timetable.
- Reassign a scheduled shift when somebody covers.
- Cancel/restore a scheduled class occurrence before it is confirmed.
- Confirm a scheduled class on behalf of the coach and flow it into their actual timesheet.
- Normal monthly staffing cost.
- Current forecast cost after covers/cancellations.
- Actual cost from timesheet shifts.
- Forecast variance and unassigned shift count.
- Organisation filter.

COACH
- New My Schedule screen.
- See planned sessions for the selected month.
- Confirm a worked session with one tap.
- Confirmation creates the corresponding timesheet shift automatically.
- Remaining scheduled sessions and confirmed hours are visible at a glance.

HOW THE WORKFLOW WORKS
----------------------
Regular Class -> Generated Scheduled Shift -> Coach/Administrator Confirms -> Actual Timesheet Shift -> Monthly Submission/Invoice

The schedule is therefore a PLAN, not assumed proof that somebody worked. Covers can be changed before confirmation.

INSTALL ORDER
-------------
1. Run SUPABASE-V1.2-SCHEDULE-STAFFING.txt in Supabase > SQL Editor > New Query.
2. If Supabase says Success, merge the app patch files into your existing coach-hours-v1 folder.
3. Keep .env.local unchanged.
4. No npm install is required.
5. Restart locally with npm run dev and test before pushing.
6. Push to GitHub; Vercel should deploy automatically.

FIRST SETUP
-----------
1. Open Schedule & Staffing as Super Admin.
2. Add regular classes for Kirklees and Greenhead.
3. For each class, choose how many coaches are required and set default coaches.
4. Select September and click Generate September.
5. Review unassigned shifts/covers and change staff where required.
6. Have a test coach open My Schedule and Confirm worked on one shift.
7. Check that shift appears in their Timesheet.

COST DEFINITIONS
----------------
Normal monthly cost = the regular class timetable using default assigned coach rates for the selected calendar month.
Current forecast = the generated schedule after covers/cancellations at current assigned coach rates.
Actual cost = actual timesheet shifts currently recorded for the month.

IMPORTANT
---------
Generating a month is safe to run again: existing generated class/slot/date rows are not duplicated.
Manual cover changes are preserved because generation only inserts missing occurrences.
Submitted/paid coach months remain protected: reopen the month before confirming/reassigning a linked actual shift.
