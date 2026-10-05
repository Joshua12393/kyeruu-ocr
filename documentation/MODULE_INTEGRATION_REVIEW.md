# Finance integration fixes

Development review of remaining Finance phases; other OMS modules remain discovery scope in IMPLEMENTATION_PLAN.md.

- Account role changes and term turnover share the OMS settings lock so assignments cannot silently land in a stale term. Actor/target access is rechecked under locks.
- Supporting-sheet UI now submits document and all affected primary versions; shared receipt/sheet changes invalidate every affected verified parent.
- OCR retry and saved scan attachment check the original suggested schedule closure as well as the destination. Changing the selected context cannot move evidence out of a frozen source.
- Batches retain successful original IDs and saved remaining reviews across editor handoff. Failed extraction reuses a saved original; no OCR prediction changes finance totals.
- A shared repeatable-read query drives overview, retrieval, reconciliation and supplementary exports. Pagination does not shrink totals; supporting evidence is not counted as money.
- Term-wide closure gates every finance mutation, including unlinked documents/uploads. Settings versions serialize lifecycle changes; reopening is rejected.
- Archives include original bytes, source metadata and audit/deletion/control history. Ambiguous legacy scan ownership is explicitly excluded. Restore validates hashes, imports into a separate database, and cleans unsuccessful isolated copies even when retention was requested.

Evidence: tests/finance-release.test.ts, ocr-service/tests/test_ocr.py, scripts/integration-test.ts. Final execution results are recorded in the plan after verification. Browser visual acceptance and handwriting evaluation remain pending.

Restore date serialization and reads use UTC explicitly. Verification compares every exported field (including money, links, dates and snapshots), not counts alone. The initial restore test caught the Windows/MariaDB timezone shift and drove this correction.
