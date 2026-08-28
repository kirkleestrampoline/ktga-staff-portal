KTGA STAFF PORTAL v0.2

THIS UPDATE KEEPS YOUR EXISTING SUPABASE PROJECT.
DO NOT DELETE YOUR .env.local FILE.

WHAT'S IN v0.2
- New professional KTGA Staff Portal layout
- Redesigned login screen
- Role-based navigation for Admin and Coach
- Live admin dashboard using Supabase data
- Live coach dashboard
- Staff directory and search
- Coach profile/payment details
- Business settings
- Monthly timesheet calendar
- Add/edit/delete shifts
- Copy previous month
- Repeating weekly shifts
- Submit / unsubmit workflow
- Admin submission overview
- Mark paid / reopen
- Invoice views
- Basic reports foundation
- Mobile-responsive styling

HOW TO INSTALL OVER YOUR EXISTING PROJECT
1. KEEP your current project folder and KEEP .env.local.
2. Copy the contents of this update over the matching files in your existing coach-hours-v1 folder.
3. In VS Code Terminal run:
     npm install
4. Then run:
     npm run dev
5. Open http://localhost:3000
6. Sign in with your existing Supabase admin account.

AFTER TESTING
Run:
  git add .
  git commit -m "Build KTGA Staff Portal v0.2"
  git push

IMPORTANT
The Invite Coach button needs SUPABASE_SECRET_KEY on the server. It is okay to leave this unset during local testing; the rest of the portal works without it.

The current database permissions are adequate for development, but before real staff use we will tighten field-level protections so coaches cannot manipulate admin-controlled fields (role/rate) through direct API requests.
