# CCIS OMS and Finance implementation plan

Prepared 4 October 2026. Status: proposed implementation baseline for team review.
This document plans future work; it does not authorize implementation or change application behavior.

## 1. What the system actually does

Finance records money received and released, stores the original documents, categorizes records by schedule, checks supporting evidence, and lets the Auditor track review. OCR reduces typing; officers confirm the values. Financial statements are assembled outside Finance using its records and supplementary totals.

Three different things must stay distinct:

- Acknowledgement Receipt (AR): the primary record of money received; contributes to recorded inflow.
- Disbursement Voucher (DV): the primary record of money released; contributes to recorded outflow.
- Retailer receipt / Certificate of Expenses (CE): evidence supporting a DV; its individual items can belong to different schedules. It does not add a second expense.

Collection/sales sheets support ARs. One sheet can support several partial remittances. The remitter is not necessarily the individual payer. Per-payer details remain on the original sheet scan.

## 2. Sources and scope precedence

- `D:/kyeruu/kyello/SYSTEM PROPOSAL.pdf`: broad OMS purpose and early OCR concept; 10 pages.
- `D:/kyeruu/kyello/Copy of Finance Module.pdf`: detailed Finance specification, flows, schema, 38-story backlog, and exclusions; 79 pages. Key references: permissions pp. 8-10; workflow pp. 16-19; constraints pp. 29-31; use cases pp. 37-60; backlog pp. 61-73; boundaries pp. 75-79.
- Current working files in `D:/xampp/htdocs/kyeruu-ocr`: implementation evidence, not proof that every feature works or that its behavior has been approved.
- `product_backlog_plan.txt`, `README.md`, and `HANDOFF.md`: existing implementation notes; reconcile them with this plan when the baseline is accepted.

Proposed precedence: use the detailed Finance specification for Finance requirements, the proposal for broad OMS goals, and record exceptions explicitly. The Finance backlog itself is marked draft. No document instruction is treated as permission to modify, deploy, contact people, or delete records.

### Corrections to the earlier chat plan

- Official financial statement generation is excluded (pp. 8 and 75).
- E-receipt/document production is explicitly removed from Finance (p. 60), although the original proposal mentions it. Do not implement printable issued documents by assumption.
- Missing evidence, amount mismatches, and orphaned documents are soft flags. They do not block saves. Do not introduce a verification gate merely because flags exist; p. 51 leaves the Auditor's decision to the Auditor.
- Adviser and President may edit according to the detailed specification; only the Auditor verifies. Current code uses narrower editing permissions.
- Sheet totals are entered manually; per-payer payment tracking is outside Finance.
- Opening balance and remaining cash accounting are not defined in the Finance specification. Keep existing inflow-minus-outflow labeled as recorded net movement until opening balance and cash custody rules are specified.

## 3. Agreed-looking requirements versus decisions still needed

Use the following as the proposed baseline, subject to team confirmation of conflicts below:

- Five finance roles: Adviser, President, Treasurer, Assistant Treasurer, Auditor.
- Four editing roles; Auditor can view, verify, and un-verify but cannot edit.
- Only Treasurer deletes transactions. All five roles see flags and discrepancies.
- Schedule groups contain one or two sides, with at most one inflow and one outflow side. Labels may differ.
- IGP/Events default to both sides; Membership/Fines default to inflow only. Defaults can be changed.
- A receipt/CE is stored once; schedule assignment and voucher linkage occur per item.
- Every reviewed item needs an outflow schedule; a voucher link is optional until available.
- Sheets have a manually entered total, context label, optional period, and amount allocations to ARs.
- No allocation may exceed a sheet's total. Remaining coverage stays visible in the orphan queue.
- Control numbers are unique per primary type; formats and dates are validated before saving.
- Every confirmed mutation re-evaluates evidence and clears any affected verification.
- Concurrent edits or verification against stale versions are rejected.
- Closed-term records remain readable and cannot be changed.
- Scans and verification history survive officer turnover.

