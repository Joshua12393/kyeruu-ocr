# Next session

The finance application uses Next.js, Prisma/MySQL, and a local FastAPI
PaddleOCR service. The active officer term is `2026-2027`.

## Run locally

Use XAMPP MySQL for now. Laragon is installed at `D:\laragon`, but the
databases have not been migrated. Do not run both database servers on port
3306. Apache is not required by this application.

In one PowerShell terminal:

```powershell
cd D:\xampp\htdocs\kyeruu-ocr\ocr-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another:

```powershell
cd D:\xampp\htdocs\kyeruu-ocr
npm run dev
```

Open http://localhost:3000. An officer account was provisioned locally with
the President role; credentials and database rows are not committed.
Adviser/President/Treasurer/Assistant Treasurer can create and edit records
during the active OMS calendar; Treasurer can delete and close groups;
Auditor can verify. Use Admin-only **Account management** in the sidebar
to create accounts and approve roles.
Public `/register` accounts wait for Admin approval; `npm run admin:provision`
bootstraps a new installation. A separate Admin account was created locally;
its credentials are not stored in project files.

## Continue with

- Current delivery is **Phase 1 only** in IMPLEMENTATION_PLAN.md. The shared
  OMS calendar and active-term screen is `/terms`, available to Admin. The user
  explicitly left `2026-2027` dates unset; Finance stays read-only until configured.
  Schedule sides are editable with one side per direction; safe renames preserve
  financial IDs and links. Used sides cannot change direction or be removed.
  Current officers can read historical records; historical groups reject writes.
  Do not proceed with Phase 2 or later phases without the user's next instruction.
  Phase 1 tests cover five roles, collection-officer exclusion, side management,
  safe metadata edits, calendars, and current-term turnover.
  The first backup attempt did not complete before the additive migration and
  failed during its schema change. A complete SQL backup was subsequently saved
  at `.local-backups/phase1-1791096953840.sql` (ignored by Git); the earlier partial
  dump must not be used for recovery. The live database retained its five users,
  zero schedule groups, and unset `2026-2027` calendar. No application DB reset
  or sample financial-data insertion was performed.

- Custom login, signup, and waiting-for-approval screens are implemented.
  Admins can create accounts, give/revoke roles, deactivate/reactivate, and delete
  logins while retaining financial references. President and Adviser no longer
  manage accounts. Public registration cannot grant roles. Admins cannot modify
  their own accounts; deactivation invalidates sessions even after reactivation.
  Lint, type checking, production build, nine unit tests, and the disposable
  database integration suite passed, including admin-only management, role changes,
  session invalidation, reactivation, deletion, and financial-history retention.
  Admin sign-in, search, creation form, deletion cancellation, self-protection,
  and desktop/phone layouts were browser checked.

- The TailAdmin-style finance shell, live overview, and OCR preview/review
  workspace are implemented. Desktop and phone layouts, sidebar dismissal,
  image selection, zoom, reset, and President restrictions were browser checked.
  Lint, type checking, production build, and four security tests passed.
- Extend the same form and table treatment to schedules, vouchers, receipts,
  supporting documents, reconciliation, verification, and archive pages.
- Make action availability clearer across those remaining pages for each role.
- Exercise the complete receipt/voucher/support/reconciliation workflow
  with the appropriate officer accounts and real sample images.
- If switching to Laragon, migrate through SQL exports rather than copying
  MariaDB data files into its MySQL installation.

## Local database recovery

XAMPP's `mysql.db` and `mysql.procs_priv` permissions tables were repaired.
Application database tables passed checks. Three unreadable database-level
grant entries could not be recovered; root access was verified.
The local full backup and project SQL exports are under
`D:\xampp\mysql\recovery-backups\20261004-004628`.

OCR handwriting recognition requires manual review. The production
dependency audit was clean at the last check; development dependency
advisories remain. See README.md for setup and validation commands.
