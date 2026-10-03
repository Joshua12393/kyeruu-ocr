# Kyeruu OCR Finance

Next.js, MySQL/MariaDB, Prisma 7, and a private Python PaddleOCR service.
The local active officer term is `2026-2027`.

## Local setup (Windows / XAMPP)

Start MySQL in XAMPP. Apache is not required. Keep your existing `.env`; use
`.env.example` as the configuration reference. Set a random `NEXTAUTH_SECRET`,
the database URL, and the exact `FINANCE_CURRENT_TERM` assignment label.

```powershell
npm install
npm run db:migrate
npm run officer:provision
```

Provisioning prompts for email, name, position, and a hidden password. Run it
for the Treasurer and Auditor as needed. Existing accounts without configured
credentials cannot sign in. Re-running it for an email resets that password
and appends an officer assignment. The latest assignment in the active term
determines access.

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

Open [localhost:3000](http://localhost:3000) and sign in with a provisioned officer
account. First extraction downloads two official English mobile models. CPU
inference uses the portable executor with oneDNN disabled for Windows compatibility.

## Workflow

- Create schedule groups; inflow/outflow schedules are generated automatically.
- Enter vouchers in outflow schedules and acknowledgement receipts in inflow
  schedules. Forms support editing and Treasurer-only deletion.
- Upload a PNG/JPEG/WebP image on the OCR page, up to 10 MB. Review recognized
  values and open a transaction draft, or save the scan for manual entry.
- Record retailer-receipt items or handwritten collection/sales-sheet totals on
  the Supporting documents page. Link items to vouchers and allocate sheet
  amounts across acknowledgement receipts.
- Use reconciliation to link unassigned scans, unlinked items, and remaining
  sheet balances. Link forms accept transaction control numbers.
- Only the Auditor can verify/unverify. Edits and new evidence clear verification
  and append audit events. Stale saves return HTTP 409.
- Close a schedule group to block further transaction changes, supporting links,
  deletion, and verification changes. The ordinary update API cannot reopen it.
- Archive search shows the original scan; `/api/term` exports transactions,
  support, scan references, and verification history.

Reconciliation checks supporting evidence, not merely the presence of a primary
scan. Exact decimal comparisons flag amount differences. Transactions with audit
history cannot be deleted; edit and reverify corrections before closing the term.

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