### Decision register for the leader/team

Record a decision, owner, and date for each item rather than relying on changing verbal instructions.

1. **Baseline ownership:** Is the detailed Finance document the team's current baseline? Owner: leader/adviser. Recommended: yes, with written exceptions.
2. **Permissions:** Current code limits edits to Treasurer/Assistant Treasurer; document allows Adviser/President too. Recommended draft: follow pp. 8-10. Review all UI guards and APIs together before changing access.
3. **OMS administrator:** Current project has a separate Admin; specification says Adviser administers OMS outside Finance. Decide whether to retain separate Admin, give an Adviser a separate administration capability, or integrate with a shared accounts module. Admin alone must not imply finance verification rights.
4. **Organizations:** The document discusses multiple CCIS organizations, but the schema has no organization boundary. Decide single-organization pilot or shared multi-organization deployment. Recommended first milestone: explicit single-organization pilot. If shared, add organization ownership and query isolation before real multi-organization data.
5. **Academic calendar:** Specify academic-year/semester start and end dates and document numbering year. Strings such as `2026-2027` cannot establish exact boundaries alone.
6. **Deletion/history:** Specification permits Treasurer deletion; code blocks deletion when verification history exists. Recommended: logical deletion with preserved audit evidence and detached support; deleted transactions leave active totals. Confirm control-number reuse policy. Do not erase audit history to force agreement.
7. **Closure and reopening:** Specification places closure in OMS; code closes a schedule group through Treasurer. Decide term-wide closure, administrator authority, and whether reopening is ever allowed. Recommended first release: no reopen; one controlled OMS operation closes all relevant groups.
8. **Closed metadata:** Specification permits renaming/renumbering at any time but also calls closed data immutable. Recommended: freeze closed-term metadata too; permit safe renames while open, even when transactions exist.
9. **Verification actor:** Backlog p. 69 says automatic clearing uses system as actor; schema p. 29 records the editor. Recommended: log initiating officer plus a system-triggered event type, preserving cause and attribution.
10. **Partial-remittance detection:** A sheet can be fully allocated to multiple ARs or partly outstanding. A balanced individual AR does not prove the entire sheet was remitted. Keep uncovered sheet amounts visible independently; never change a gross sheet total to match a net AR.
11. **Receipt arithmetic:** Schema specifies rounded quantity × unit cost; current API rejects products with more than two decimals. Confirm rounding, discounts, tax treatment, and whether item amounts must reconcile to the printed total. Do not invent missing quantity/unit-cost values from an OCR line total.
12. **OCR research scope:** Proposal describes team-trained CNN character recognition; detailed Finance plan describes PaddleOCR. Current implementation uses pretrained text recognition and geometry parsing. Decide whether the academic deliverable is integration or actual model training. The latter needs a separate dataset, training, evaluation, and deployment workstream.
13. **Handwriting:** Separate vision-language recognition is optional in the detailed plan. Current printed/handwritten switches use the same recognizer. Recommended first milestone: honest manual fallback for handwriting; evaluate a separate model only after hardware and sample tests.
14. **Document production:** Decide if original proposal's e-receipt generation is withdrawn or becomes a separately approved enhancement. It is excluded from this Finance baseline.
15. **Inventory boundary:** Decide what a purchase/sale sends to Inventory, which module owns stock updates, and whether a finance entry represents an actual stock movement. Until settled, no automatic stock update.
16. **Deployment/export:** Decide persistent hosting, OCR host, storage, backup responsibility, and archive format. Recommended pilot architecture is the current stack with private persistent storage.

Decisions 2-9 are needed before changing corresponding policies/data models. Other independent Finance improvements can be prepared without settling the full OMS design.

## 4. Current project: reuse and gaps

Evidence is from source inspection on 4 October 2026, including uncommitted working files. No tests were run for this planning task. Existing code requires fresh verification before completion claims.

