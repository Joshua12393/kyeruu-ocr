# Finance release and recovery

## Local operation

Start the database belonging to this installation (do not start both XAMPP and Laragon on 3306). From the repository run npm run db:generate, npm run db:migrate, npm run dev. OCR is optional for manual workflows: from ocr-service run .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000. An occupied port may mean the service already runs; check its /health before starting another instance.

Admin must enter the actual start/end dates for 2026-2027 in Terms. Dates are intentionally still unset. Assign officers for exactly the current term. Admin controls accounts/calendar/closure/archive; Finance editing and verification remain separate officer permissions.

## Workflows and module boundaries

Overview, archive retrieval and audit review share one query and repeatable-read snapshot. Primary dates/control/purpose and linked receipt reference are searchable; totals cover every matching primary, independently of pagination. Supporting receipts remain separate results (maximum 100 shown), never additional money. Undated sheets are labeled separately; primary date filters do not fabricate sheet dates. Attention exports carry full filtered totals and flagged records.

Open a primary detail to compare original/support and signed differences, attach queue evidence, or verify its reviewed version. Receipt edits can affect multiple DVs; sheet edits can affect multiple ARs. All affected versions are required. Soft flags permit saving and Auditor decisions. Treasurer deletion preserves original evidence and history and reserves control identity.

OCR prompts for common schedule/mode/type and processes up to ten supporting files with two requests. Review every file; sheets always use manual entry. Null quantities/costs stay blank until confirmed. Batch handoff preserves other saved reviews in session storage; unuploaded files must be selected again after navigation/reload. These drafts are not financial commits. Originals and saved records remain in private storage independently of browser draft state.

## Closure and archive

Admin closes an entire selected term using explicit confirmation and a settings version. Closure freezes all term writes, even unlinked support and uploads; no reopening or permanent removal UI exists. Current officers can still read historical records after turnover when assigned the new term.

Download the archive from Admin Terms after closure. It includes selected-term scalar records, soft-deleted primaries, relevant people/assignments, audit and verification events, control reservations, term-owned orphan scans/support and every included original image as base64. Manifest includes counts and SHA-256 checksums. Unassigned legacy scans with no proven term ownership are explicitly counted as excluded. Passwords are omitted and archived accounts disabled; it is a financial archive rather than a complete live authentication backup. Missing original bytes abort export. Pilot raw-image limit is 250 MB; larger archives require a separately managed complete database plus storage backup.

Verify restoration with npm run archive:verify -- <archive.json>. It creates and migrates a new randomly named database and a new private .test-artifacts directory, imports with foreign keys enabled, verifies counts and image hashes, then cleans its own isolated copy. --retain keeps a successful isolated restore for inspection; it never overwrites the app database. You need a database account authorized to create/drop this isolated database. Protect exports because they contain financial records and scans. Keep a separate encrypted full database/storage backup to recover live accounts or legacy evidence. Test recovery on another environment before deployment.

## Production checklist

Run npm run release:check, npm run lint, npm run typecheck, npm test, npm run build and npm run test:integration. Integration uses a disposable database, never app financial data. Configure random secrets, a least-privilege database user, HTTPS NEXTAUTH_URL, persistent private disk or private S3, matching OCR_SERVICE_TOKEN with HTTPS for a remote OCR host, proxy upload/time limits, restricted OCR network access, logs with retention and health monitoring. /api/health checks database readiness; /health on Python checks its process, not loaded model readiness. Test a real image before claiming OCR ready. Hosting provider, public TLS, offsite backups and monitoring must be verified on the actual deployment, which has not been selected or published here.

## OCR evaluation

From ocr-service: python -m tests.smoke_inference exercises real PaddleOCR with one synthetic printed receipt. python tests/benchmark.py <manifest.json> --output <report.json> --url http://127.0.0.1:8000 measures labeled values, correction count, latency, optional character error and failures. See the benchmark module docstring for the manifest. Run the same anonymized set against a candidate service to compare a separate handwriting model. No handwriting samples were supplied. A separate handwriting model, accuracy claims, human confirmation-time metrics and performance targets remain pending evidence; manual entry works without them.

Seven finance specification artifacts live in documentation/finance as six Mermaid sources and one textual use-case specification. Instructor-specific submission formats and visual desktop/phone acceptance remain pending.

Treasurer may also close an individual current/open schedule group through the existing group workflow. Admin term-wide closure is the shared OMS lifecycle operation and freezes every remaining group plus unlinked term documents. In-flight OCR completion cannot update a scan after source closure or term turnover.
