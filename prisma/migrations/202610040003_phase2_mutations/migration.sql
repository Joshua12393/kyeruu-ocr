ALTER TABLE `disbursement_vouchers` ADD COLUMN `deleted_at` DATETIME(3) NULL, ADD COLUMN `deleted_by_id` INTEGER NULL;
ALTER TABLE `acknowledgement_receipts` ADD COLUMN `deleted_at` DATETIME(3) NULL, ADD COLUMN `deleted_by_id` INTEGER NULL;
ALTER TABLE `receipts` ADD COLUMN `academic_year` VARCHAR(50) NULL, ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `ar_supporting_documents` ADD COLUMN `academic_year` VARCHAR(50) NULL, ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `document_scans` ADD COLUMN `academic_year` VARCHAR(50) NULL;
ALTER TABLE `verification_events` ADD COLUMN `reason` VARCHAR(255) NULL;
CREATE TABLE `financial_mutations` (
 `id` INTEGER NOT NULL AUTO_INCREMENT, `target_type` VARCHAR(20) NOT NULL, `target_id` INTEGER NOT NULL,
 `action` VARCHAR(50) NOT NULL, `user_id` INTEGER NOT NULL, `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `before` JSON NULL, `after` JSON NULL, PRIMARY KEY (`id`),
 INDEX `financial_mutations_target_type_target_id_occurred_at_idx` (`target_type`, `target_id`, `occurred_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
UPDATE `receipts` r JOIN (
 SELECT p.receipt_id, MIN(g.academic_year) term FROM receipt_particulars p JOIN schedules s ON s.id=p.schedule_id JOIN schedule_groups g ON g.id=s.schedule_group_id
 GROUP BY p.receipt_id HAVING MIN(g.academic_year)=MAX(g.academic_year)
) x ON x.receipt_id=r.id SET r.academic_year=x.term;
UPDATE `ar_supporting_documents` d JOIN (
 SELECT l.ar_supporting_document_id, MIN(g.academic_year) term FROM ar_sheet_links l JOIN acknowledgement_receipts a ON a.id=l.ar_id JOIN schedules s ON s.id=a.schedule_id JOIN schedule_groups g ON g.id=s.schedule_group_id
 GROUP BY l.ar_supporting_document_id HAVING MIN(g.academic_year)=MAX(g.academic_year)
) x ON x.ar_supporting_document_id=d.id SET d.academic_year=x.term;
UPDATE `document_scans` d JOIN (
 SELECT scan_id, MIN(term) term FROM (
 SELECT a.scan_file_id scan_id,g.academic_year term FROM acknowledgement_receipts a JOIN schedules s ON s.id=a.schedule_id JOIN schedule_groups g ON g.id=s.schedule_group_id WHERE a.scan_file_id IS NOT NULL
 UNION ALL SELECT v.scan_file_id,g.academic_year FROM disbursement_vouchers v JOIN schedules s ON s.id=v.schedule_id JOIN schedule_groups g ON g.id=s.schedule_group_id WHERE v.scan_file_id IS NOT NULL
 UNION ALL SELECT scan_file_id,academic_year FROM receipts WHERE academic_year IS NOT NULL
 UNION ALL SELECT scan_file_id,academic_year FROM ar_supporting_documents WHERE academic_year IS NOT NULL
 ) ownership GROUP BY scan_id HAVING MIN(term)=MAX(term)
) x ON x.scan_id=d.id SET d.academic_year=x.term;
-- Unlinked legacy documents with no provable term remain readable but immutable.
CREATE UNIQUE INDEX `ar_sheet_links_ar_supporting_document_id_ar_id_key` ON `ar_sheet_links`(`ar_supporting_document_id`, `ar_id`);
CREATE TABLE `control_number_reservations` (`kind` VARCHAR(2) NOT NULL, `number` VARCHAR(50) NOT NULL, `target_id` INTEGER NOT NULL, PRIMARY KEY (`kind`,`number`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `control_number_reservations` (`kind`,`number`,`target_id`) SELECT 'DV',control_number,id FROM disbursement_vouchers;
INSERT INTO `control_number_reservations` (`kind`,`number`,`target_id`) SELECT 'AR',control_number,id FROM acknowledgement_receipts;