- **Reuse:** Next.js/React application, NextAuth sign-in, Admin account workflow, term-based officer assignments, Prisma/MySQL schema, guarded APIs, private local/S3 storage, FastAPI OCR service.
- **Reuse:** manual AR/DV create/edit, unique control numbers, schedule-direction enforcement, version checks, receipt items, sheet allocation links, orphan lists, decimal reconciliation, verification events and invalidation on existing mutations.
- **Reuse:** overview totals, archive search, JSON export, closed-group locks, existing unit/integration/Python test harnesses.
- **Permissions gap:** `src/lib/auth.ts` and screens limit editing to two roles; Admin/Adviser ownership differs from specification.
- **Schedule gap:** all four activity types currently create both sides. Group edits are blocked when dependents exist, even safe renames. Side editing/add/remove APIs are absent from the inspected routes.
- **Review gap:** OCR has one-file upload and no schedule-first primary/supporting branch. Detected items are read-only and transferred transaction drafts contain header fields only.
- **Extraction gap:** geometry parsing extracts descriptions/line totals, but quantity/unit cost can be null. It is not evidence of complete table extraction or a separate handwriting model.
- **Validation gap:** primary control-number format and term-date limits are not enforced in the inspected input schemas.
- **Support gap:** create/link operations exist; saved support editing, unlinking, item reassignment, and allocation editing need implementation.
- **Retrieval gap:** schedule and transaction detail views with evidence/amounts side by side, schedule flag counts, and filtered supplementary totals need completion.
- **Lifecycle gap:** `/api/term` closes one group and exports nested JSON references. It is not a complete OMS archive containing scan bytes, orphaned documents, and restore validation.
- **Audit/deletion gap:** deletion with audit history is blocked; deletion semantics must be settled.
- **Broader OMS gap:** inventory, clearance, announcements, office attendance, and their shared integration contracts are not evidenced as complete modules in this repository.

## 5. Target architecture and data changes

Retain the current stack for the pilot: browser -> Next.js pages/API -> Prisma/MySQL; Next.js calls a private FastAPI OCR service and uses private file storage. Start with per-file synchronous OCR and bounded batch processing; use a queue only if deployment measurements justify it. This is a recommendation based on current code, not a new confirmed team decision.

Read the installed Next.js guides in `node_modules/next/dist/docs/` before implementation, as required by AGENTS.md. Preserve existing unrelated work; take a database backup before migrations and never reset populated databases.

### Models to retain

ScheduleGroup, Schedule, User, OfficerTerm, DocumentScan, DisbursementVoucher, AcknowledgementReceipt, Receipt, ReceiptParticular, ARSupportingDocument, ARSheetLink, VerificationEvent.

### Proposed additions, only where required

- Shared Term with explicit calendar bounds and closure state; Finance consumes it instead of owning turnover.
- Organization plus memberships and ownership keys if multi-organization is selected. Scope all finance, storage, OCR, search, and export access consistently.
- Versions on mutable supporting documents/items/allocations to prevent stale evidence changes, not only stale primary transactions.
- Mutation audit trail retaining changed fields, initiating officer, timestamp, and target. Keep verification history append-only.
- Logical deletion metadata if approved, with explicit active-query filtering and preserved financial references.
- Database invariants/indexes for one schedule side per group/direction, one sheet/AR link per pair, one target per verification event, and common date/schedule searches. Audit existing duplicates before adding uniqueness constraints.
- OCR metadata for engine/version and reviewed values where needed to measure correction rates. Stored machine predictions remain distinct from officer-confirmed financial data.
- Export manifest recording selected scope, record/file counts, checksums, completion, and authorization. OMS owns any later term deletion.

Do not add budgets, payer-payment tables, digital signatures, or inventory foreign keys without the corresponding scope decision.

## 6. Pages and user journeys

