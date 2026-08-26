COACH HOURS V1 — START HERE

You do NOT need to understand the code.

STEP 1 — SUPABASE DATABASE
1. Open your Supabase project.
2. SQL Editor > New query.
3. Open the file: supabase/setup.sql
4. Copy ALL of it into the SQL editor.
5. Click RUN.
6. You should see "Success. No rows returned."

STEP 2 — CREATE YOUR OWN LOGIN
1. Supabase > Authentication > Users.
2. Add/invite your own email address.
3. Once your user exists, go back to SQL Editor.
4. Run:
   update public.profiles set role='admin' where email='YOUR EMAIL HERE';

STEP 3 — GET YOUR KEYS
In Supabase open the Connect/API details area.
You need:
- Project URL
- Publishable key beginning sb_publishable_
- Secret key beginning sb_secret_  (SERVER ONLY)

NEVER paste the secret key into website/client files or send it to anyone.

STEP 4 — SET UP THE APP ON YOUR MAC
1. Install Node.js 20.9+ (LTS is fine).
2. Install Visual Studio Code.
3. Open this coach-hours-v1 folder in VS Code.
4. Duplicate .env.example and rename the copy to .env.local
5. Replace the 3 placeholder values in .env.local with YOUR Supabase values.
6. In VS Code: Terminal > New Terminal
7. Paste:
      npm install
8. When finished, paste:
      npm run dev
9. Open:
      http://localhost:3000

STEP 5 — TEST
- Sign in with your admin account.
- Staff & Invites > Invite Coach.
- Use a second email address for testing.
- The coach receives a Supabase invitation email.
- Coach sets password/signs in.
- Add shifts, submit month, unsubmit, edit, resubmit.
- Admin can review/edit coach shifts and mark submitted work paid.

IMPORTANT
This is v1. Before using it for real bank/payment records, we should:
- deploy it over HTTPS;
- tighten field-level profile security so coaches cannot alter admin-controlled rate/role data through direct API calls;
- configure Supabase email redirect URLs for the final hosted domain;
- test RLS with an admin and two separate coach accounts;
- add production PDF invoice download/archiving;
- add audit logging for changed/removed shifts.

HOSTING
When local testing works, deploy the folder to Vercel.
The app can then live at something like:
staff.yourdomain.co.uk

Add the same 3 environment variables in Vercel.
Only NEXT_PUBLIC_* values are sent to browsers.
SUPABASE_SECRET_KEY remains server-side.
