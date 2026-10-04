-- 项目级内容与发布合规模式。既有项目保持为私人自用，避免迁移后改变当前测试项目行为。
SET @schema_name := DATABASE();
SET @column_exists := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'aid_comic_project'
    AND column_name = 'compliance_profile'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `aid_comic_project` ADD COLUMN `compliance_profile` varchar(32) NOT NULL DEFAULT ''PRIVATE_ADULT'' COMMENT ''内容与发布合规模式：PRIVATE_ADULT/CN_MAINLAND/US_PLATFORMS'' AFTER `project_type`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 极少数已公开/审核中的既有项目不能迁移成“私人自用”；按原站点发布地区回填大陆模式。
UPDATE `aid_comic_project`
SET `compliance_profile` = 'CN_MAINLAND'
WHERE (`is_public` = '1' OR `status` IN (3, 4))
  AND `compliance_profile` = 'PRIVATE_ADULT';
