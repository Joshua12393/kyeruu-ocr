ALTER TABLE schedule_groups MODIFY COLUMN academic_year VARCHAR(50) NOT NULL;
ALTER TABLE document_scans ADD COLUMN ocr_started_at DATETIME(3) NULL;
ALTER TABLE verification_events ADD CONSTRAINT verification_exactly_one_parent CHECK ((dv_id IS NULL) <> (ar_id IS NULL));
