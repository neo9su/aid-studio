-- v2.1.10：将所有运行时 DeepSeek V4 Pro 文本路由迁移到 Agnes 3.0 Flash。
-- 保留 DeepSeek 模型目录、历史任务、账单和旧 Skill 版本，仅替换当前可执行配置。
-- MySQL 5.7+；可重复执行。

SET NAMES utf8mb4;

SET @deepseek_v4_pro_id := (
    SELECT id FROM aid_ai_model
    WHERE model_code='deepseek-v4-pro' AND del_flag='0' LIMIT 1
);
SET @agnes30_flash_id := (
    SELECT id FROM aid_ai_model
    WHERE model_code='agnes-3.0-flash' AND status='0' AND del_flag='0' LIMIT 1
);

START TRANSACTION;

-- 生成策略的默认/候选路由全部切换；包含当前停用的旧池行，防止以后重新启用时回到 DeepSeek。
UPDATE aid_gen_agent_pool
SET model_code='agnes-3.0-flash', update_time=NOW(), update_by='installation'
WHERE model_code='deepseek-v4-pro';

-- 已保存的项目级选择如果仍指向旧模型，也同步迁移。
UPDATE aid_project_gen_config
SET model_code='agnes-3.0-flash', update_time=NOW(), update_by='installation'
WHERE model_code='deepseek-v4-pro' AND del_flag='0';

-- Skill 主记录与当前版本切换到 Agnes；历史版本保持不变，继续作为审计快照。
UPDATE aid_skill
SET model_code='agnes-3.0-flash', update_time=NOW(), update_by='installation'
WHERE model_code='deepseek-v4-pro' AND del_flag='0';

UPDATE aid_skill_version version_row
JOIN aid_skill skill ON skill.current_version_id=version_row.id
SET version_row.model_code='agnes-3.0-flash',
    version_row.model_config_json=REPLACE(
        COALESCE(version_row.model_config_json, '{}'),
        'deepseek-v4-pro', 'agnes-3.0-flash'
    ),
    version_row.update_time=NOW(),
    version_row.update_by='installation'
WHERE version_row.model_code='deepseek-v4-pro'
   OR version_row.model_config_json LIKE '%deepseek-v4-pro%';

-- 先复制业务能力绑定，再移除旧绑定；重复执行时依靠唯一键收敛。
INSERT INTO aid_ai_business_model_binding (
    func_code, model_id, capability_code, default_capability, defaults_json,
    sort_order, create_time, create_by, update_time, update_by, remark
)
SELECT binding.func_code, @agnes30_flash_id, binding.capability_code,
       binding.default_capability, binding.defaults_json, binding.sort_order,
       NOW(), 'installation', NOW(), 'installation',
       '由 DeepSeek V4 Pro 迁移至 Agnes 3.0 Flash'
FROM aid_ai_business_model_binding binding
WHERE binding.model_id=@deepseek_v4_pro_id
  AND @agnes30_flash_id IS NOT NULL
ON DUPLICATE KEY UPDATE
    default_capability=VALUES(default_capability),
    defaults_json=VALUES(defaults_json),
    sort_order=LEAST(aid_ai_business_model_binding.sort_order, VALUES(sort_order)),
    update_time=NOW(), update_by='installation', remark=VALUES(remark);

DELETE FROM aid_ai_business_model_binding
WHERE model_id=@deepseek_v4_pro_id
  AND @agnes30_flash_id IS NOT NULL;

-- 从所有文本功能池移除 DeepSeek ID。按 JSON 数字数组处理首项、中间项、末项和单项四种情况。
UPDATE aid_ai_model_func_config
SET model_ids=CAST(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  REPLACE(CAST(model_ids AS CHAR),
                    CONCAT('[', @deepseek_v4_pro_id, ']'), '[]'),
                  CONCAT('[', @deepseek_v4_pro_id, ', '), '['),
                CONCAT('[', @deepseek_v4_pro_id, ','), '['),
              CONCAT(', ', @deepseek_v4_pro_id, ','), ','),
            CONCAT(',', @deepseek_v4_pro_id, ','), ','),
          CONCAT(', ', @deepseek_v4_pro_id, ']'), ']')
        AS JSON),
    update_time=NOW(), update_by='installation'
WHERE @deepseek_v4_pro_id IS NOT NULL
  AND JSON_CONTAINS(model_ids, CAST(@deepseek_v4_pro_id AS JSON), '$');

-- 无空格 JSON 的末项形式单独收敛。
UPDATE aid_ai_model_func_config
SET model_ids=CAST(REPLACE(CAST(model_ids AS CHAR),
        CONCAT(',', @deepseek_v4_pro_id, ']'), ']') AS JSON),
    update_time=NOW(), update_by='installation'
WHERE @deepseek_v4_pro_id IS NOT NULL
  AND JSON_CONTAINS(model_ids, CAST(@deepseek_v4_pro_id AS JSON), '$');

-- 所有原含 DeepSeek 业务绑定的功能池现均已有 Agnes 绑定；确保 Agnes 出现在可选模型中。
UPDATE aid_ai_model_func_config function_config
JOIN aid_ai_business_model_binding binding
  ON binding.func_code=function_config.func_code
 AND binding.model_id=@agnes30_flash_id
SET function_config.model_ids=CASE
      WHEN JSON_CONTAINS(function_config.model_ids, CAST(@agnes30_flash_id AS JSON), '$')
        THEN function_config.model_ids
      ELSE JSON_ARRAY_APPEND(function_config.model_ids, '$', CAST(@agnes30_flash_id AS UNSIGNED))
    END,
    function_config.update_time=NOW(), function_config.update_by='installation'
WHERE function_config.del_flag='0';

COMMIT;
