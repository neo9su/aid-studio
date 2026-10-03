-- ============================================================
-- 角色形态图换脸（ComfyUI ReActor 图像换脸）
--
-- aid_role_prop_scene_form_image 增加 backup_image_url 列：
--   角色形态图换脸时，把原图地址备份到 backup_image_url，
--   image_url 替换为换脸后的图。口径同 image_url（varchar(500) 可空）；
--   未换脸的图该列为 NULL。
--
-- 幂等：列不存在则 ADD，已存在则 MODIFY 为 varchar(500) 并补齐注释。
-- ============================================================
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'aid_role_prop_scene_form_image'
      AND COLUMN_NAME = 'backup_image_url'
);
SET @ddl = IF(@col_exists = 0,
    'ALTER TABLE aid_role_prop_scene_form_image ADD COLUMN backup_image_url VARCHAR(500) NULL COMMENT ''换脸前原图备份URL'' AFTER image_url',
    'ALTER TABLE aid_role_prop_scene_form_image MODIFY COLUMN backup_image_url VARCHAR(500) NULL COMMENT ''换脸前原图备份URL''');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
