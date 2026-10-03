-- CreateTable
CREATE TABLE `schedule_groups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `schedule_number` VARCHAR(50) NOT NULL,
    `activity_type` ENUM('IGP', 'MEMBERSHIP', 'FINES', 'EVENTS') NOT NULL,
    `academic_year` VARCHAR(20) NOT NULL,
    `semester` ENUM('FIRST', 'SECOND', 'SUMMER') NOT NULL,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `closed_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedules` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `schedule_group_id` INTEGER NOT NULL,
    `type` ENUM('INFLOW', 'OUTFLOW') NOT NULL,
    `label` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `role_type` ENUM('OFFICER', 'STUDENT', 'ADVISER', 'EXTERNAL') NOT NULL,
    `email` VARCHAR(255) NULL,
    `password_hash` VARCHAR(255) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `officer_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `position` ENUM('ADVISER', 'PRESIDENT', 'TREASURER', 'ASSISTANT_TREASURER', 'AUDITOR', 'OTHER') NOT NULL,
    `term` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_scans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `file_path` VARCHAR(500) NOT NULL,
    `uploaded_by_id` INTEGER NOT NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ocr_status` ENUM('PENDING', 'PROCESSED', 'MANUAL', 'FAILED') NOT NULL,
    `ocr_pipeline` ENUM('PRINTED', 'HANDWRITTEN', 'NONE') NULL,
    `ocr_raw_text` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `disbursement_vouchers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `control_number` VARCHAR(50) NOT NULL,
    `date` DATE NOT NULL,
    `purpose` VARCHAR(500) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `released_to_id` INTEGER NOT NULL,
    `schedule_id` INTEGER NOT NULL,
    `form_of_payment` ENUM('CASH', 'E_WALLET') NOT NULL,
    `scan_file_id` INTEGER NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `verified_by_id` INTEGER NULL,
    `verified_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `disbursement_vouchers_control_number_key`(`control_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receipts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `internal_receipt_number` VARCHAR(50) NOT NULL,
    `reference_number` VARCHAR(100) NOT NULL,
    `date` DATE NOT NULL,
    `doc_type` ENUM('RETAILER_RECEIPT', 'CERTIFICATE_OF_EXPENSES') NOT NULL,
    `scan_file_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `receipt_particulars` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_id` INTEGER NOT NULL,
    `dv_id` INTEGER NULL,
    `particular_name` VARCHAR(255) NOT NULL,
    `quantity` DECIMAL(10, 2) NOT NULL,
    `unit_cost` DECIMAL(12, 2) NOT NULL,
    `gross_amount` DECIMAL(12, 2) NOT NULL,
    `schedule_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `acknowledgement_receipts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `control_number` VARCHAR(50) NOT NULL,
    `date` DATE NOT NULL,
    `purpose` VARCHAR(500) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `remitted_by_id` INTEGER NOT NULL,
    `schedule_id` INTEGER NOT NULL,
    `form_of_payment` ENUM('CASH', 'E_WALLET') NOT NULL,
    `scan_file_id` INTEGER NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `verified_by_id` INTEGER NULL,
    `verified_at` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `acknowledgement_receipts_control_number_key`(`control_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ar_supporting_documents` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `doc_type` ENUM('COLLECTION_SHEET', 'SALES_SHEET') NOT NULL,
    `context_label` VARCHAR(255) NOT NULL,
    `period_covered` VARCHAR(100) NULL,
    `total_amount` DECIMAL(12, 2) NOT NULL,
    `scan_file_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ar_sheet_links` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ar_supporting_document_id` INTEGER NOT NULL,
    `ar_id` INTEGER NOT NULL,
    `amount_covered` DECIMAL(12, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dv_id` INTEGER NULL,
    `ar_id` INTEGER NULL,
    `event` ENUM('VERIFIED', 'UNVERIFIED', 'CLEARED_BY_EDIT') NOT NULL,
    `user_id` INTEGER NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `schedules` ADD CONSTRAINT `schedules_schedule_group_id_fkey` FOREIGN KEY (`schedule_group_id`) REFERENCES `schedule_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `officer_terms` ADD CONSTRAINT `officer_terms_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_scans` ADD CONSTRAINT `document_scans_uploaded_by_id_fkey` FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disbursement_vouchers` ADD CONSTRAINT `disbursement_vouchers_released_to_id_fkey` FOREIGN KEY (`released_to_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disbursement_vouchers` ADD CONSTRAINT `disbursement_vouchers_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disbursement_vouchers` ADD CONSTRAINT `disbursement_vouchers_scan_file_id_fkey` FOREIGN KEY (`scan_file_id`) REFERENCES `document_scans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disbursement_vouchers` ADD CONSTRAINT `disbursement_vouchers_verified_by_id_fkey` FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipts` ADD CONSTRAINT `receipts_scan_file_id_fkey` FOREIGN KEY (`scan_file_id`) REFERENCES `document_scans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipt_particulars` ADD CONSTRAINT `receipt_particulars_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipt_particulars` ADD CONSTRAINT `receipt_particulars_dv_id_fkey` FOREIGN KEY (`dv_id`) REFERENCES `disbursement_vouchers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `receipt_particulars` ADD CONSTRAINT `receipt_particulars_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acknowledgement_receipts` ADD CONSTRAINT `acknowledgement_receipts_remitted_by_id_fkey` FOREIGN KEY (`remitted_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acknowledgement_receipts` ADD CONSTRAINT `acknowledgement_receipts_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acknowledgement_receipts` ADD CONSTRAINT `acknowledgement_receipts_scan_file_id_fkey` FOREIGN KEY (`scan_file_id`) REFERENCES `document_scans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `acknowledgement_receipts` ADD CONSTRAINT `acknowledgement_receipts_verified_by_id_fkey` FOREIGN KEY (`verified_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ar_supporting_documents` ADD CONSTRAINT `ar_supporting_documents_scan_file_id_fkey` FOREIGN KEY (`scan_file_id`) REFERENCES `document_scans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ar_sheet_links` ADD CONSTRAINT `ar_sheet_links_ar_supporting_document_id_fkey` FOREIGN KEY (`ar_supporting_document_id`) REFERENCES `ar_supporting_documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ar_sheet_links` ADD CONSTRAINT `ar_sheet_links_ar_id_fkey` FOREIGN KEY (`ar_id`) REFERENCES `acknowledgement_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_events` ADD CONSTRAINT `verification_events_dv_id_fkey` FOREIGN KEY (`dv_id`) REFERENCES `disbursement_vouchers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_events` ADD CONSTRAINT `verification_events_ar_id_fkey` FOREIGN KEY (`ar_id`) REFERENCES `acknowledgement_receipts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_events` ADD CONSTRAINT `verification_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