- **Overview:** current-period totals, clearly labeled all-period option, attention counts, recent records. Net movement is not certified cash on hand.
- **Schedules:** number/activity/year/semester and editable default sides; counts and drill-down details.
- **Record document:** choose schedule, declare primary/supporting once, select files, review, confirm, link, show results.
- **OCR review:** original scan; editable fields/items; confidence warnings; discard predictions while retaining scan; manual entry in the same review.
- **Transaction detail:** AR/DV fields, original primary scan if any, linked evidence, support total, difference, flags, verification history, role-appropriate actions.
- **Supporting documents:** receipt/CE item editor and manually entered collection/sales sheet forms; preserve partially linked documents.
- **Orphan/reconciliation workspace:** unassigned scans, unlinked items, and uncovered sheet amounts as distinct types; link from either this queue or a transaction.
- **Audit workspace:** filters for unverified/incomplete/mismatched/orphaned; verify/un-verify only for Auditor; re-review indicator after edits.
- **Archive/retrieval:** search by control/reference number, period, schedule, activity, dates, and status; originals remain accessible.
- **OMS administration:** shared accounts, assignments, current term, closure, export, and approved archive deletion. Present existing Admin work as a shared module, not an implicit finance privilege.

### Key journeys to implement end to end

1. AR: inflow schedule -> primary scan/manual -> confirm fields -> save -> attach sheet coverage -> review flags -> Auditor verification.
2. DV: outflow schedule -> primary scan/manual -> confirm fields -> save -> attach matching item evidence -> review flags -> Auditor verification.
3. Mixed receipt: supporting upload -> review all items -> assign each item's schedule -> optional DV per item -> one stored receipt -> visible in every relevant schedule.
4. Partial sheet: manual total/context -> allocate part to AR A -> keep remainder visible -> later allocate AR B -> sheet fully covered.
5. Correction: open current version -> edit/unlink/reassign -> atomically clear affected verifications -> updated flags -> Auditor re-review.

Primary transactions are one document at a time. Supporting uploads support batches; each file retains its own success/failure status. Retry failed files without duplicating already saved successful documents.

## 7. Ordered implementation backlog

Each phase finishes with a usable demonstration and its acceptance checks. These are dependency stages, not guaranteed one-week sprints. Estimate after open decisions and sample-image evaluation.

### Phase 0: Freeze the baseline and protect existing work

- Resolve policy conflicts in section 3, record draft-versus-approved decisions, and identify OMS owners.
- Inventory current uncommitted changes and agree which belong to the next delivery.
- Obtain anonymized samples for AR, DV, retailer receipt, CE, and all four sheet contexts.
- Baseline existing checks, schema, storage, and backup/restore procedure. Preserve failing baseline findings separately.
- Deliverable: approved scope, decision log, samples, and baseline issue list.

### Phase 1: Roles, calendars, and schedule structure

Stories: FIN-23, FIN-31, FIN-35, FIN-40, FIN-19.

- Align API/UI capability checks with the accepted permissions; prevent edit/verify overlap.
- Connect access to current OMS assignments and term bounds; preserve historical access policy explicitly.
- Correct defaults, expose side management, permit safe open-term renames, and reject direction changes/removal when dependents exist.
- Acceptance: all five role journeys tested; collection officers cannot access Finance; existing financial rows keep their links during safe metadata edits.

#### Phase 1 implementation record — 4 October 2026

The user requested Phase 1 only. Later phases remain deferred. Phase 1 follows the four-editor baseline (Adviser, President, Treasurer, Assistant Treasurer); Auditor alone verifies, Treasurer alone deletes, and separate OMS Admin manages accounts and calendars without Finance privileges. The pilot remains single-organization.

