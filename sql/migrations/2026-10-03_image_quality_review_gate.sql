-- ============================================================
-- Migration: 形态图质量审核门（生成 → VLM 审核 → 不合格重做 / 合格放行）
-- Date: 2026-10-03
-- Purpose:
--   为角色/场景形态图出图增加一道质量审核门。
--   出图后、落库前，用 VLM 对照该形态的规格描述判断生成图是否【明确符合】要求；
--   不合格则重做（换 seed 破幂等出全新图，最多 N 次），合格则放行。
--   - 审核调用 billingExempt（免费，内部质检，不向用户扣费）。
--   - 重做每次正常计费（与单次生成一致），上限 N 次；达上限仍不合格放行最后一张。
--   - VLM 异常/超时/输出为空 → fail-safe 按合格放行，绝不阻塞出图。
--   三个 sys_config 开关/参数（admin 可配，缺省用代码内默认值）：
--     aid.image_review.enabled       审核门开关（默认 true）
--     aid.image_review.max_attempts  最大尝试次数含首次（默认 3，钳制 1..5）
--     aid.image_review.model         审核用 VLM（默认 gemini-3.5-flash，需 supports_image_input=1）
-- ============================================================

INSERT INTO sys_config (config_name, config_key, config_value, config_type, create_by, create_time, remark)
SELECT '形态图质量审核-开关', 'aid.image_review.enabled', 'true', 'Y', 'admin', NOW(),
  '角色/场景形态图出图后是否启用 VLM 质量审核门；true=启用'
WHERE NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key = 'aid.image_review.enabled');

INSERT INTO sys_config (config_name, config_key, config_value, config_type, create_by, create_time, remark)
SELECT '形态图质量审核-最大尝试次数', 'aid.image_review.max_attempts', '3', 'Y', 'admin', NOW(),
  '审核不合格时最大尝试次数（含首次），钳制 1..5；每次重做正常计费'
WHERE NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key = 'aid.image_review.max_attempts');

INSERT INTO sys_config (config_name, config_key, config_value, config_type, create_by, create_time, remark)
SELECT '形态图质量审核-VLM模型', 'aid.image_review.model', 'gemini-3.5-flash', 'Y', 'admin', NOW(),
  '质量审核用视觉模型，必须 supports_image_input=1；gemini-3.5-flash 便宜快'
WHERE NOT EXISTS (SELECT 1 FROM sys_config WHERE config_key = 'aid.image_review.model');
