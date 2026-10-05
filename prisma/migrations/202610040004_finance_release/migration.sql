ALTER TABLE academic_terms ADD COLUMN closed_at DATETIME(3) NULL, ADD COLUMN closed_by_id INT NULL;
ALTER TABLE document_scans ADD COLUMN document_type VARCHAR(50) NULL, ADD COLUMN suggested_schedule_id INT NULL, ADD COLUMN ocr_version INT NOT NULL DEFAULT 0, ADD COLUMN ocr_engine VARCHAR(100) NULL, ADD COLUMN ocr_duration_ms INT NULL, ADD COLUMN reviewed_values JSON NULL;
CREATE TABLE archive_exports (id INT NOT NULL AUTO_INCREMENT, term VARCHAR(50) NOT NULL, user_id INT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), manifest_sha256 VARCHAR(64) NOT NULL, scan_count INT NOT NULL, PRIMARY KEY (id)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE INDEX dv_period_schedule ON disbursement_vouchers (date, schedule_id, deleted_at);
CREATE INDEX ar_period_schedule ON acknowledgement_receipts (date, schedule_id, deleted_at);
CREATE INDEX receipt_schedule_parent ON receipt_particulars (schedule_id, dv_id);
CREATE INDEX scan_term ON document_scans (academic_year);