- Shared OMS term settings now select the current assignment name; the environment label is a bootstrap fallback. Admin's **Terms & calendar** screen manages calendar dates and the active term. Assignment history and existing financial IDs are preserved.
- The user explicitly chose **Leave dates unset; I'll enter them in Admin** for `2026-2027`. No dates are guessed. Finance remains readable but mutations are disabled until both dates are saved and today's Philippine calendar date is within the inclusive range.
- Historical-access policy: active accounts with one of the five current-term assignments can read historical Finance records. Former-term assignments alone and collection/OTHER assignments do not grant Finance access. Historical groups are immutable even if their legacy closure flag is false. Switching the current term requires assignments for that exact term; it does not close, export, or delete records.
- IGP/Events default to two sides; Membership/Fines to inflow only. A group may customize one or two distinct directions, labels, and safe open-term metadata through the schedule editor. Existing sides retain IDs on renames. Used sides cannot change direction or be removed; used groups cannot change semester or move terms. Closed metadata is frozen. A database uniqueness constraint enforces at most one side per direction.
- Existing per-group Treasurer closure remains unchanged; term-wide OMS closure/archive work stays in Phase 7. Deletion with audit history remains unchanged pending Phase 2's policy work.
- Acceptance checks are tracked in `tests/phase1.test.ts` and the disposable-database `scripts/integration-test.ts`. Entering the real calendar dates and the team's visual acceptance remain setup/review steps, not work in a later phase.
- Verified: lint, TypeScript checks, 12 unit tests, production build, and the disposable-database integration suite passed, including simultaneous side change/transaction creation. Temporary test databases were removed; real users and the unset calendar were preserved. The app responds on port 3000. Browser visual verification was blocked by browser security policy, so desktop/phone visual acceptance is still pending. Phase 2 and later phases have not been started by this delivery.

### Phase 2: Manual records and reliable mutations

Stories: FIN-01, FIN-02, FIN-05, FIN-08, FIN-27, FIN-32, FIN-43, FIN-44.

- Complete AR/DV forms, manual sheets, control-number rules, date validation, and decimal amounts.
- Return current-version information on conflicts without silently overwriting another officer's changes.
- Add saved supporting-document editing, unlinking, item schedule reassignment, and allocation editing.
- Apply approved deletion policy; return support to the queue and preserve evidence/history.
- Centralize locks, version increments, term checks, and verification invalidation for every mutation path.
- Acceptance: manual full workflow works without OCR; concurrent operations fail safely; incorrect direction, duplicate controls, invalid dates, and over-allocation are rejected.

### Phase 3: Evidence linking and reconciliation

Stories: FIN-04, FIN-28, FIN-29, FIN-06, FIN-09, FIN-34, FIN-07.

- Complete per-item links and partial sheet coverage, both queue-to-transaction and transaction-to-queue.
- Compute transaction support totals and exact differences; keep incomplete, mismatch, and orphan states independent.
- Re-evaluate after each successful mutation; show computed schedule counts and remaining sheet amounts.
- Acceptance: mixed receipt supports two schedules without duplicate encoding; partial remittance stays visible; soft flags never prevent a valid save.

### Phase 4: Guided OCR and supporting batches

Stories: FIN-30, FIN-03, FIN-42, FIN-15, FIN-16. Reuse validation from FIN-43.

- Schedule-first direction/mode flow; branch-constrained document types and editable type correction.
- Batch support uploads with file-level progress/results and bounded OCR load; prompt once for common context/parent.
- Editable receipt rows including quantity, unit cost, amount, schedule, and parent; preserve null OCR values until officer confirmation.
- Carry confirmed supporting drafts to the correct editor instead of losing detected rows.
- Sheets always bypass extraction. Poor/failed OCR retains the original and falls back to manual review without a new upload.
- Keep private persistent storage and scan retrieval; verify uploads are readable after restart and officer turnover.
- Acceptance: printed samples demonstrably reduce retyping; no predicted transaction is committed before confirmation; batch failures preserve successful files.

### Phase 5: Audit and transaction detail

Stories: FIN-10, FIN-24, FIN-25, FIN-26, FIN-11.

