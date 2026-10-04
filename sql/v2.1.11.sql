-- 项目级总纲/资产圣经：独立于分集剧本，用于初始化项目级角色、场景、道具资产。
SET @schema_name := DATABASE();
SET @column_exists := (
  SELECT COUNT(1)
  FROM information_schema.columns
  WHERE table_schema = @schema_name
    AND table_name = 'aid_comic_project'
    AND column_name = 'project_outline'
);
SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `aid_comic_project` ADD COLUMN `project_outline` longtext NULL COMMENT ''项目总纲/资产圣经（独立于分集剧本）'' AFTER `project_desc`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
