AV Gymnastics Solutions v1.1.2 — REAL APPLICATION PATCH

There is NO Supabase/SQL change in this patch. You already ran the V1.1.1 database fix.

This patch contains exactly 3 application files. Replace these exact files in coach-hours-v1:

1) app/dashboard/ui.tsx
2) app/globals.css
3) app/api/admin-user/route.ts

After replacement, the desktop top bar will visibly show v1.1.2. That proves this patch is installed.

Included application changes:
- Admin Timesheets list shows Reopen paid month for paid timesheets.
- Opening a paid coach month also shows Reopen paid month.
- Reopen uses the already-installed admin_reopen_timesheet database function, removes generated invoices and returns the month to Draft.
- Organisation admin dashboard organisation summary only renders organisations they administer.
- Organisation admin staff/profile venue controls only render organisations they administer where applicable.
- Mobile Monthly Status uses stacked cards instead of a wide table.
- Mobile Timesheets uses stacked admin cards instead of a wide table.
- Mobile Invoices uses stacked cards.
- Mobile Staff uses stacked cards.
- Mobile Cost by Coach uses stacked rows.
- Organisation summary stacks on mobile instead of stretching horizontally.

Then run:
  git add app/dashboard/ui.tsx app/globals.css app/api/admin-user/route.ts
  git commit -m "Install AV v1.1.2 application fixes"
  git push origin main

Vercel will deploy automatically.