- Evidence and transaction totals side by side, original images, current flags, and append-only verification history.
- Verify/un-verify only the version actually reviewed; edits, amount changes, links, unlinks, and reassignments invalidate every affected verified parent.
- Audit actions stay available according to the accepted soft-flag policy; no automatic verification from OCR confidence or signatures.
- Acceptance: one sheet linked to several ARs and one receipt linked to several DVs invalidate all affected parents when relevant support changes.

### Phase 6: Retrieval, supplementary totals, and audit aids

Stories: FIN-17, FIN-12, FIN-21, FIN-22.

- Server-side filters, pagination, consistent period selection, and drill-down results.
- Export supplementary date-range/schedule totals and an attention report; label their scope/status clearly.
- Keep recorded and verified totals distinguishable; do not present an official financial statement or issued e-receipt.
- Acceptance: dashboard, filtered lists, and exported totals agree for identical filters; mixed receipts remain retrievable from every touched schedule.

### Phase 7: OMS lifecycle integration and release

Stories: FIN-38, FIN-39; finalize FIN-40 integration.

- OMS closes a term through a controlled shared operation; Finance rejects every write touching closed data, including support and verification mutations.
- Export by term/organization with structured records, original scan bytes, orphaned support/unassigned scans within defined scope, and audit events.
- Include a manifest and integrity checks; test restoration into a separate environment.
- Configure production secrets, HTTPS, private storage, OCR connectivity, backups, logs, health checks, and startup/recovery instructions.
- Acceptance: previous-term records stay readable after turnover; an archive restores successfully; no closed-record mutation succeeds through a direct API request.

### Phase 8: Optional enhancements after the core works

Stories: FIN-33 and FIN-41.

- History-based item category suggestions; officer confirmation always overrides suggestions. No history means no suggestion.
- Evaluate a separate handwritten model with deployment-specific resources and sample accuracy/correction measurements. Manual entry remains supported.
- Queue-based OCR only if measured latency/load warrants it.
- These enhancements cannot delay a working manual/printed Finance workflow unless the team explicitly makes them a release requirement.

All 38 distinct FIN backlog stories are mapped above. FIN01-FIN10 without hyphens are use-case identifiers, not extra backlog stories. F1-F8 identifiers describe feature groups.

## 8. Totals and worked acceptance examples

- Recorded inflow = sum of active AR amounts within selected filters.
- Recorded outflow = sum of active DV amounts within the same filters.
- Recorded net movement = inflow - outflow.
- DV support total = sum of linked item gross amounts in that DV's schedule.
- AR support total = sum of allocations linked to that AR, not full sheet totals.
- Sheet remaining = manually confirmed sheet total - sum of its allocations across ARs.
- Difference = transaction amount - support total. Show both direction and amount; never silently rewrite a source value to make it match.

Examples:

1. AR 2,000; DV 500; supporting retailer receipt 500. Inflow 2,000, outflow 500, net movement 1,500, not outflow 1,000.
2. One receipt: bond paper 392 for schedule A; pencils 100 for schedule B. Link to DVs 392 and 100 respectively. Store one scan and one receipt; both vouchers reconcile.
3. Sheet total 2,100; AR A covers 1,000. A can match its own coverage while 1,100 remains outstanding. AR B covers 1,100 later; sheet remainder becomes zero.
4. Same sheet allocations total 2,150 against 2,100. Reject structurally invalid allocation, including concurrent requests that would together exceed coverage.
5. DV 500 with support 450. Save succeeds with mismatch 50. Auditor sees the difference; software does not conceal it or decide accounting validity.
6. IGP sheet gross 17,537 against ARs totaling 13,951. Expose the 3,586 uncovered/difference through coverage and attention views. Do not net expenses out of the original sheet to eliminate the signal. Allocation entry alone cannot certify original business records.
7. Verified DV changes from 500 to 550 or its support changes. Clear verification, append the cause/actor event, and require a new Auditor action to verify the new version.
8. A closed group's transaction/support cannot be edited, moved, unlinked, deleted, or verified through any role. Retrieval still works.

