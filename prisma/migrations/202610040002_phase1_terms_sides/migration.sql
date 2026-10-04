CREATE TABLE `academic_terms` (
  `name` VARCHAR(50) NOT NULL,
  `starts_on` DATE NULL,
  `ends_on` DATE NULL,
  PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `oms_settings` (
  `id` INTEGER NOT NULL,
  `current_term` VARCHAR(50) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT IGNORE INTO `academic_terms` (`name`) SELECT DISTINCT `term` FROM `officer_terms`;
INSERT IGNORE INTO `academic_terms` (`name`) SELECT DISTINCT `academic_year` FROM `schedule_groups`;
-- No dates or active term are guessed by the migration. Admin configures them.
CREATE UNIQUE INDEX `schedules_schedule_group_id_type_key` ON `schedules`(`schedule_group_id`, `type`);
