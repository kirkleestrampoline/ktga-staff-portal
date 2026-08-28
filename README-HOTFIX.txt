KTGA Staff Portal v0.2.1 hotfix

The v0.2 Finder copy could replace the whole app folder on macOS and remove the /dashboard route.

Copy the contents of this update into your existing coach-hours-v1 folder.
Choose Merge if macOS offers it. If it only offers Replace for individual files, that is fine.

This restores:
- app/dashboard/page.tsx
- app/api/invite/route.ts

Then restart:
npm run dev