## 9. Wider OMS workstreams

The sources fully specify Finance but do not fully specify every OMS module. The following are planned discovery/delivery workstreams, not invented approved requirements.

### Shared accounts, organizations, and terms

Confirm organization membership, identity provider, role assignment/approval, active terms, turnover/handover access, administrator powers, account deactivation, export and deletion authorization. Reuse existing account work where it fits. Deliver shared contracts and access tests before cross-module rollout.

### Inventory

Define item types, units, opening stock, locations/custodians, incoming stock, issue/return/sale adjustments, and correction audit. Decide how a confirmed finance item links to a stock movement and how refunds or partial quantities behave. Finance is not authority to assume stock physically moved. Pilot manual stock movements before automation.

### Announcements

Define author/publisher roles, organization audience, draft/published/archive states, event dates, attachments, and visibility. Implement feed/detail and publishing after these are agreed. Notifications are a separate decision.

### QR office attendance

Clarify whether this is officer office monitoring, meeting attendance, or event attendance; the proposal specifically mentions officer office monitoring. Define check-in/out, session ownership, QR lifetime, duplicate/replay behavior, manual corrections, and reporting access. Avoid treating a static QR scan as proof of physical presence without an agreed attendance rule.

### Clearance

Clarify who is assessed, what obligations matter, who clears/overrides, and which modules supply evidence. Finance cannot answer individual membership payment questions from aggregated ARs. If payment eligibility is required, specify a separate payer ledger/membership module rather than inferring from the remitter's name.

### Optional membership/payer ledger

Only add if the team needs individual paid/unpaid status, membership fee balances, or payment-based clearance. Define payer identity and how collection rows map to remittance ARs. Keep collected versus remitted funds distinct to avoid double counting.

Recommended wider sequence: shared accounts/terms -> complete Finance -> Inventory boundary and pilot -> Announcements -> Attendance -> Clearance after its dependency rules are defined. Modules can progress independently only after their interfaces and owners are agreed.

## 10. Validation and completion contract

For each relevant phase: lint, type checking, targeted unit tests, disposable-database integration tests, and production build. Run Python parsing/inference checks when OCR changes. Do not run destructive tests against the user's working database.

Browser checks cover Treasurer, Assistant Treasurer, President, Adviser, Auditor, unauthorized collection officers, and OMS Admin; use desktop and phone layouts. Exercise real anonymized images, manual fallback, unreadable images, OCR outage, batch partial failures, image retrieval, stale conflicts, and historical records.

Measure printed OCR field/item correctness and time to confirmed entry on a fixed sample set. Report sample size and limitations; do not claim handwriting accuracy from the printed pipeline. Set performance/accuracy acceptance targets with the team after baseline measurement.

Definition of done: the story's mapped behavior works from UI and direct API, money/integrity/role checks pass, no evidence is lost, migrations preserve existing records, documentation matches behavior, and the demonstration can be repeated. A page or endpoint existing is not completion evidence.

Update the seven documentation artifacts named by the Finance specification when implementation decisions are settled: use case diagram, use case descriptions, activity diagram, class diagram, package diagram, component diagram, and deployment diagram. Use case descriptions are text specifications rather than a diagram type. Confirm the instructor's submission formats separately. Keep artifacts, permissions, data schema, and demonstration consistent. Do not claim automatic CNN training or document production unless implemented and evaluated.

## 11. Immediate next delivery

Current delivery is Phase 1 only, as requested by the user. Do not begin Phase 2 or later phases until Phase 1 has passed its checks and the user approves proceeding. Reassess this file against the live code before each phase because current uncommitted work may change.

Any scope change gets a short entry: requested behavior, reason, affected stories/models/pages, owner decision, and validation impact. This gives the team one reference instead of several conflicting plans.
