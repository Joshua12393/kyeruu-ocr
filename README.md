# Kyeruu OCR Finance

Next.js, MySQL/MariaDB, Prisma 7, and a private Python PaddleOCR service.
The local active officer term is `2026-2027`.

## Frontend

The finance shell adapts TailAdmin's free Next.js dashboard palette and layout
patterns, with its MIT notice retained in `licenses/TailAdmin-LICENSE.txt`.
Source: https://github.com/TailAdmin/free-nextjs-admin-dashboard.
The overview uses live database totals and recent entries. Figures cover all
schedule groups; the active term determines officer access.
The OCR workspace previews selected images locally before upload and keeps
editable values alongside the original. Adviser, President, Treasurer, and
Assistant Treasurer can extract and open drafts during the configured calendar.
Auditor has viewing and verification access, without editing privileges.

## Local setup (Windows / XAMPP)

Start MySQL in XAMPP. Apache is not required. Keep your existing `.env`; use
`.env.example` as the configuration reference. Set a random `NEXTAUTH_SECRET`,
the database URL, and the exact `FINANCE_CURRENT_TERM` assignment label.
Set `NEXTAUTH_URL` to the browser's application URL; account forms accept
requests from that origin.

```powershell
npm install
npm run db:migrate
```

Open `/register` to create an account with a name, email, and password.
New accounts wait for approval and cannot access finance records. Only an Admin
uses **Account management** to create accounts, assign roles, deactivate/reactivate,
or delete logins. Officer roles apply to the active term; Admin access is independent
of officer assignments and does not grant finance entry or verification permissions.
President and Adviser accounts cannot manage accounts.

Sign in as Admin and open **Terms & calendar** (`/terms`) to configure the active
assignment term and its inclusive start/end dates (Philippine time). The local
`2026-2027` dates are deliberately unset at the user's request: Finance is read-only
until both dates are entered. Unset, future, or expired calendars reject direct API
writes too. `FINANCE_CURRENT_TERM` is only a bootstrap fallback once OMS settings
have been saved. Role assignment uses the current OMS term without restarting.
Current assigned officers can read previous-term records; former assignments alone
do not grant access. Historical groups and closed groups cannot be changed.

For a brand-new installation only, `npm run admin:provision` bootstraps the first
Admin with a hidden password. Existing emails are never overwritten by that command.
Use the website for additional accounts. The legacy `officer:provision` command
remains available for maintenance; re-running it resets an officer's password.

Deactivation invalidates existing sessions and blocks sign-in. Reactivation requires
a fresh login. Deleting an account removes its credentials and hides it from the
account list, retaining its user record for financial and audit references. Admins
cannot change, deactivate, or delete their own account.

The initial migration installs a new schema. A populated pre-existing database
must first receive an appropriate Prisma migration baseline; never reset it
to install this application.

Prepare the Python runtime:

```powershell
python -m venv ocr-service/.venv
ocr-service/.venv/Scripts/python.exe -m pip install -r ocr-service/requirements.txt
```

Start OCR in one terminal:

