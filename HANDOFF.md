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
President can view finance records. Treasurer/Assistant Treasurer can
create and edit transactions; Treasurer can delete and close groups;
Auditor can verify. Use `npm run officer:provision` for additional accounts.

## Continue with

- Confirm navigation after a hard refresh; a writing extension previously
  injected body attributes and triggered the development error overlay.
- Make action availability clearer for President and other officer roles.
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