```powershell
cd ocr-service
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start Next.js in another:

```powershell
npm run dev
```

Open [localhost:3000](http://localhost:3000) and sign in, or choose **Create account**.
First extraction downloads two official English mobile models. CPU
inference uses the portable executor with oneDNN disabled for Windows compatibility.

## Workflow

- Create schedule groups: IGP/Events default to inflow and outflow;
  Membership/Fines default to inflow only. Customize one or two distinct sides in
  **Schedules → Edit group & sides**. Safe renames preserve transaction/item links.
  Used sides cannot be removed or change direction; closed metadata is frozen.
- Enter vouchers in outflow schedules and acknowledgement receipts in inflow
  schedules. Forms support editing, direct image upload without OCR, and Treasurer-only deletion.
  New controls allow letters/digits separated by hyphens or slashes. Dates must
  fit the term calendar; amounts use exact positive decimals with cent precision.
- If the transaction schedule list is empty, use **Create schedule group** inside
  the form. Creation selects the appropriate inflow/outflow side without clearing
  your transaction values. Use **Refresh schedules** for groups created elsewhere.
- Upload a PNG/JPEG/WebP image on the OCR page, up to 10 MB. Review recognized
  values and open a transaction draft, or save the scan for manual entry.
- Upload originals directly in finance forms using **Upload image for manual entry**.
  The OCR service can remain stopped for this workflow.
- Record retailer-receipt items or handwritten collection/sales-sheet totals on
  the Supporting documents page. Link items to vouchers and allocate sheet
  amounts across acknowledgement receipts. Open **Saved supporting documents →
  View / edit** to change headers, rows, item schedules, links or allocations.
  Choose **Link later** to unlink an item; remove a sheet allocation to unlink it.
  Item gross amounts round quantity × unit cost to cents using half-up rounding.
- Use reconciliation to link unassigned scans, unlinked items, and remaining
  sheet balances. Link forms accept transaction control numbers.
- Only the Auditor can verify/unverify. Edits and new evidence clear verification
  and append audit events. Stale saves return HTTP 409 with the latest version
  and record snapshot; forms retain the draft for explicit latest-value review.
- Close a schedule group to block further transaction changes, supporting links,
  deletion, and verification changes. The ordinary update API cannot reopen it.
- Archive search shows the original scan; `/api/term` exports transactions,
  support, scan references, and verification history.

Reconciliation checks supporting evidence, not merely the presence of a primary
scan. Exact decimal comparisons flag amount differences. Treasurer deletion hides a
transaction from active totals and queues while keeping scans, verification events
and before/after audit history. Its support returns to the queue. Old control
numbers stay reserved after renaming/deletion. Historical or closed source groups
block support reassignment too. The existing /api/term history export includes
deleted records with deletion markers; it is not an active-totals report.

## Storage and security

Files live under `UPLOAD_DIR`, outside `public`, with random immutable names.
Downloads require an authenticated current-term finance officer. User listings
and transaction relations never return password hashes.

S3 is optional: configure `AWS_S3_BUCKET`, `AWS_REGION`, and credentials or an IAM
role. Keep the bucket private. Leave the bucket unset for private local storage.
Local storage requires a persistent disk; an ephemeral serverless filesystem is
unsuitable.

Bind Python to loopback when it shares the Next.js host. For a separate OCR host,
set the same `OCR_SERVICE_TOKEN` on both services and restrict network access.
Images are processed locally; model download requests fetch model weights.

## Validation

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:integration
cd ocr-service
.venv/Scripts/python.exe -m unittest discover -s tests -v
$env:PYTHONPATH='.'
.venv/Scripts/python.exe tests/smoke_inference.py
```

Integration tests require a running database and production build. They use a
uniquely named `kyeruu_ocr_test_*` database and a loopback server, then clean up
the test database and temporary uploads. They never clear application records.
The test database user needs permission to create and remove test databases.

## Extraction limits

Printed receipts use text geometry to join detected cells into rows, followed by
conservative financial parsing; this is not a general table-structure model.
Handwriting uses the same English recognizer, not a vision-language model.
Unusual layouts, difficult handwriting, ambiguous dates, and quantities/unit costs
need manual review. Recognition confidence does not measure accounting accuracy.
OCR never saves a financial transaction without an officer submitting its form.

Failed OCR retains the saved scan with `FAILED` status for manual entry.
S3 access requires your own bucket configuration and is not exercised by local tests.

References: [Prisma MySQL setup](https://www.prisma.io/docs/v7/prisma-orm/quickstart/mysql)
and [PaddleOCR quick start](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/quick_start.md).


Remaining Finance phases: see [release and recovery](documentation/FINANCE_RELEASE.md) and [integration fixes](documentation/MODULE_INTEGRATION_REVIEW.md). The latest delivery supersedes earlier phase deferral notes. Real term dates remain unset; handwriting evaluation and visual acceptance need samples/review.
